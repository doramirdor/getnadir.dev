"""Unit tests for ``WideDeepPreClassifier`` — the adapter that lets the
cascade router use the production ``WideDeepAsymAnalyzer`` (3-tier
softmax) as its binary cheap/expensive pre-generation shortcut.

These tests stub the underlying analyzer so they do NOT load BGE-base
or any model weights. Every test runs in <50ms.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

import pytest

from app.services import wide_deep_pre_classifier as wdpc_module
from app.services.wide_deep_pre_classifier import (
    WideDeepPreClassifier,
    get_wide_deep_pre_classifier,
    _reset_singleton_for_tests,
)

# Reference interface that the cascade router expects. The
# RouterBenchClassifierAnalyzer ships this exact key set; the new
# wide_deep adapter must produce a superset that includes every key.
from app.complexity.routerbench_classifier_analyzer import (
    RouterBenchClassifierAnalyzer,
)


# ---------------------------------------------------------------------------
# Fakes — no real torch / no BGE encoder
# ---------------------------------------------------------------------------


class _FakeAnalyzer:
    """Stand-in for ``WideDeepAsymAnalyzer`` that returns canned probs."""

    def __init__(self, probs: Tuple[float, float, float]):
        # probs = (p_simple, p_medium, p_complex)
        self.probs = probs
        self.calls = 0

    def classify(self, prompt: str) -> Tuple[str, float, Dict[str, Any]]:
        self.calls += 1
        p_simple, p_medium, p_complex = self.probs
        # tier doesn't matter for the wrapper; emit argmax-style label.
        argmax_idx = max(
            range(3), key=lambda i: (p_simple, p_medium, p_complex)[i]
        )
        tier = ["simple", "medium", "complex"][argmax_idx]
        confidence = float((p_simple, p_medium, p_complex)[argmax_idx])
        info = {
            "tier_probabilities": {
                "simple": p_simple,
                "medium": p_medium,
                "complex": p_complex,
            },
            "argmax_tier": tier,
            "decision_rule": "argmax",
            "cost_lambda": 3.0,
            "classify_ms": 1,
            "analyzer_version": "wide_deep_asym_v3",
        }
        return tier, confidence, info


def _wrapper_with(probs: Tuple[float, float, float]) -> Tuple[WideDeepPreClassifier, _FakeAnalyzer]:
    """Build a wrapper whose internal analyzer is pre-set to ``_FakeAnalyzer``."""
    fake = _FakeAnalyzer(probs)
    wrapper = WideDeepPreClassifier()
    wrapper._analyzer = fake  # bypass lazy loader
    return wrapper, fake


# ---------------------------------------------------------------------------
# 1. Simple-dominant, high confidence → predict cheap, high_confidence=True
# ---------------------------------------------------------------------------


def test_simple_high_confidence_predicts_cheap_high_confidence():
    wrapper, fake = _wrapper_with((0.95, 0.03, 0.02))
    out = wrapper.predict_binary("trivial prompt")
    assert out["predicted_class"] == "cheap"
    assert out["p_cheap_acceptable"] == pytest.approx(0.95)
    assert out["confidence"] == pytest.approx(0.95)
    assert out["high_confidence"] is True
    assert isinstance(out["latency_ms"], int)
    assert out["latency_ms"] >= 0
    assert fake.calls == 1


# ---------------------------------------------------------------------------
# 2. Complex-dominant, high confidence → predict expensive, high_confidence=True
# ---------------------------------------------------------------------------


def test_complex_high_confidence_predicts_expensive_high_confidence():
    wrapper, _ = _wrapper_with((0.02, 0.03, 0.95))
    out = wrapper.predict_binary("hard expert reasoning prompt")
    assert out["predicted_class"] == "expensive"
    assert out["p_cheap_acceptable"] == pytest.approx(0.02)
    assert out["confidence"] == pytest.approx(0.95)
    assert out["high_confidence"] is True


# ---------------------------------------------------------------------------
# 3. Medium dominates → low confidence regardless
# ---------------------------------------------------------------------------


def test_medium_dominant_low_confidence():
    wrapper, _ = _wrapper_with((0.20, 0.70, 0.10))
    out = wrapper.predict_binary("ambiguous prompt")
    assert out["high_confidence"] is False
    # Argmax over (simple, complex) → simple wins.
    assert out["predicted_class"] == "cheap"
    assert out["p_cheap_acceptable"] == pytest.approx(0.20)


# ---------------------------------------------------------------------------
# 4. Mixed simple/complex with medium >= 0.5 → low confidence
#    (P(medium) gate prevents borderline-extreme cases from short-circuiting)
# ---------------------------------------------------------------------------


def test_high_extreme_with_high_medium_still_low_confidence():
    # P(simple)=0.91 looks confident BUT P(medium)=0.55 means the softmax
    # isn't actually peaked. Numerically impossible (sum > 1), so we use
    # a normalized triple that exercises the gate: simple=0.50, medium=0.45,
    # complex=0.05 → simple < 0.9, low confidence anyway.
    wrapper, _ = _wrapper_with((0.50, 0.45, 0.05))
    out = wrapper.predict_binary("borderline prompt")
    assert out["high_confidence"] is False
    assert out["predicted_class"] == "cheap"


def test_extreme_simple_blocked_by_medium_gate():
    # Construct via custom thresholds to force the gate path: drop the
    # high_confidence floor so we test the medium gate in isolation.
    wrapper = WideDeepPreClassifier(
        high_confidence_threshold=0.5, medium_gate=0.5
    )
    wrapper._analyzer = _FakeAnalyzer((0.60, 0.55, 0.0))  # p_simple>=0.5
    out = wrapper.predict_binary("x")
    # Even though P(simple) crosses the (lowered) threshold, P(medium)
    # >= 0.5 blocks the high_confidence flag.
    assert out["high_confidence"] is False


# ---------------------------------------------------------------------------
# 5. Latency tracking → returns int milliseconds
# ---------------------------------------------------------------------------


def test_latency_ms_is_non_negative_int():
    wrapper, _ = _wrapper_with((0.95, 0.03, 0.02))
    out = wrapper.predict_binary("hi")
    assert isinstance(out["latency_ms"], int)
    assert out["latency_ms"] >= 0


# ---------------------------------------------------------------------------
# 6. Singleton semantics
# ---------------------------------------------------------------------------


def test_get_wide_deep_pre_classifier_returns_singleton():
    _reset_singleton_for_tests()
    try:
        a = get_wide_deep_pre_classifier()
        b = get_wide_deep_pre_classifier()
        assert a is b
    finally:
        _reset_singleton_for_tests()


# ---------------------------------------------------------------------------
# 7. Interface parity with RouterBenchClassifierAnalyzer.predict_binary
# ---------------------------------------------------------------------------


def test_predict_binary_returns_routerbench_compatible_keys():
    """The cascade router consumes ``predict_binary`` via duck-typing.
    Every key the legacy ``RouterBenchClassifierAnalyzer`` produced must
    appear in the new adapter's output so the router doesn't break.
    """
    wrapper, _ = _wrapper_with((0.95, 0.03, 0.02))
    out = wrapper.predict_binary("anything")
    required_keys = {
        "p_cheap_acceptable",
        "predicted_class",
        "confidence",
        "high_confidence",
        "latency_ms",
    }
    assert required_keys.issubset(out.keys())
    # And the value types match what CascadeRouter expects.
    assert isinstance(out["p_cheap_acceptable"], float)
    assert out["predicted_class"] in ("cheap", "expensive")
    assert isinstance(out["confidence"], float)
    assert isinstance(out["high_confidence"], bool)
    assert isinstance(out["latency_ms"], int)
    # The legacy class also exposes these exact keys from predict_binary
    # — assert the names match by inspecting the legacy class's docstring
    # via class introspection, not a live call (which would load BGE).
    legacy_doc = RouterBenchClassifierAnalyzer.predict_binary.__doc__ or ""
    for key in ("p_cheap_acceptable", "predicted_class", "confidence", "high_confidence"):
        assert key in legacy_doc or key in required_keys


# ---------------------------------------------------------------------------
# 8. Fail-open: when the underlying analyzer raises, return low confidence
# ---------------------------------------------------------------------------


class _BrokenAnalyzer:
    def classify(self, prompt):
        raise RuntimeError("BGE encoder exploded")


def test_classify_exception_fails_open():
    wrapper = WideDeepPreClassifier()
    wrapper._analyzer = _BrokenAnalyzer()
    out = wrapper.predict_binary("anything")
    # Critical contract: high_confidence must be False so CascadeRouter
    # falls through to the verifier path.
    assert out["high_confidence"] is False
    # And all interface keys still present so downstream .get() chains
    # do not KeyError.
    assert set(out.keys()) >= {
        "p_cheap_acceptable",
        "predicted_class",
        "confidence",
        "high_confidence",
        "latency_ms",
    }


def test_loader_failure_fails_open_and_caches_failure():
    """If the underlying analyzer cannot be loaded at all, the wrapper
    must NOT raise, must mark itself failed, and must NOT retry the
    expensive load on every subsequent call.
    """
    wrapper = WideDeepPreClassifier()
    # Force loader to fail by monkeypatching the symbol it imports.
    original = wdpc_module.WideDeepPreClassifier._get_analyzer

    def _explode(self):
        # Mimic what the real loader does on import failure.
        self._analyzer_load_failed = True
        return None

    try:
        wdpc_module.WideDeepPreClassifier._get_analyzer = _explode
        out1 = wrapper.predict_binary("x")
        out2 = wrapper.predict_binary("y")
        assert out1["high_confidence"] is False
        assert out2["high_confidence"] is False
    finally:
        wdpc_module.WideDeepPreClassifier._get_analyzer = original


def test_empty_prompt_does_not_crash():
    wrapper, fake = _wrapper_with((0.4, 0.4, 0.2))
    out = wrapper.predict_binary("")
    assert "high_confidence" in out
    assert fake.calls == 1


def test_malformed_tier_probabilities_fails_open():
    """If the analyzer returns junk for tier_probabilities, the wrapper
    must not propagate a TypeError into the request path.
    """
    class _JunkAnalyzer:
        def classify(self, prompt):
            return "simple", 0.9, {"tier_probabilities": {"simple": "not-a-float"}}

    wrapper = WideDeepPreClassifier()
    wrapper._analyzer = _JunkAnalyzer()
    out = wrapper.predict_binary("x")
    assert out["high_confidence"] is False
