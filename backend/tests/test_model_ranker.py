"""Tests for the unified ε-constrained model ranker (model_ranker.py).

Loaded standalone via importlib (stdlib-only module). The invariants under
test are the no-regression guarantees the ranker makes versus the legacy
per-tier sorts:

  * cold start (no online stats) preserves the static quality incumbent
  * cost can only win within the per-tier quality floor (ε=0 for complex)
  * online evidence displaces the incumbent only via lower confidence bounds
  * escalation-rate spikes trip the circuit breaker back to the static prior
  * unknown pricing (cost ≤ 0) can never win on cost
  * unhealthy providers drop to the fallback tail
  * the static best-quality model stays pinned in the top 2
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
RANKER_PATH = os.path.join(BACKEND, "app", "complexity", "model_ranker.py")


def _load_ranker() -> types.ModuleType:
    name = "_model_ranker_test"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, RANKER_PATH)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


@pytest.fixture
def ranker():
    return _load_ranker()


def _candidates():
    """Quality/cost spread mirroring a typical 4-model preset."""
    return [
        {"api_id": "premium", "model_name": "premium", "provider": "anthropic",
         "quality_index": 92.0, "cost": 30.0},
        {"api_id": "strong", "model_name": "strong", "provider": "openai",
         "quality_index": 88.0, "cost": 10.0},
        {"api_id": "value", "model_name": "value", "provider": "google",
         "quality_index": 80.0, "cost": 2.0},
        {"api_id": "budget", "model_name": "budget", "provider": "mistral",
         "quality_index": 55.0, "cost": 0.5},
    ]


# ---------------------------------------------------------------------------
# Cold start — must preserve the static quality decisions
# ---------------------------------------------------------------------------

def test_cold_start_complex_keeps_quality_incumbent(ranker):
    ranked = ranker.rank_models("complex", 0.9, _candidates())
    assert ranked[0]["api_id"] == "premium"  # ε=0: quality is untouchable


def test_cold_start_medium_picks_cheapest_within_epsilon(ranker):
    # ε=0.05*0.9 = 0.045 → floor 0.92-0.045 = 0.875: premium and strong
    # qualify; strong is cheaper. "value" (0.80) must NOT win even though its
    # legacy quality/cost ratio (40) dwarfs everyone else's.
    ranked = ranker.rank_models("medium", 0.9, _candidates())
    assert ranked[0]["api_id"] == "strong"
    assert ranked[0]["in_floor_set"]


def test_cold_start_simple_never_picks_garbage_quality(ranker):
    # Legacy simple-tier sorted purely by cost and would pick "budget" (q=55).
    # ε=0.15*0.9=0.135 → floor 0.92-0.135 = 0.785: "value" is the cheapest
    # candidate that clears it.
    ranked = ranker.rank_models("simple", 0.9, _candidates())
    assert ranked[0]["api_id"] == "value"
    budget = next(c for c in ranked if c["api_id"] == "budget")
    assert not budget["in_floor_set"]


def test_low_confidence_promotes_tier(ranker):
    # confidence below the promotion threshold: simple is ranked with the
    # medium tier's ε, and the low confidence also shrinks the tolerance
    # (floor = 0.92 − 0.05·0.5 = 0.895) — uncertainty buys quality, so even
    # "strong" (0.88) is excluded and the incumbent wins.
    ranked = ranker.rank_models("simple", 0.5, _candidates())
    assert ranked[0]["effective_tier"] == "medium"
    assert ranked[0]["api_id"] == "premium"
    # At high confidence the same simple-tier request picks "value" instead.
    assert ranker.rank_models("simple", 0.9, _candidates())[0]["api_id"] == "value"


# ---------------------------------------------------------------------------
# Online evidence — LCB-gated displacement
# ---------------------------------------------------------------------------

def test_strong_evidence_lets_cheap_model_win_complex(ranker):
    stats = {"value": ranker.OnlineModelStats(verifier_mean=0.99, n=1000)}
    ranked = ranker.rank_models("complex", 0.9, _candidates(), stats=stats)
    assert ranked[0]["api_id"] == "value"
    # Guardrail: the static incumbent must remain immediately behind.
    assert ranked[1]["api_id"] == "premium"


def test_thin_evidence_cannot_displace_incumbent(ranker):
    # Same great verifier mean but only a handful of observations: the LCB
    # stays below the incumbent and the static ranking must hold.
    stats = {"value": ranker.OnlineModelStats(verifier_mean=0.99, n=10)}
    ranked = ranker.rank_models("complex", 0.9, _candidates(), stats=stats)
    assert ranked[0]["api_id"] == "premium"


def test_escalation_spike_trips_circuit_breaker(ranker):
    good = {"value": ranker.OnlineModelStats(
        verifier_mean=0.99, n=1000, escalation_rate=0.1, baseline_escalation_rate=0.1)}
    tripped = {"value": ranker.OnlineModelStats(
        verifier_mean=0.99, n=1000, escalation_rate=0.5, baseline_escalation_rate=0.1)}
    assert ranker.rank_models("complex", 0.9, _candidates(), stats=good)[0]["api_id"] == "value"
    assert ranker.rank_models("complex", 0.9, _candidates(), stats=tripped)[0]["api_id"] == "premium"


def test_escalation_rate_penalizes_verifier_mean(ranker):
    # High verifier mean but high escalation rate (within breaker limits):
    # the adverse-selection penalty must keep the incumbent on top.
    stats = {"value": ranker.OnlineModelStats(
        verifier_mean=0.95, n=1000, escalation_rate=0.45, baseline_escalation_rate=0.3)}
    ranked = ranker.rank_models("complex", 0.9, _candidates(), stats=stats)
    assert ranked[0]["api_id"] == "premium"


# ---------------------------------------------------------------------------
# Pricing and health guards
# ---------------------------------------------------------------------------

def test_unknown_cost_cannot_win_on_cost(ranker):
    cands = _candidates() + [
        {"api_id": "mystery", "model_name": "mystery", "provider": "unknown",
         "quality_index": 95.0, "cost": 0.0},  # unknown pricing, not free
    ]
    ranked = ranker.rank_models("simple", 0.9, cands)
    mystery = next(c for c in ranked if c["api_id"] == "mystery")
    assert not mystery["in_floor_set"]


def test_unhealthy_provider_demoted_to_tail(ranker):
    health = {"openai": 0.1}  # strong's provider is degraded
    ranked = ranker.rank_models("medium", 0.9, _candidates(), health=health)
    assert ranked[0]["api_id"] == "premium"  # only premium clears the floor now
    strong = next(c for c in ranked if c["api_id"] == "strong")
    assert not strong["in_floor_set"]


def test_static_top_pinned_in_top_two(ranker):
    ranked = ranker.rank_models("simple", 0.9, _candidates())
    assert "premium" in {ranked[0]["api_id"], ranked[1]["api_id"]}


def test_empty_candidates(ranker):
    assert ranker.rank_models("complex", 0.9, []) == []
    assert ranker.select_model("complex", 0.9, []) == (None, None, [])


def test_cost_fn_override_changes_floor_set_order(ranker):
    # An effective-cost function (e.g. compression_policy) that makes
    # "premium" cheaper than "strong" must flip the medium-tier order.
    eff = {"premium": 4.0, "strong": 9.0, "value": 2.0, "budget": 0.5}
    ranked = ranker.rank_models(
        "medium", 0.9, _candidates(), cost_fn=lambda c: eff[c["api_id"]]
    )
    assert ranked[0]["api_id"] == "premium"


# ---------------------------------------------------------------------------
# Stats aggregation
# ---------------------------------------------------------------------------

def test_stats_from_cascade_rows(ranker):
    rows = [
        {"cheap_model": "value", "verifier_score": 0.9, "escalated": False},
        {"cheap_model": "value", "verifier_score": 0.7, "escalated": True},
        {"cheap_model": "budget", "verifier_score": None, "escalated": True},
    ]
    stats = ranker.stats_from_cascade_rows(rows, baseline_escalation_rate=0.2)
    assert stats["value"].n == 2
    assert stats["value"].verifier_mean == pytest.approx(0.8)
    assert stats["value"].escalation_rate == pytest.approx(0.5)
    assert stats["value"].baseline_escalation_rate == 0.2
    assert stats["budget"].n == 0  # no scored requests


# ---------------------------------------------------------------------------
# Analyzer wiring — heuristic classifier
# ---------------------------------------------------------------------------

def _load_heuristic() -> types.ModuleType:
    name = "_heuristic_ranker_test"
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(
        name, os.path.join(BACKEND, "app", "complexity", "heuristic_classifier.py")
    )
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def test_heuristic_falls_back_to_legacy_without_ranker(monkeypatch):
    heuristic = _load_heuristic()
    monkeypatch.setitem(sys.modules, "app.complexity.model_ranker", None)
    clf = heuristic.HeuristicClassifier(allowed_models=["gpt-4o-mini", "gpt-4o"])
    model, provider = clf._select_model("complex", 0.9)
    assert model  # legacy sort still selects something


def test_heuristic_uses_shared_ranker_when_available(monkeypatch):
    heuristic = _load_heuristic()
    ranker_mod = _load_ranker()
    app_pkg = types.ModuleType("app")
    complexity_pkg = types.ModuleType("app.complexity")
    complexity_pkg.model_ranker = ranker_mod
    monkeypatch.setitem(sys.modules, "app", app_pkg)
    monkeypatch.setitem(sys.modules, "app.complexity", complexity_pkg)
    monkeypatch.setitem(sys.modules, "app.complexity.model_ranker", ranker_mod)

    clf = heuristic.HeuristicClassifier()
    monkeypatch.setattr(clf, "_get_candidate_models", _candidates)
    model, provider = clf._select_model("simple", 0.9)
    # ε-constrained pick, not the legacy cheapest-regardless-of-quality pick
    assert model == "value"
    assert provider == "google"
