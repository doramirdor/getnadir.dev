"""Smoke tests for the Wide&Deep (asymmetric-cost) complexity analyzer
and its end-to-end wiring through the factory + Supabase logging pipeline.

These tests do NOT hit Supabase or any external network service — the
database writer is monkey-patched so we can assert on the exact payload
that would have been inserted into ``usage_events.metadata``.

Running:
    cd backend
    venv/bin/python3 -m pytest tests/test_wide_deep_asym_analyzer.py -v
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest

from app.complexity.analyzer_factory import (
    AnalyzerType,
    ComplexityAnalyzerFactory,
)
from app.complexity.wide_deep_asym_analyzer import (
    WideDeepAsymAnalyzer,
    _cost_matrix,
    get_wide_deep_asym_analyzer,
)

# Only the `async def` tests need the asyncio mark; applying `pytestmark` to
# the whole module would also mark the sync tests. Decorate individually below.


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def argmax_analyzer() -> WideDeepAsymAnalyzer:
    """Module-scoped analyzer so we only load BGE-base-en-v1.5 once."""
    return get_wide_deep_asym_analyzer(decision_rule="argmax", cost_lambda=3.0)


# ---------------------------------------------------------------------------
# Cost matrix
# ---------------------------------------------------------------------------


def test_cost_matrix_shape_and_sign():
    C = _cost_matrix(lam=3.0, k=3)
    assert C.shape == (3, 3)
    # Diagonal is always zero.
    for i in range(3):
        assert C[i, i] == 0.0
    # Downgrades cost λ × step, upgrades cost step (both non-negative).
    assert C[2, 0] == 3.0 * 2  # complex → simple
    assert C[1, 0] == 3.0 * 1  # medium → simple
    assert C[0, 2] == 2.0       # simple → complex (upgrade)
    assert C[0, 1] == 1.0       # simple → medium (upgrade)
    assert (C >= 0).all()


def test_cost_matrix_lambda_scales_only_downgrade_side():
    C1 = _cost_matrix(lam=1.0)
    C20 = _cost_matrix(lam=20.0)
    # Upgrade costs must be λ-invariant.
    for i in range(3):
        for j in range(i + 1, 3):
            assert C1[i, j] == C20[i, j]
    # Downgrade costs must scale linearly with λ.
    for i in range(3):
        for j in range(0, i):
            assert C20[i, j] == 20.0 * C1[i, j]


# ---------------------------------------------------------------------------
# Factory wiring
# ---------------------------------------------------------------------------


def test_analyzer_type_enum_registered():
    assert AnalyzerType.WIDE_DEEP_ASYM.value == "wide_deep_asym"
    assert "wide_deep_asym" in ComplexityAnalyzerFactory.get_available_analyzers()
    info = ComplexityAnalyzerFactory.get_analyzer_info()
    assert "wide_deep_asym" in info
    assert "Wide&Deep" in info["wide_deep_asym"]["name"]


def test_factory_creates_wide_deep_asym():
    a = ComplexityAnalyzerFactory.create_analyzer(AnalyzerType.WIDE_DEEP_ASYM)
    assert isinstance(a, WideDeepAsymAnalyzer)
    # String form must also resolve.
    b = ComplexityAnalyzerFactory.create_analyzer("wide_deep_asym")
    assert isinstance(b, WideDeepAsymAnalyzer)


def test_factory_honors_env_decision_rule(monkeypatch):
    monkeypatch.setenv("WIDE_DEEP_ASYM_DECISION_RULE", "cost_sensitive")
    monkeypatch.setenv("WIDE_DEEP_ASYM_COST_LAMBDA", "20")
    # Bust the singleton so a fresh config is picked up.
    import app.complexity.wide_deep_asym_analyzer as wda

    wda._analyzer_instance = None
    a = ComplexityAnalyzerFactory.create_analyzer(AnalyzerType.WIDE_DEEP_ASYM)
    assert a.decision_rule == "cost_sensitive"
    assert a.cost_lambda == 20.0


# ---------------------------------------------------------------------------
# Analyze — behaviour
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_analyze_returns_expected_shape(argmax_analyzer):
    r = await argmax_analyzer.analyze("What is the capital of France?")
    # Required fields
    for k in (
        "tier_name",
        "tier",
        "tier_probabilities",
        "confidence",
        "analyzer_version",
        "decision_rule",
        "cost_lambda",
        "reasoning",
        "recommended_model",
        "recommended_provider",
        "analyzer_latency_ms",
    ):
        assert k in r, f"missing {k!r} in analyze() result"
    # Ternary
    assert r["tier_name"] in {"simple", "medium", "complex"}
    assert r["tier"] in {1, 2, 3}
    # Probabilities are a proper simplex.
    probs = r["tier_probabilities"]
    assert set(probs.keys()) == {"simple", "medium", "complex"}
    assert 0.999 < sum(probs.values()) < 1.001
    assert 0.0 <= r["confidence"] <= 1.0
    assert r["analyzer_version"] == "wide_deep_asym_v3"


@pytest.mark.asyncio
async def test_hard_complex_prompt_routes_to_sonnet(argmax_analyzer):
    """A clearly-complex system design prompt should route to the complex tier."""
    r = await argmax_analyzer.analyze(
        "Design a horizontally-scalable rate-limiting system for a multi-region "
        "API gateway. Discuss tradeoffs between token bucket and leaky bucket, "
        "how to handle clock skew across regions, and how the design changes "
        "if per-user limits must be enforced exactly."
    )
    assert r["tier_name"] == "complex"
    assert r["tier"] == 3
    assert "sonnet" in r["recommended_model"].lower()


@pytest.mark.asyncio
async def test_cost_sensitive_prefers_safer_tier_on_ambiguous_prompt():
    """On a borderline prompt, cost-sens λ=20 should never rank below argmax."""
    import app.complexity.wide_deep_asym_analyzer as wda

    wda._analyzer_instance = None
    argmax = get_wide_deep_asym_analyzer(decision_rule="argmax")
    prompt = (
        "Given a 3-layer transformer decoder with causal self-attention, derive "
        "the gradient of the loss w.r.t. the Q projection weights at layer 2."
    )
    r_argmax = await argmax.analyze(prompt)

    wda._analyzer_instance = None
    safe = get_wide_deep_asym_analyzer(decision_rule="cost_sensitive", cost_lambda=20.0)
    r_safe = await safe.analyze(prompt)

    tier_rank = {"simple": 0, "medium": 1, "complex": 2}
    assert tier_rank[r_safe["tier_name"]] >= tier_rank[r_argmax["tier_name"]], (
        f"cost-sens λ=20 picked {r_safe['tier_name']} vs argmax {r_argmax['tier_name']}"
    )


# ---------------------------------------------------------------------------
# Supabase payload shape
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_supabase_usage_event_payload_contains_classifier_fields(argmax_analyzer):
    """End-to-end: the row that would be inserted into usage_events must carry
    the full classifier metadata produced by WideDeepAsymAnalyzer."""
    from app.services.analytics_service import (
        AnalyticsService,
        CostAnalytics,
        ModelAnalytics,
        PerformanceAnalytics,
        RequestAnalytics,
    )
    from app.services.supabase_unified_llm_service import SupabaseUnifiedLLMService

    analysis_result = await argmax_analyzer.analyze(
        "Write a Python function that returns the n-th Fibonacci number iteratively."
    )

    # This is the dict _select_best_model builds after the analyzer succeeds.
    complexity_analysis = {
        "model_selection_type": "analyzer_recommendation",
        "selected_model": analysis_result["recommended_model"],
        "task_type": "unknown",
        "complexity_score": analysis_result["complexity_score"],
        "reasoning": analysis_result["reasoning"],
        "analyzer_type": "wide_deep_asym",
        "full_analysis": analysis_result,
        "tier_name": analysis_result["tier_name"],
        "tier": analysis_result["tier"],
        "tier_probabilities": analysis_result["tier_probabilities"],
        "confidence": analysis_result["confidence"],
        "classifier_version": analysis_result["analyzer_version"],
        "decision_rule": analysis_result["decision_rule"],
        "cost_lambda": analysis_result["cost_lambda"],
        "analyzer_latency_ms": analysis_result["analyzer_latency_ms"],
        "errors": [],
    }

    additional = SupabaseUnifiedLLMService._build_classifier_metadata(
        "wide_deep_asym", complexity_analysis
    )
    # These must survive the metadata build.
    assert additional["analyzer_type"] == "wide_deep_asym"
    assert additional["classifier_version"] == "wide_deep_asym_v3"
    assert additional["classifier_tier"] in {"simple", "medium", "complex"}
    assert additional["decision_rule"] == "argmax"
    assert additional["cost_lambda"] == 3.0
    assert isinstance(additional["tier_probabilities"], dict)

    model_analytics = ModelAnalytics(
        recommended_model=analysis_result["recommended_model"],
        selected_model=analysis_result["recommended_model"],
        selection_reason=analysis_result["reasoning"],
        complexity_score=analysis_result["complexity_score"],
        analyzer_type="wide_deep_asym",
        analyzer_latency_ms=analysis_result["analyzer_latency_ms"],
    )
    request_analytics = RequestAnalytics(
        request_id="pytest-req-1",
        user_id="pytest-user-1",
        prompt="fib",
        model_analytics=model_analytics,
        cost_analytics=CostAnalytics(
            total_cost_usd=0.01,
            cost_per_token=1e-6,
            input_cost_usd=0.003,
            output_cost_usd=0.007,
        ),
        performance_analytics=PerformanceAnalytics(
            latency_ms=100,
            total_tokens=300,
            prompt_tokens=50,
            completion_tokens=250,
        ),
        additional_metadata=additional,
    )

    captured: dict = {}

    async def fake_log_usage_event(**kwargs):
        captured.update(kwargs)

    with patch(
        "app.services.analytics_service.log_usage_event",
        new=AsyncMock(side_effect=fake_log_usage_event),
    ):
        await AnalyticsService().log_request_analytics(request_analytics)

    meta = captured.get("metadata") or {}
    # Core identity fields
    assert meta["analyzer_type"] == "wide_deep_asym"
    assert meta["classifier_version"] == "wide_deep_asym_v3"
    assert meta["classifier_tier"] in {"simple", "medium", "complex"}
    # Classifier-style enrichment (used to be gated on analyzer_type == "binary")
    assert "classifier_confidence" in meta
    # Wide&Deep-specific fields we widened the writer to include
    assert isinstance(meta["tier_probabilities"], dict)
    assert meta["decision_rule"] == "argmax"
    assert meta["cost_lambda"] == 3.0


# ---------------------------------------------------------------------------
# Dashboard filter
# ---------------------------------------------------------------------------


def test_classifier_analytics_filter_accepts_wide_deep_asym():
    from app.api.classifier_analytics import (
        CLASSIFIER_ANALYZER_TYPES,
        _is_classifier_event,
    )

    assert "wide_deep_asym" in CLASSIFIER_ANALYZER_TYPES
    assert "binary" in CLASSIFIER_ANALYZER_TYPES

    # A wide_deep_asym row should be accepted.
    row = {"metadata": {"analyzer_type": "wide_deep_asym", "classifier_tier": "complex"}}
    assert _is_classifier_event(row) is True

    # A legacy binary row still works.
    assert _is_classifier_event({"metadata": {"analyzer_type": "binary"}}) is True

    # An unrelated analyzer (e.g. bert) with no classifier_* metadata is rejected.
    assert _is_classifier_event({"metadata": {"analyzer_type": "bert"}}) is False

    # Fallback: unknown analyzer_type but carrying classifier_version still accepted.
    assert _is_classifier_event(
        {"metadata": {"analyzer_type": "future_model_v7", "classifier_version": "v7"}}
    ) is True
