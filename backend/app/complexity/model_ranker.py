"""Unified model ranker — ε-constrained cost minimization with online evidence.

Replaces the per-analyzer sorts (complex → quality desc, medium → quality/cost
ratio, simple → cost asc) with one algorithm shared by every analyzer:

    minimize cost  subject to  quality ≥ (best achievable) − ε(tier)

This is the constrained form of the cost-quality objective (Hybrid LLM,
FrugalGPT): ε is directly interpretable as "tolerated quality slack" and is 0
for the complex tier, so quality ordering there can only change on measured
evidence, never on price. The legacy ratio sort could pick a dramatically
worse model when it was cheap enough; the legacy simple-tier sort picked the
cheapest model regardless of quality. Both regressions are impossible here.

Quality per candidate blends the static quality_index prior with online
verifier evidence using empirical-Bayes shrinkage:

    q_hat = (k·q_static + n·v_adj) / (k + n)
    v_adj = verifier_mean − μ·escalation_rate     (adverse-selection penalty)

and evidence is promote-only: admission above the static prior requires the
lower confidence bound

    q_lcb = q_hat − z·sqrt(q_hat·(1−q_hat))·sqrt(n)/(k+n)

to clear a floor anchored at the best *static* quality in the pool, while a
model's membership can never fall below its own static prior — so a noisy,
biased, or drifting verifier cannot evict the catalog's good models, and
below the min-evidence sample gate online stats are ignored entirely. With
no stats the ranker reduces to the static prior by construction. An
escalation-rate circuit breaker additionally discards a model's online stats
when its escalation rate spikes above baseline (verifier-drift detector),
and provider health demotes unhealthy candidates to the fallback tail.

Pure stdlib, O(M log M) over M ≤ ~100 candidates, < 1 ms on CPU.
"""

from __future__ import annotations

import json
import logging
import math
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_TIER_ORDER = ("simple", "medium", "complex")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


@dataclass
class RankerConfig:
    """Tunables for the ε-constrained ranker (env-overridable)."""

    # Tolerated quality slack per tier, in normalized quality units (0–1 scale,
    # i.e. quality_index/100). complex=0: never trade quality for cost there.
    epsilon: Dict[str, float] = field(default_factory=lambda: {
        "simple": _env_float("RANKER_EPSILON_SIMPLE", 0.15),
        "medium": _env_float("RANKER_EPSILON_MEDIUM", 0.05),
        "complex": _env_float("RANKER_EPSILON_COMPLEX", 0.0),
    })
    # Pseudo-count weight of the static quality prior in the blend.
    pseudo_counts: float = _env_float("RANKER_PSEUDO_COUNTS", 20.0)
    # LCB width (2.0 ≈ one-sided 97.7% — sized so a +1σ draw from a
    # σ=0.15-miscalibrated verifier at the min-evidence boundary cannot
    # clear the floor, while genuine large-sample evidence still does).
    z_score: float = _env_float("RANKER_Z_SCORE", 2.0)
    # Escalation-rate penalty on the verifier mean (adverse-selection bias).
    escalation_penalty: float = _env_float("RANKER_ESCALATION_PENALTY", 0.5)
    # Online stats are ignored entirely below this sample count — thin
    # evidence is pure churn risk, not signal.
    min_evidence: float = _env_float("RANKER_MIN_EVIDENCE", 30.0)
    # Discard online stats when escalation rate exceeds mult × baseline.
    escalation_breaker_mult: float = _env_float("RANKER_ESCALATION_BREAKER", 2.0)
    # Candidates whose provider health drops below this go to the fallback tail.
    min_health: float = _env_float("RANKER_MIN_HEALTH", 0.5)
    # Below this classifier confidence the request is promoted one tier.
    promote_below_confidence: float = _env_float("RANKER_PROMOTE_CONFIDENCE", 0.7)
    # Keep the static best-quality candidate within the top 2 of the ranking
    # so the fallback chain reaches it early.
    pin_static_top: bool = os.getenv("RANKER_PIN_STATIC_TOP", "true").lower() != "false"


@dataclass
class OnlineModelStats:
    """Rolling per-model evidence (e.g. aggregated from cascade_decisions)."""

    verifier_mean: float = 0.0          # mean verifier score [0, 1]
    n: float = 0.0                      # effective sample count
    escalation_rate: float = 0.0        # share of requests escalated
    baseline_escalation_rate: float = 0.0  # trailing baseline for the breaker


# ---------------------------------------------------------------------------
# Shared candidate loading (one source of truth for all analyzers)
# ---------------------------------------------------------------------------

_performance_data: Optional[List[Dict]] = None


def _load_performance_data() -> List[Dict]:
    global _performance_data
    if _performance_data is None:
        try:
            path = os.path.join(
                os.path.dirname(__file__), "..", "reference_data",
                "model_performance_clean.json",
            )
            with open(path) as f:
                _performance_data = json.load(f).get("models", [])
        except Exception as err:
            logger.warning("model_ranker: could not load performance data: %s", err)
            _performance_data = []
    return _performance_data


