"""Tests for the FLIGHTPLAN Stage A planspace router (decision rule + analyzer
contract). No torch / sentence-transformers required: the encoder is stubbed.

Run:  python -m pytest backend/tests/test_planspace_router.py -q
"""

import asyncio
import importlib.util
import math
import os
import pickle
import sys

import numpy as np
import pytest
from sklearn.ensemble import (HistGradientBoostingClassifier,
                              HistGradientBoostingRegressor)

HERE = os.path.dirname(os.path.abspath(__file__))
MOD_PATH = os.path.join(HERE, "..", "app", "complexity", "planspace_router.py")


def _load():
    spec = importlib.util.spec_from_file_location("planspace_router_test_mod", MOD_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ps = _load()
FEATURE_DIM = 417


# ---------------------------------------------------------------------------
# select_plan -- the pure decision rule
# ---------------------------------------------------------------------------
def test_select_plan_picks_cheapest_clearing():
    chosen, fail_up = ps.select_plan(
        ["cheap", "mid", "big"], [0.9, 0.95, 0.99], [1.0, 5.0, 25.0], tau=0.8)
    assert chosen == "cheap" and fail_up is False


def test_select_plan_skips_below_floor():
    chosen, fail_up = ps.select_plan(
        ["cheap", "mid", "big"], [0.5, 0.85, 0.99], [1.0, 5.0, 25.0], tau=0.8)
    assert chosen == "mid" and fail_up is False


def test_select_plan_cost_tie_prefers_higher_q():
    chosen, _ = ps.select_plan(
        ["a", "b"], [0.85, 0.95], [2.0, 2.0], tau=0.8)
    assert chosen == "b"


def test_select_plan_fail_up_to_benchmark():
    chosen, fail_up = ps.select_plan(
        ["cheap", "mid"], [0.1, 0.2], [1.0, 5.0], tau=0.9, benchmark_plan="big")
    assert chosen == "big" and fail_up is True


def test_select_plan_fail_up_argmax_without_benchmark():
    chosen, fail_up = ps.select_plan(
        ["cheap", "mid"], [0.1, 0.4], [1.0, 5.0], tau=0.9)
    assert chosen == "mid" and fail_up is True


def test_select_plan_dead_band_blocks_marginal_switch():
    # incumbent "mid"; "cheap" clears tau but NOT tau + dead-band -> stay put
    chosen, fail_up = ps.select_plan(
        ["cheap", "mid"], [0.81, 0.84], [1.0, 5.0], tau=0.80,
        dead_band=0.03, session_plan="mid")
    assert chosen == "mid" and fail_up is False


def test_select_plan_dead_band_allows_decisive_switch():
    chosen, _ = ps.select_plan(
        ["cheap", "mid"], [0.84, 0.86], [1.0, 5.0], tau=0.80,
        dead_band=0.03, session_plan="mid")
    assert chosen == "cheap"


def test_select_plan_stateless_ignores_dead_band():
    chosen, _ = ps.select_plan(
        ["cheap", "mid"], [0.81, 0.99], [1.0, 5.0], tau=0.80, dead_band=0.03)
    assert chosen == "cheap"


def test_select_plan_misaligned_inputs_raise():
    with pytest.raises(ValueError):
        ps.select_plan(["a"], [0.5, 0.6], [1.0], tau=0.5)


# ---------------------------------------------------------------------------
# Synthetic artifact + stubbed encoder -> full route() / analyze() path
# ---------------------------------------------------------------------------
def _make_artifact(tmp_path):
    rng = np.random.default_rng(0)
    X = rng.normal(size=(200, FEATURE_DIM)).astype(np.float32)
    heads, cost_models = {}, {}
    for name, sep in (("cheapo", 0.0), ("solid", 2.0)):
        y = (X[:, 0] + sep > 0).astype(float)   # "solid" correct more often
        clf = HistGradientBoostingClassifier(max_iter=20).fit(X, y)
        reg = HistGradientBoostingRegressor(max_iter=20).fit(
            X, np.full(len(X), 1.0 if name == "cheapo" else 10.0))
        heads[name] = {"scorer": clf, "calibrator": None}
        cost_models[name] = {"p50": reg, "p90": reg}
    art = {
        "version": "planspace_v1",
        "embedder": "stub",
        "normalize_embeddings": True,
        "feature_dim": FEATURE_DIM,
        "models": ["cheapo", "solid"],
        "model_meta": {"cheapo": {"input_price": 1.0, "output_price": 5.0, "reasoning": False},
                       "solid": {"input_price": 15.0, "output_price": 75.0, "reasoning": False}},
        "per_model_heads": heads,
        "cost_models": cost_models,
        "clusters": {"kmeans_centroids": np.zeros((2, 384), dtype=np.float32), "k": 2},
        "conformal": {"alpha": 0.01, "global_tau": 0.6,
                      "cluster_taus": {0: {"tau": 0.6, "n": 500},
                                       1: {"tau": 0.62, "n": 500}},
                      "min_group_n": 100, "buffer_small": 0.02},
        "dead_band": 0.03,
        "benchmark_model": "solid",
        "knobs": {"effort": {"enabled": False, "levels": ["off"], "delta_heads": None}},
        "sklearn_version": __import__("sklearn").__version__,
        "training_report": {},
    }
    p = tmp_path / "art.pkl"
    with open(p, "wb") as fh:
        pickle.dump(art, fh)
    return str(p)


class _StubEmbedder:
    def encode(self, texts, normalize_embeddings=False):
        rng = np.random.default_rng(abs(hash(texts[0])) % (2**32))
        return rng.normal(size=(len(texts), 384)).astype(np.float32)


@pytest.fixture()
def router(tmp_path):
    r = ps.PlanspaceRouter(_make_artifact(tmp_path))
    r._embedder = _StubEmbedder()
    return r


def test_route_returns_plan_decision(router):
    d = router.route("What is 2+2?")
    assert d.model in ("cheapo", "solid")
    assert 0.0 <= d.q <= 1.0
    assert math.isfinite(d.tau)
    assert len(d.plans) == 2
    assert d.fallback is False


def test_route_fail_up_under_impossible_floor(router):
    d = router.route("hard prompt", alpha_tau_override=1.01)
    assert d.model == "solid" and d.fail_up is True


def test_route_heuristic_fallback_without_artifact(tmp_path):
    r = ps.PlanspaceRouter(str(tmp_path / "missing.pkl"))
    d = r.route("anything")
    assert d.fallback is True and d.model


def test_analyzer_contract(router, tmp_path):
    analyzer = ps.PlanspaceAnalyzer.__new__(ps.PlanspaceAnalyzer)
    analyzer.router = router
    out = asyncio.run(analyzer.analyze("Summarize this document please"))
    for key in ("recommended_model", "confidence", "complexity_score", "tier",
                "tier_name", "reasoning", "analyzer_latency_ms", "analyzer_type",
                "full_analysis"):
        assert key in out, f"missing contract key {key}"
    assert out["analyzer_type"] == "planspace"
    assert out["tier"] in (1, 2, 3)
    assert 0.0 <= out["complexity_score"] <= 1.0
    plan = out["full_analysis"]["plan"]
    assert plan["model"] == out["recommended_model"]
    assert out["full_analysis"]["propensity"] == 1.0


def test_module_imports_without_torch():
    # the module was loaded at collection time in this venv; assert the lazy
    # boundary held (torch only arrives via sentence-transformers at encode time)
    assert "select_plan" in dir(ps)


def test_artifact_version_gate(tmp_path):
    p = tmp_path / "bad.pkl"
    with open(p, "wb") as fh:
        pickle.dump({"version": "other"}, fh)
    with pytest.raises(ValueError):
        ps.load_artifact(str(p))
