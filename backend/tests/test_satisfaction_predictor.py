"""Tests for f(prompt, model) → P(task satisfied) (satisfaction_predictor.py).

Loaded standalone via importlib (stdlib-only module). Invariants:

  * the prior is monotone in quality and decreasing in tier difficulty
  * with no evidence the prediction equals the prior exactly
  * the backoff chain uses the most specific evidence available, and more
    specific evidence overrides broader evidence
  * thin evidence cannot clear a dispatch threshold the prior wouldn't clear
    (LCB gating)
  * the dispatch rule picks the cheapest qualifying model, escalates to the
    best-predicted model when none qualify, and unknown pricing never wins
  * cascade-row aggregation defines satisfied = accepted AND not escalated
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))


def _load() -> types.ModuleType:
    name = "_satisfaction_predictor_test"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, os.path.join(BACKEND, "app", "complexity", "satisfaction_predictor.py")
    )
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


@pytest.fixture
def sp():
    return _load()


def _candidates():
    return [
        {"api_id": "premium", "provider": "anthropic", "quality_index": 92.0, "cost": 30.0},
        {"api_id": "strong", "provider": "openai", "quality_index": 88.0, "cost": 10.0},
        {"api_id": "value", "provider": "google", "quality_index": 80.0, "cost": 2.0},
        {"api_id": "budget", "provider": "mistral", "quality_index": 55.0, "cost": 0.5},
    ]


# ---------------------------------------------------------------------------
# Prior
# ---------------------------------------------------------------------------

def test_prior_monotone_in_quality_and_difficulty(sp):
    assert sp.prior_satisfaction(92, "complex") > sp.prior_satisfaction(55, "complex")
    assert sp.prior_satisfaction(80, "simple") > sp.prior_satisfaction(80, "complex")
    for q in (30, 55, 80, 92):
        for tier in ("simple", "medium", "complex"):
            assert 0.0 < sp.prior_satisfaction(q, tier) < 1.0


def test_no_evidence_returns_prior_exactly(sp):
    est = sp.predict("value", 80.0, "medium")
    assert est.p == pytest.approx(sp.prior_satisfaction(80.0, "medium"))
    assert est.lcb == est.p  # zero evidence → prior trusted as given
    assert est.source_level == "prior"


# ---------------------------------------------------------------------------
# Backoff chain
# ---------------------------------------------------------------------------

def test_specific_evidence_overrides_broad_evidence(sp):
    ev = sp.SatisfactionEvidence()
    # Globally the model struggles…
    ev.by_model[("value",)] = sp.OutcomeCounts(successes=40, failures=60)
    # …but on this cluster it excels.
    ev.by_cluster_model[("sql-gen", "value")] = sp.OutcomeCounts(successes=95, failures=5)

    broad = sp.predict("value", 80.0, "medium", evidence=ev)
    specific = sp.predict("value", 80.0, "medium", cluster_id="sql-gen", evidence=ev)

    assert specific.source_level == "cluster_model"
    assert broad.source_level == "model"
    assert specific.p > broad.p


def test_user_level_is_most_specific(sp):
    ev = sp.SatisfactionEvidence()
    ev.by_cluster_model[("sql-gen", "value")] = sp.OutcomeCounts(successes=90, failures=10)
    ev.by_user_cluster_model[("u1", "sql-gen", "value")] = sp.OutcomeCounts(successes=2, failures=48)

    est = sp.predict("value", 80.0, "medium", cluster_id="sql-gen", user_id="u1", evidence=ev)
    assert est.source_level == "user_cluster_model"
    # This tenant's traffic disagrees with the cluster at large — prediction
    # must drop well below the cluster-level estimate.
    cluster_only = sp.predict("value", 80.0, "medium", cluster_id="sql-gen", evidence=ev)
    assert est.p < cluster_only.p


def test_strong_evidence_moves_prediction(sp):
    ev = sp.SatisfactionEvidence()
    ev.by_model[("budget",)] = sp.OutcomeCounts(successes=480, failures=20)
    est = sp.predict("budget", 55.0, "complex", evidence=ev)
    prior = sp.prior_satisfaction(55.0, "complex")
    assert est.p > prior + 0.3  # outcomes dominate a misleading static prior


def test_thin_evidence_lcb_stays_conservative(sp):
    ev = sp.SatisfactionEvidence()
    ev.by_model[("budget",)] = sp.OutcomeCounts(successes=5, failures=0)  # 100% of 5
    est = sp.predict("budget", 55.0, "complex", evidence=ev)
    # Mean moves a little, but the LCB must not let 5 lucky samples
    # clear a high dispatch bar.
    assert est.lcb < 0.85


# ---------------------------------------------------------------------------
# Dispatch rule
# ---------------------------------------------------------------------------

def test_dispatch_picks_cheapest_qualifying(sp):
    # Simple tier, modest bar: even the budget model's prior qualifies
    # (P≈0.92 on simple tasks) — it's the cheapest, it gets the task.
    pick, ranked = sp.select_cheapest_satisfying(_candidates(), "simple", threshold=0.85)
    assert pick["api_id"] == "budget"
    assert ranked[0] is pick
    # Raise the bar and the budget model no longer qualifies; the next
    # cheapest qualifying model wins.
    pick95, _ = sp.select_cheapest_satisfying(_candidates(), "simple", threshold=0.95)
    assert pick95["api_id"] == "value"


def test_dispatch_escalates_to_best_when_none_qualify(sp):
    # Complex tier with a very high bar and no evidence: no prior clears it →
    # highest predicted satisfaction (premium) gets the task.
    pick, _ = sp.select_cheapest_satisfying(_candidates(), "complex", threshold=0.99)
    assert pick["api_id"] == "premium"


def test_dispatch_evidence_unlocks_cheaper_model(sp):
    ev = sp.SatisfactionEvidence()
    ev.by_tier_model[("complex", "value")] = sp.OutcomeCounts(successes=480, failures=20)
    no_ev, _ = sp.select_cheapest_satisfying(_candidates(), "complex", threshold=0.85)
    with_ev, _ = sp.select_cheapest_satisfying(
        _candidates(), "complex", threshold=0.85, evidence=ev
    )
    # Without evidence, "value"'s complex prior (≈0.78) misses the bar and
    # the cheapest qualifying model is "strong"; with 480/500 verified
    # outcomes on complex, "value" qualifies and wins on cost.
    assert no_ev["api_id"] == "strong"
    assert with_ev["api_id"] == "value"


def test_dispatch_unknown_price_cannot_win_on_cost(sp):
    cands = _candidates() + [
        {"api_id": "mystery", "provider": "x", "quality_index": 95.0, "cost": 0.0},
    ]
    pick, _ = sp.select_cheapest_satisfying(cands, "simple", threshold=0.85)
    assert pick["api_id"] == "budget"  # cheapest *priced* qualifier, not the "free" unknown


# ---------------------------------------------------------------------------
# Evidence aggregation
# ---------------------------------------------------------------------------

def test_evidence_from_cascade_rows(sp):
    rows = [
        {"cheap_model": "value", "verifier_score": 0.9, "escalated": False,
         "tier": "medium", "cluster_id": "sql-gen", "user_id": "u1"},
        {"cheap_model": "value", "verifier_score": 0.9, "escalated": True},   # accepted but escalated → not satisfied
        {"cheap_model": "value", "verifier_score": 0.5, "escalated": False},  # below threshold → not satisfied
        {"cheap_model": "value", "verifier_score": None, "escalated": False}, # unscored → ignored
    ]
    ev = sp.evidence_from_cascade_rows(rows, acceptance_threshold=0.8)
    assert ev.by_model[("value",)].successes == 1
    assert ev.by_model[("value",)].failures == 2
    assert ev.by_tier_model[("medium", "value")].n == 1
    assert ev.by_cluster_model[("sql-gen", "value")].n == 1
    assert ev.by_user_cluster_model[("u1", "sql-gen", "value")].n == 1
