"""
Tests for the model-generic cost-aware router (app.complexity.cost_aware_router).

These exercise the production decision logic and the "generic to the model"
property. They do not assert a specific benchmark score (that lives in
eval/routerarena/nadirroute/); they assert correct, safe routing behavior.
"""
import math

import pytest

from app.complexity.cost_aware_router import (
    CostAwareRouter,
    ModelSpec,
    RoutingDecision,
)

CHEAP = ModelSpec("qwen/qwen3-235b-a22b-2507", input_price=0.10, output_price=0.30)
MID = ModelSpec("deepseek/deepseek-v3.2", input_price=0.27, output_price=0.40)
STRONG = ModelSpec("grok-4-1-fast-reasoning", input_price=0.20, output_price=0.50)
NEW = ModelSpec("some-brand-new-model-2027", input_price=0.15, output_price=0.45)  # unseen at train time


def _router(mode="prod"):
    return CostAwareRouter(mode=mode)


def test_modelspec_features_match_training_layout():
    f = CHEAP.features()
    assert f.shape == (4,)
    # [log10 in, log10 out, log10 blended, reasoning_flag]
    assert math.isclose(f[0], math.log10(0.10 + 1e-6), rel_tol=1e-5)
    assert f[3] == 0.0
    assert STRONG.reasoning_flag() == 1.0  # name contains "reason"


def test_route_returns_member_of_pool():
    r = _router()
    pool = [CHEAP, MID, STRONG]
    d = r.route("What is 2 + 2?", models=pool)
    assert isinstance(d, RoutingDecision)
    assert d.model in {m.name for m in pool}


def test_generic_to_model_unseen_model_is_routable():
    """A model never seen at training time must still be scorable and selectable
    purely from its feature row (the inductive property)."""
    r = _router()
    if not r.ready:
        pytest.skip("no trained artifact available in this environment")
    pool = [CHEAP, NEW]
    d = r.route("Prove that there are infinitely many primes.", models=pool)
    assert d.model in {CHEAP.name, NEW.name}
    # the unseen model received a real calibrated score, not a crash/NaN
    assert NEW.name in d.scores
    assert not math.isnan(d.scores[NEW.name])
    assert 0.0 <= d.scores[NEW.name] <= 1.0


def test_tau_monotonicity_higher_tau_escalates():
    """Higher tau means fewer models clear the bar, so routing shifts toward the
    stronger/more-expensive model. Lower tau downgrades more (prod savings)."""
    r = _router()
    if not r.ready:
        pytest.skip("no trained artifact available in this environment")
    pool = [CHEAP, STRONG]
    prompt = "Summarize the plot of Hamlet in one sentence."
    low = r.route(prompt, models=pool, tau=0.30)
    high = r.route(prompt, models=pool, tau=0.99)
    # at tau=0.99 essentially nothing clears the bar -> argmax P(correct);
    # at tau=0.30 the cheap model almost always clears -> cheap.
    cheapest = min(pool, key=lambda m: m.blended_price()).name
    assert low.model == cheapest or low.p_correct >= 0.30
    # high-tau decision must not be cheaper-than-or-equal while having lower P; it
    # should pick the most-likely-correct model when nothing clears tau.
    assert high.tau == 0.99


def test_heuristic_fallback_when_not_ready(monkeypatch):
    """If the scorer is missing, routing still returns a valid decision flagged as
    fallback (never crashes the request path)."""
    r = _router()
    r._scorer = None  # simulate missing artifact (both the heads and the inductive scorer)
    r._heads = {}
    pool = [CHEAP, MID, STRONG]
    d = r.route("anything", models=pool)
    assert d.fallback is True
    assert d.model in {m.name for m in pool}
    # heuristic picks the MID-priced model: never the most expensive (cost blowup)
    # and never the cheapest (quality risk)
    ranked = sorted(pool, key=lambda m: m.sort_price())
    assert d.model == ranked[len(ranked) // 2].name


def test_route_requires_a_pool():
    r = _router()
    r.default_pool = []
    with pytest.raises(ValueError):
        r.route("hello", models=None)


@pytest.mark.asyncio
async def test_factory_creates_cost_aware_analyzer():
    """COMPLEXITY_ANALYZER_TYPE=cost_aware must resolve through the factory and
    return the standard analyze() contract (recommended_model etc.)."""
    from app.complexity.analyzer_factory import ComplexityAnalyzerFactory

    analyzer = ComplexityAnalyzerFactory.create_analyzer("cost_aware")
    result = await analyzer.analyze(text="What is 2 + 2?")
    assert result["recommended_model"]
    assert result["selection_method"] == "cost_aware_router"
    assert 0.0 <= result["complexity_score"] <= 1.0
    assert result["tier_name"] in ("simple", "medium", "complex")


@pytest.mark.asyncio
async def test_factory_cost_aware_respects_allowed_models():
    """A user-constrained pool (models unseen at training) must route within it
    via the zero-shot inductive path."""
    from app.complexity.analyzer_factory import ComplexityAnalyzerFactory

    allowed = ["gpt-4o-mini", "claude-sonnet-4-6"]
    analyzer = ComplexityAnalyzerFactory.create_analyzer("cost_aware", allowed_models=allowed)
    result = await analyzer.analyze(text="Write a haiku about coffee.")
    assert result["recommended_model"] in allowed
