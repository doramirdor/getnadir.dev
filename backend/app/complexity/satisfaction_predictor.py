"""Satisfaction predictor — f(prompt, model) → P(task satisfied).

Predicts, BEFORE dispatch, the probability that a given model will produce a
response the verifier would accept for a given prompt. This is the per-query
joint predictor that tier-based routing lacks: the tier describes the prompt
alone, per-model stats describe the model alone — satisfaction is a property
of the pair.

Outcome definition (matches what cascade_decisions already records):
    satisfied  :=  verifier accepted (score ≥ acceptance threshold)
                   AND not escalated

Model: hierarchical Beta-Bernoulli with backoff. The prompt enters through
its context — cluster_id (semantic cluster) and tier — and evidence is
aggregated at four levels, each shrunk toward its parent:

    prior(model, tier)                      ← static quality vs tier difficulty
      └─ (model,)                           ← global outcomes for the model
           └─ (tier, model)                 ← outcomes on this difficulty band
                └─ (cluster, model)         ← outcomes on this kind of prompt
                     └─ (user, cluster, model)   ← this tenant's traffic

Each level's posterior is Beta(k·p_parent + successes, k·(1−p_parent) +
failures): with no evidence anywhere the prediction is exactly the prior, and
a level only moves the estimate in proportion to the evidence it actually
holds. Decisions use the posterior lower confidence bound, so thin evidence
cannot clear a dispatch threshold the prior wouldn't clear.

The prior maps static quality_index against a per-tier difficulty on a
logistic curve. It is a heuristic calibration to be replaced by a fitted one
(e.g. isotonic regression on accumulated verifier labels) once enough
outcomes exist; the hierarchy above it is unchanged by that swap.

Pure stdlib. Composes with model_ranker (this module answers "will it
satisfy?", the ranker answers "cheapest among those that will").
"""

from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


@dataclass
class PredictorConfig:
    # Logistic prior: P(satisfy) = sigmoid((quality_index − difficulty) / scale)
    tier_difficulty: Dict[str, float] = field(default_factory=lambda: {
        "simple": _env_float("SATPRED_DIFFICULTY_SIMPLE", 25.0),
        "medium": _env_float("SATPRED_DIFFICULTY_MEDIUM", 45.0),
        "complex": _env_float("SATPRED_DIFFICULTY_COMPLEX", 65.0),
    })
    prior_scale: float = _env_float("SATPRED_PRIOR_SCALE", 12.0)
    # Shrinkage strength: pseudo-observations carried from each parent level.
    pseudo_counts: float = _env_float("SATPRED_PSEUDO_COUNTS", 20.0)
    # LCB width for dispatch decisions.
    z_score: float = _env_float("SATPRED_Z_SCORE", 2.0)
    # Default dispatch threshold: cheapest model with lcb ≥ this gets the task.
    dispatch_threshold: float = _env_float("SATPRED_DISPATCH_THRESHOLD", 0.85)


@dataclass
class OutcomeCounts:
    successes: float = 0.0
    failures: float = 0.0

    @property
    def n(self) -> float:
        return self.successes + self.failures


@dataclass
class SatisfactionEvidence:
    """Aggregated outcomes at each backoff level. Keys:

    by_model[(model,)], by_tier_model[(tier, model)],
    by_cluster_model[(cluster_id, model)],
    by_user_cluster_model[(user_id, cluster_id, model)]
    """
    by_model: Dict[Tuple[str], OutcomeCounts] = field(default_factory=dict)
    by_tier_model: Dict[Tuple[str, str], OutcomeCounts] = field(default_factory=dict)
    by_cluster_model: Dict[Tuple[str, str], OutcomeCounts] = field(default_factory=dict)
    by_user_cluster_model: Dict[Tuple[str, str, str], OutcomeCounts] = field(default_factory=dict)


@dataclass
class SatisfactionEstimate:
    p: float                 # posterior mean P(task satisfied)
    lcb: float               # lower confidence bound (use for dispatch)
    evidence_n: float        # observations at the most specific level used
    source_level: str        # "prior" | "model" | "tier_model" | "cluster_model" | "user_cluster_model"


def _sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    e = math.exp(x)
    return e / (1.0 + e)


def prior_satisfaction(
    quality_index: float, tier: str, config: Optional[PredictorConfig] = None
) -> float:
    """P(satisfy | static quality, tier) with no outcome evidence."""
    config = config or PredictorConfig()
    difficulty = config.tier_difficulty.get(tier, config.tier_difficulty["medium"])
    return _sigmoid((quality_index - difficulty) / config.prior_scale)


def _posterior(p_parent: float, counts: Optional[OutcomeCounts], k: float, z: float) -> Tuple[float, float, float]:
    """One Beta-Bernoulli shrinkage step. Returns (p_hat, lcb, n)."""
    s = counts.successes if counts else 0.0
    f = counts.failures if counts else 0.0
    a = k * p_parent + s
    b = k * (1.0 - p_parent) + f
    p_hat = a / (a + b)
    std = math.sqrt(max(p_hat * (1.0 - p_hat) / (a + b + 1.0), 0.0))
    # Uncertainty scaled by how much of the posterior is real evidence —
    # zero evidence means the prior is trusted exactly as given.
    n = s + f
    lcb = p_hat - z * std * math.sqrt(n / (n + k)) if n > 0 else p_hat
    return p_hat, lcb, n


