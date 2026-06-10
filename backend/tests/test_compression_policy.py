"""Tests for compression-aware effective-cost ranking (compression_policy.py).

Loaded standalone via importlib with a stubbed litellm pricing table so the
math is deterministic and no real pricing data is needed.

Invariants under test:

  * effective cost weights input 3:1 and discounts cached + compressed input
  * unknown pricing returns None (never treated as free)
  * rerank only ever swaps to a candidate of equal-or-better quality_index
  * rerank is a no-op when optimize is off, the selected model is unranked,
    or no equal-quality candidate is effectively cheaper
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, ".."))
POLICY_PATH = os.path.join(BACKEND, "app", "services", "compression_policy.py")

PRICING = {
    # cheap input, expensive output
    "model-in-cheap": {
        "input_cost_per_token": 1e-6,
        "output_cost_per_token": 20e-6,
    },
    # expensive input, cheap output — wins under input-heavy weighting
    "model-out-cheap": {
        "input_cost_per_token": 3e-6,
        "output_cost_per_token": 3e-6,
    },
    # explicit cache-read pricing (anthropic-style 10x discount)
    "claude-cached": {
        "input_cost_per_token": 3e-6,
        "output_cost_per_token": 15e-6,
        "cache_read_input_token_cost": 0.3e-6,
    },
}


@pytest.fixture
def policy(monkeypatch):
    fake_litellm = types.ModuleType("litellm")
    fake_litellm.model_cost = dict(PRICING)
    monkeypatch.setitem(sys.modules, "litellm", fake_litellm)

    name = "_compression_policy_test"
    sys.modules.pop(name, None)
    spec = importlib.util.spec_from_file_location(name, POLICY_PATH)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


# ---------------------------------------------------------------------------
# effective_cost_per_million
# ---------------------------------------------------------------------------

def test_effective_cost_baseline_is_input_weighted(policy):
    # off mode, no cache: 0.75*input + 0.25*output per 1M tokens
    cost = policy.effective_cost_per_million("model-in-cheap", optimize_mode="off")
    assert cost == pytest.approx(0.75 * 1.0 + 0.25 * 20.0)


def test_effective_cost_compression_discounts_input_only(policy):
    base = policy.effective_cost_per_million("model-out-cheap", optimize_mode="off")
    compressed = policy.effective_cost_per_million("model-out-cheap", optimize_mode="kompress")
    factor = policy.MODE_COMPRESSION_FACTOR["kompress"]
    expected = 0.75 * 3.0 * (1 - factor) + 0.25 * 3.0
    assert compressed == pytest.approx(expected)
    assert compressed < base


def test_effective_cost_uses_litellm_cache_read_pricing(policy):
    no_cache = policy.effective_cost_per_million("claude-cached", optimize_mode="safe")
    with_cache = policy.effective_cost_per_million(
        "claude-cached", optimize_mode="safe", cache_hit_rate=0.7
    )
    factor = policy.MODE_COMPRESSION_FACTOR["safe"]
    expected_input = 3.0 * 0.3 * (1 - factor) + 0.3 * 0.7
    assert with_cache == pytest.approx(0.75 * expected_input + 0.25 * 15.0)
    assert with_cache < no_cache


def test_effective_cost_unknown_model_returns_none(policy):
    assert policy.effective_cost_per_million("totally-unknown-model") is None


# ---------------------------------------------------------------------------
# rerank_equal_quality
# ---------------------------------------------------------------------------

def _ranked(*entries):
    return [
        {"api_id": model, "model_name": model, "quality_index": q}
        for model, q in entries
    ]


def test_rerank_swaps_to_equal_quality_cheaper_model(policy):
    # Same quality; under input-heavy weighting model-out-cheap is effectively
    # cheaper than model-in-cheap (output price dominates the naive blend but
    # not the weighted one).
    ranked = _ranked(("model-in-cheap", 90.0), ("model-out-cheap", 90.0))
    model, reason = policy.rerank_equal_quality(
        "model-in-cheap", ranked, optimize_mode="safe"
    )
    assert model == "model-out-cheap"
    assert reason and "effective-cost rerank" in reason


def test_rerank_never_downgrades_quality(policy):
    # model-out-cheap is cheaper but clearly lower quality — must not swap.
    ranked = _ranked(("model-in-cheap", 90.0), ("model-out-cheap", 80.0))
    model, reason = policy.rerank_equal_quality(
        "model-in-cheap", ranked, optimize_mode="kompress"
    )
    assert model == "model-in-cheap"
    assert reason is None


def test_rerank_allows_quality_within_epsilon(policy):
    ranked = _ranked(("model-in-cheap", 90.0), ("model-out-cheap", 89.5))
    model, _ = policy.rerank_equal_quality("model-in-cheap", ranked, optimize_mode="safe")
    assert model == "model-out-cheap"


def test_rerank_noop_when_optimize_off(policy):
    ranked = _ranked(("model-in-cheap", 90.0), ("model-out-cheap", 90.0))
    model, reason = policy.rerank_equal_quality("model-in-cheap", ranked, optimize_mode="off")
    assert model == "model-in-cheap"
    assert reason is None


def test_rerank_noop_when_selected_not_in_ranking(policy):
    ranked = _ranked(("model-out-cheap", 90.0))
    model, reason = policy.rerank_equal_quality("model-in-cheap", ranked, optimize_mode="safe")
    assert model == "model-in-cheap"
    assert reason is None


def test_rerank_ignores_candidates_without_pricing(policy):
    ranked = _ranked(("model-in-cheap", 90.0), ("mystery-model", 95.0))
    model, reason = policy.rerank_equal_quality("model-in-cheap", ranked, optimize_mode="safe")
    assert model == "model-in-cheap"
    assert reason is None
