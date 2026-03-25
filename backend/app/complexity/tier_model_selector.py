"""
Tier-to-Model Selector — maps abstract complexity tiers to concrete models.

The classifier outputs: SIMPLE / MEDIUM / COMPLEX
This module maps those tiers to the user's configured models sorted by price.

Works with ANY provider — Anthropic, OpenAI, Google, Bedrock, etc.
The user just picks their models; the selector assigns tiers by cost.
"""

import logging
from typing import Dict, List, Optional, Tuple

import litellm

logger = logging.getLogger(__name__)

# Tier indices (0-based for array access)
TIER_SIMPLE = 0
TIER_MEDIUM = 1
TIER_COMPLEX = 2


def _get_model_cost(model_id: str) -> float:
    """Get blended cost per 1M tokens from LiteLLM's pricing database."""
    try:
        cost_info = litellm.model_cost.get(model_id, {})
        input_cost = cost_info.get("input_cost_per_token", 0) * 1_000_000
        output_cost = cost_info.get("output_cost_per_token", 0) * 1_000_000
        # Blended: assume 1:1 input:output ratio
        return (input_cost + output_cost) / 2
    except Exception:
        return 0.0


def sort_models_by_cost(models: List[str]) -> List[Dict[str, any]]:
    """
    Sort models by cost (cheapest first) using LiteLLM pricing.

    Returns list of {model, cost, tier_index} dicts.
    """
    costed = []
    for m in models:
        cost = _get_model_cost(m)
        costed.append({"model": m, "cost": cost})

    # Sort by cost ascending (cheapest first)
    costed.sort(key=lambda x: x["cost"])

    # Assign tier indices based on position
    n = len(costed)
    for i, entry in enumerate(costed):
        if n == 1:
            entry["tier_index"] = TIER_COMPLEX  # Only model = use for everything
        elif n == 2:
            entry["tier_index"] = TIER_SIMPLE if i == 0 else TIER_COMPLEX
        else:
            # 3+ models: divide into thirds
            if i < n / 3:
                entry["tier_index"] = TIER_SIMPLE
            elif i < 2 * n / 3:
                entry["tier_index"] = TIER_MEDIUM
            else:
                entry["tier_index"] = TIER_COMPLEX

    return costed


def select_model_for_tier(
    tier_name: str,
    user_models: List[str],
) -> Tuple[str, str, float, List[Dict]]:
    """
    Select the best model for a given complexity tier from the user's model pool.

    Args:
        tier_name: "simple", "medium", or "complex"
        user_models: list of model IDs the user has configured

    Returns:
        (selected_model, provider, cost, ranked_models)
    """
    if not user_models:
        return "gpt-4o-mini", "openai", 0.0, []

    sorted_models = sort_models_by_cost(user_models)

    tier_map = {"simple": TIER_SIMPLE, "medium": TIER_MEDIUM, "complex": TIER_COMPLEX}
    target_tier = tier_map.get(tier_name, TIER_MEDIUM)

    # Find models matching the target tier
    tier_models = [m for m in sorted_models if m["tier_index"] == target_tier]

    # If no models at target tier, find closest
    if not tier_models:
        if target_tier == TIER_SIMPLE:
            # Use cheapest available
            tier_models = [sorted_models[0]]
        elif target_tier == TIER_COMPLEX:
            # Use most expensive available
            tier_models = [sorted_models[-1]]
        else:
            # Medium: use the middle model, or cheapest if only 2
            mid = len(sorted_models) // 2
            tier_models = [sorted_models[mid]]

    selected = tier_models[0]
    model_id = selected["model"]
    provider = model_id.split("/")[0] if "/" in model_id else _guess_provider(model_id)

    # Build ranked list for response metadata
    ranked = []
    for m in sorted_models:
        tier_label = {TIER_SIMPLE: "simple", TIER_MEDIUM: "medium", TIER_COMPLEX: "complex"}[m["tier_index"]]
        ranked.append({
            "model_name": m["model"],
            "provider": m["model"].split("/")[0] if "/" in m["model"] else _guess_provider(m["model"]),
            "cost_per_million_tokens": m["cost"],
            "assigned_tier": tier_label,
            "selected": m["model"] == model_id,
        })

    return model_id, provider, selected["cost"], ranked


def get_benchmark_model(user_models: List[str]) -> Optional[str]:
    """
    Auto-select the benchmark model = most expensive in the user's pool.

    This is the model costs are compared against for savings calculation.
    """
    if not user_models:
        return None

    sorted_models = sort_models_by_cost(user_models)
    return sorted_models[-1]["model"]  # Most expensive


def _guess_provider(model_id: str) -> str:
    """Guess provider from model name."""
    lower = model_id.lower()
    if "claude" in lower or "haiku" in lower or "sonnet" in lower or "opus" in lower:
        return "anthropic"
    if "gpt" in lower or "o1" in lower or "o3" in lower or "o4" in lower:
        return "openai"
    if "gemini" in lower or "palm" in lower:
        return "google"
    if "bedrock" in lower:
        return "aws"
    if "mistral" in lower or "mixtral" in lower:
        return "mistral"
    if "llama" in lower:
        return "meta"
    return "unknown"


def format_tier_assignment(user_models: List[str]) -> str:
    """Pretty-print the tier assignments for debugging/logging."""
    sorted_models = sort_models_by_cost(user_models)
    tier_labels = {TIER_SIMPLE: "SIMPLE", TIER_MEDIUM: "MEDIUM", TIER_COMPLEX: "COMPLEX"}
    lines = []
    for m in sorted_models:
        tier = tier_labels[m["tier_index"]]
        lines.append(f"  {tier:8s} → {m['model']:40s} (${m['cost']:.2f}/1M)")
    return "\n".join(lines)