def load_candidate_models(
    allowed_providers: Optional[List[str]] = None,
    allowed_models: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Build the candidate list (same shape as the analyzers' versions).

    Unknown models are included with quality_index=30 and cost=0.0; the
    ranker treats cost ≤ 0 as *unknown pricing*, never as free.
    """
    candidates: List[Dict[str, Any]] = []
    for model in _load_performance_data():
        api_id = model.get("api_id", "")
        model_name = model.get("model", "")
        provider = model.get("api_provider", "").lower()
        route = (model.get("other", {}).get("other", {}).get("route", "") or "").lower()

        if allowed_providers:
            allowed_lower = [p.lower() for p in allowed_providers]
            if provider not in allowed_lower and route not in allowed_lower:
                continue
        if allowed_models:
            if not any(a in (model_name, api_id) for a in allowed_models):
                continue

        perf = model.get("other", {}).get("performance", {})
        pricing = model.get("other", {}).get("pricing", {})
        try:
            quality_index = float(perf.get("quality_index", 50))
        except (ValueError, TypeError):
            quality_index = 50.0
        try:
            cost = float(pricing.get("blended_usd1m_tokens", 1.0))
        except (ValueError, TypeError):
            cost = 1.0

        candidates.append({
            "api_id": api_id,
            "model_name": model_name,
            "provider": route or provider,
            "quality_index": quality_index,
            "cost": cost,
        })

    known_ids = {c["api_id"] for c in candidates}
    for m in (allowed_models or []):
        if m not in known_ids:
            provider = m.split("/")[0] if "/" in m else "unknown"
            candidates.append({
                "api_id": m,
                "model_name": m,
                "provider": provider,
                "quality_index": 30.0,
                "cost": 0.0,
            })
    return candidates


# ---------------------------------------------------------------------------
# Core algorithm
# ---------------------------------------------------------------------------

def _blend_quality(
    q_static: float,
    stats: Optional[OnlineModelStats],
    config: RankerConfig,
) -> Tuple[float, float]:
    """Return (q_hat, q_lcb) on the 0–1 scale."""
    q = min(max(q_static / 100.0, 0.0), 1.0)

    if stats is None or stats.n < config.min_evidence:
        return q, q

    # Circuit breaker: escalation-rate spike means the verifier stats can no
    # longer be trusted for this model (drift / distribution shift).
    if (
        stats.baseline_escalation_rate > 0
        and stats.escalation_rate
        > config.escalation_breaker_mult * stats.baseline_escalation_rate
    ):
        return q, q

    v_adj = min(max(
        stats.verifier_mean - config.escalation_penalty * stats.escalation_rate,
        0.0), 1.0)
    k = config.pseudo_counts
    n = stats.n
    q_hat = (k * q + n * v_adj) / (k + n)
    # Uncertainty reflects only the online evidence: zero at n=0 (the prior is
    # trusted exactly as the legacy ranker trusted it), peaks while evidence is
    # thin, decays ~1/sqrt(n) once it dominates.
    penalty = config.z_score * math.sqrt(max(q_hat * (1 - q_hat), 0.0)) * (
        math.sqrt(n) / (k + n)
    )
    return q_hat, max(q_hat - penalty, 0.0)


def effective_tier(tier_name: str, confidence: float, config: Optional[RankerConfig] = None) -> str:
    """Promote one tier when the classifier is unsure — uncertainty buys
    quality, never cost."""
    config = config or RankerConfig()
    if tier_name not in _TIER_ORDER:
        return "medium"
    if confidence < config.promote_below_confidence and tier_name != "complex":
        return _TIER_ORDER[_TIER_ORDER.index(tier_name) + 1]
    return tier_name


def rank_models(
    tier_name: str,
    confidence: float,
    candidates: List[Dict[str, Any]],
    stats: Optional[Dict[str, OnlineModelStats]] = None,
    health: Optional[Dict[str, float]] = None,
    cost_fn: Optional[Callable[[Dict[str, Any]], Optional[float]]] = None,
    config: Optional[RankerConfig] = None,
) -> List[Dict[str, Any]]:
    """Rank candidates for a tier. Returns enriched copies of the candidate
    dicts, best first, annotated with q_hat / q_lcb / in_floor_set / rank_reason.

    stats   — per api_id OnlineModelStats (absent → cold start = static prior)
    health  — health score per api_id or provider (absent → healthy)
    cost_fn — optional effective-cost override (e.g. compression_policy);
              returning None or ≤ 0 means "unknown price, cannot win on cost"
    """
    config = config or RankerConfig()
    if not candidates:
        return []

    tier = effective_tier(tier_name, confidence, config)

    enriched: List[Dict[str, Any]] = []
    for c in candidates:
        model_id = c.get("api_id") or c.get("model_name") or ""
        q_hat, q_lcb = _blend_quality(
            float(c.get("quality_index", 50.0)),
            (stats or {}).get(model_id),
            config,
        )
        h = 1.0
        if health:
            h = health.get(model_id, health.get(c.get("provider", ""), 1.0))
        raw_cost = cost_fn(c) if cost_fn else c.get("cost", 0.0)
        try:
            cost = float(raw_cost) if raw_cost is not None else 0.0
        except (TypeError, ValueError):
            cost = 0.0
        enriched.append({
            **c,
            "q_hat": q_hat,
            "q_lcb": q_lcb,
            "health": h,
            "effective_cost": cost,
            "effective_tier": tier,
        })

    healthy = [c for c in enriched if c["health"] >= config.min_health]
    pool = healthy or enriched  # all unhealthy → rank everyone (fail-open)

    # Promote-only evidence policy. The floor is anchored at the best *static*
    # prior, and each candidate's membership quality is max(static, LCB):
    #
    #   * online evidence can PROMOTE a cheap model into the floor set (its
    #     LCB must clear the static-anchored floor — noise-resistant because
    #     the bar never drops),
    #   * online evidence can never DEMOTE a model below its static prior, so
    #     a noisy or biased verifier cannot evict the catalog's good models —
    #     under any verifier behavior the floor set contains at least the
    #     static ranking's choices. Per-request demotion of genuinely bad
    #     responses is the cascade verifier's job at runtime.
    q_static_star = max(
        min(max(float(c.get("quality_index", 0.0)) / 100.0, 0.0), 1.0) for c in pool
    )
    confidence = min(max(confidence, 0.0), 1.0)
    floor = q_static_star - config.epsilon.get(tier, 0.0) * confidence

    for c in enriched:
        q_static = min(max(float(c.get("quality_index", 0.0)) / 100.0, 0.0), 1.0)
        c["q_member"] = max(c["q_lcb"], q_static)

    # Floor set: healthy, quality clearing the floor (statically, or proven at
    # the LCB), and priced — cost ≤ 0 means unknown pricing, never "free".
    floor_set = [
        c for c in pool if c["q_member"] >= floor and c["effective_cost"] > 0
    ]

    if floor_set:
        floor_set.sort(key=lambda c: (c["effective_cost"], -c["q_hat"]))
        for c in floor_set:
            c["in_floor_set"] = True
            c["rank_reason"] = (
                f"min-cost within ε of best quality (tier={tier}, "
                f"floor={floor:.3f}, q_lcb={c['q_lcb']:.3f})"
            )

    # Tail: everything else, quality-first — this is the fallback/escalation
    # order, so quality matters more than price out here.
    tail = [c for c in enriched if c not in floor_set]
    tail.sort(key=lambda c: (-c["q_hat"], c["effective_cost"]))
    for c in tail:
        c["in_floor_set"] = False
        c.setdefault("rank_reason", "outside floor set (quality-first fallback order)")

    ranked = floor_set + tail

    # Guardrail: keep the static best-quality candidate near the head so the
    # fallback chain reaches it immediately if the cheap pick disappoints.
    if config.pin_static_top and len(ranked) > 2:
        static_top = max(pool, key=lambda c: float(c.get("quality_index", 0.0)))
        idx = ranked.index(static_top)
        if idx > 1:
            ranked.remove(static_top)
            ranked.insert(1, static_top)
            static_top["rank_reason"] = "pinned: static best-quality guardrail"

    return ranked


def select_model(
    tier_name: str,
    confidence: float,
    candidates: List[Dict[str, Any]],
    **kwargs: Any,
) -> Tuple[Optional[str], Optional[str], List[Dict[str, Any]]]:
    """Convenience wrapper: returns (api_id, provider, full_ranking)."""
    ranked = rank_models(tier_name, confidence, candidates, **kwargs)
    if not ranked:
        return None, None, []
    best = ranked[0]
    return best.get("api_id"), best.get("provider"), ranked


# ---------------------------------------------------------------------------
# Online stats aggregation (pure; DB read wiring lands with the bandit cycle)
# ---------------------------------------------------------------------------

def stats_from_cascade_rows(
    rows: List[Dict[str, Any]],
    baseline_escalation_rate: float = 0.0,
) -> Dict[str, OnlineModelStats]:
    """Aggregate cascade_decisions rows into per-model OnlineModelStats.

    Expects rows with cheap_model, verifier_score, escalated — the columns
    persisted by cascade_router._log_decision().
    """
    by_model: Dict[str, Dict[str, float]] = {}
    for row in rows:
        model = row.get("cheap_model")
        if not model:
            continue
        agg = by_model.setdefault(model, {"sum": 0.0, "n": 0.0, "escalated": 0.0})
        score = row.get("verifier_score")
        if score is not None:
            agg["sum"] += float(score)
            agg["n"] += 1
        if row.get("escalated"):
            agg["escalated"] += 1

    out: Dict[str, OnlineModelStats] = {}
    for model, agg in by_model.items():
        total = max(agg["n"], 1.0)
        out[model] = OnlineModelStats(
            verifier_mean=agg["sum"] / total,
            n=agg["n"],
            escalation_rate=agg["escalated"] / total,
            baseline_escalation_rate=baseline_escalation_rate,
        )
    return out