def predict(
    model_id: str,
    quality_index: float,
    tier: str,
    cluster_id: Optional[str] = None,
    user_id: Optional[str] = None,
    evidence: Optional[SatisfactionEvidence] = None,
    config: Optional[PredictorConfig] = None,
) -> SatisfactionEstimate:
    """f(prompt-context, model) → P(task satisfied).

    The prompt is represented by its (tier, cluster_id) context; pass what is
    available — every level is optional and the estimate degrades gracefully
    to the static prior.
    """
    config = config or PredictorConfig()
    k, z = config.pseudo_counts, config.z_score

    p = prior_satisfaction(quality_index, tier, config)
    lcb, n, level = p, 0.0, "prior"

    if evidence is None:
        return SatisfactionEstimate(p=p, lcb=lcb, evidence_n=n, source_level=level)

    chain: List[Tuple[str, Optional[OutcomeCounts]]] = [
        ("model", evidence.by_model.get((model_id,))),
        ("tier_model", evidence.by_tier_model.get((tier, model_id))),
    ]
    if cluster_id:
        chain.append(("cluster_model", evidence.by_cluster_model.get((cluster_id, model_id))))
        if user_id:
            chain.append((
                "user_cluster_model",
                evidence.by_user_cluster_model.get((user_id, cluster_id, model_id)),
            ))

    for name, counts in chain:
        if counts is None or counts.n <= 0:
            continue
        p, lcb, n = _posterior(p, counts, k, z)
        level = name

    return SatisfactionEstimate(p=p, lcb=lcb, evidence_n=n, source_level=level)


# ---------------------------------------------------------------------------
# Dispatch rule
# ---------------------------------------------------------------------------

def select_cheapest_satisfying(
    candidates: List[Dict[str, Any]],
    tier: str,
    cluster_id: Optional[str] = None,
    user_id: Optional[str] = None,
    evidence: Optional[SatisfactionEvidence] = None,
    threshold: Optional[float] = None,
    config: Optional[PredictorConfig] = None,
) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """Pick the cheapest candidate predicted to satisfy the task.

    candidates use the analyzer shape ({api_id, provider, quality_index,
    cost}). Returns (pick, annotated_candidates). Selection rule:

      1. among candidates with known price and satisfaction LCB ≥ threshold,
         pick the cheapest;
      2. if none qualify, pick the highest predicted satisfaction — when no
         model is predicted to satisfy, quality is all that's left.

    The annotated list (satisfaction p/lcb per candidate, sorted by the same
    rule) doubles as the escalation order for the cascade.
    """
    config = config or PredictorConfig()
    threshold = config.dispatch_threshold if threshold is None else threshold

    annotated = []
    for c in candidates:
        est = predict(
            c.get("api_id") or c.get("model_name") or "",
            float(c.get("quality_index", 50.0)),
            tier,
            cluster_id=cluster_id,
            user_id=user_id,
            evidence=evidence,
            config=config,
        )
        annotated.append({
            **c,
            "satisfaction_p": est.p,
            "satisfaction_lcb": est.lcb,
            "satisfaction_evidence_n": est.evidence_n,
            "satisfaction_source": est.source_level,
        })

    qualified = [
        c for c in annotated
        if c["satisfaction_lcb"] >= threshold and float(c.get("cost", 0.0)) > 0
    ]
    if qualified:
        qualified.sort(key=lambda c: (float(c["cost"]), -c["satisfaction_p"]))
        rest = [c for c in annotated if c not in qualified]
        rest.sort(key=lambda c: -c["satisfaction_p"])
        return qualified[0], qualified + rest

    annotated.sort(key=lambda c: -c["satisfaction_p"])
    return (annotated[0] if annotated else None), annotated


# ---------------------------------------------------------------------------
# Evidence aggregation from cascade_decisions rows
# ---------------------------------------------------------------------------

def evidence_from_cascade_rows(
    rows: List[Dict[str, Any]],
    acceptance_threshold: float = 0.80,
) -> SatisfactionEvidence:
    """Aggregate cascade_decisions rows into hierarchical outcome counts.

    Expects rows with cheap_model, verifier_score, escalated; cluster_id,
    user_id and tier are optional — rows missing them still contribute to
    the broader levels.
    """
    ev = SatisfactionEvidence()
    for row in rows:
        model = row.get("cheap_model")
        if not model:
            continue
        score = row.get("verifier_score")
        if score is None:
            continue
        satisfied = (float(score) >= acceptance_threshold) and not row.get("escalated")

        def _bump(table: Dict, key: tuple) -> None:
            counts = table.setdefault(key, OutcomeCounts())
            if satisfied:
                counts.successes += 1
            else:
                counts.failures += 1

        _bump(ev.by_model, (model,))
        tier = row.get("tier")
        if tier:
            _bump(ev.by_tier_model, (tier, model))
        cluster = row.get("cluster_id")
        if cluster:
            _bump(ev.by_cluster_model, (cluster, model))
            user = row.get("user_id")
            if user:
                _bump(ev.by_user_cluster_model, (user, cluster, model))
    return ev
