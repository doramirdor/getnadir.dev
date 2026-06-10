"""Compression-aware effective-cost ranking for the smart router.

The complexity analyzers rank candidate models with a 1:1 input/output blend
of list prices. Real routed traffic is input-heavy (agentic and RAG workloads
commonly run 3:1 or higher), and two levers change what input tokens
*actually* cost:

- the context-optimize layer shrinks billable input (safe/aggressive/kompress)
- provider prompt caching bills cached prefix reads at a fraction of list
  price (Anthropic ~10%, OpenAI ~50%, Gemini ~25%)

``effective_cost_per_million`` folds both into one comparable number, and
``rerank_equal_quality`` swaps the analyzer's pick for a same-quality
candidate only when that candidate is effectively cheaper. Quality ordering
is never changed, so routing accuracy is unaffected — this is purely a
tie-break on cost.

Only used to compare routing candidates — never to calculate billed cost.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Typical input:output token ratio for routed traffic. Input-heavy workloads
# make input price (and therefore compression/caching) dominate.
DEFAULT_INPUT_OUTPUT_RATIO = 3.0

# Expected input-token reduction per optimize mode. Conservative versions of
# the benchmark_6way / optimize.html measurements; only affects candidate
# comparison, never billing.
MODE_COMPRESSION_FACTOR = {
    "off": 0.0,
    "safe": 0.30,
    "aggressive": 0.45,
    "kompress": 0.60,
}

# Fallback cache-read multipliers when litellm has no cache_read pricing for
# the model. Mirrors _CACHE_READ_MULTIPLIER in production_completion.py.
_CACHE_READ_MULTIPLIER = {
    "anthropic": 0.1,
    "openai": 0.5,
    "google": 0.25,
}

# ranked_models entries within this many quality_index points of the selected
# model count as "equal quality" and are eligible for the cost tie-break.
QUALITY_EPSILON = 1.0


def _guess_provider(model_id: str) -> str:
    lower = model_id.lower()
    if "claude" in lower or "haiku" in lower or "sonnet" in lower or "opus" in lower:
        return "anthropic"
    if "gpt" in lower or lower.startswith(("o1", "o3", "o4")) or "openai" in lower:
        return "openai"
    if "gemini" in lower or "palm" in lower:
        return "google"
    return "unknown"


def _pricing(model_id: str) -> Dict[str, Any]:
    try:
        import litellm
        for key in (model_id, model_id.split("/")[-1]):
            info = litellm.model_cost.get(key)
            if info:
                return info
    except Exception:
        pass
    return {}


def effective_cost_per_million(
    model_id: str,
    optimize_mode: str = "off",
    cache_hit_rate: float = 0.0,
    input_output_ratio: float = DEFAULT_INPUT_OUTPUT_RATIO,
) -> Optional[float]:
    """Blended $/1M tokens after expected compression and cache discounts.

    Returns None when litellm has no pricing for the model (callers must not
    treat unknown pricing as free).
    """
    info = _pricing(model_id)
    input_cost = float(info.get("input_cost_per_token") or 0) * 1_000_000
    output_cost = float(info.get("output_cost_per_token") or 0) * 1_000_000
    if input_cost <= 0 and output_cost <= 0:
        return None

    cache_read = info.get("cache_read_input_token_cost")
    if cache_read:
        cache_read_cost = float(cache_read) * 1_000_000
    else:
        mult = _CACHE_READ_MULTIPLIER.get(_guess_provider(model_id), 1.0)
        cache_read_cost = input_cost * mult

    compression = MODE_COMPRESSION_FACTOR.get(optimize_mode, 0.0)
    cache_hit_rate = min(max(cache_hit_rate, 0.0), 1.0)

    # Cached prefix reads bill at the discounted rate; compression applies to
    # the un-cached share of input (the prefix must stay byte-stable to hit).
    effective_input = (
        input_cost * (1 - cache_hit_rate) * (1 - compression)
        + cache_read_cost * cache_hit_rate
    )

    input_weight = input_output_ratio / (input_output_ratio + 1)
    return effective_input * input_weight + output_cost * (1 - input_weight)


def rerank_equal_quality(
    selected_model: str,
    ranked_models: List[Dict[str, Any]],
    optimize_mode: str = "off",
    cache_hit_rate: float = 0.0,
) -> Tuple[str, Optional[str]]:
    """Swap to a same-quality, effectively-cheaper candidate when one exists.

    Returns (model, reason). reason is None when the selection is unchanged.
    Only candidates whose quality_index is within QUALITY_EPSILON of the
    selected model's are considered, so the tier/quality decision the
    analyzer made is preserved.
    """
    if optimize_mode == "off" or not ranked_models:
        return selected_model, None

    def _model_id(entry: Dict[str, Any]) -> Optional[str]:
        return entry.get("api_id") or entry.get("model_name")

    selected_entry = next(
        (r for r in ranked_models if _model_id(r) == selected_model), None
    )
    if not selected_entry or selected_entry.get("quality_index") is None:
        return selected_model, None

    selected_eff = effective_cost_per_million(
        selected_model, optimize_mode=optimize_mode, cache_hit_rate=cache_hit_rate
    )
    if selected_eff is None:
        return selected_model, None

    selected_quality = float(selected_entry["quality_index"])
    best_model, best_eff = selected_model, selected_eff

    for entry in ranked_models:
        model_id = _model_id(entry)
        quality = entry.get("quality_index")
        if not model_id or model_id == selected_model or quality is None:
            continue
        if float(quality) < selected_quality - QUALITY_EPSILON:
            continue
        eff = effective_cost_per_million(
            model_id, optimize_mode=optimize_mode, cache_hit_rate=cache_hit_rate
        )
        if eff is not None and eff < best_eff:
            best_model, best_eff = model_id, eff

    if best_model != selected_model:
        reason = (
            f"effective-cost rerank ({optimize_mode}): {best_model} "
            f"(${best_eff:.2f}/1M effective) over {selected_model} "
            f"(${selected_eff:.2f}/1M effective) at equal quality"
        )
        logger.info(reason)
        return best_model, reason

    return selected_model, None
