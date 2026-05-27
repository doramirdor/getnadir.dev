"""Unit tests for CascadeRouter (IP-1 verifier-gated cascade orchestration).

All tests use mocked LLM service and mocked verifier transport. No real
httpx calls, no real model loads, no Supabase writes (the supabase mock
captures rows in memory only).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock

import pytest

from app.services.cascade_router import (
    CascadeRouter,
    CascadeDecision,
    DEFAULT_ACCEPTANCE_THRESHOLD,
    DEFAULT_FORCE_ESCALATE_PATTERNS,
    _matches_any_pattern,
)
from app.services.verifier_model import VerifierModel


@pytest.fixture(autouse=True)
def _clear_verifier_cache_between_tests():
    """The cascade now consults a process-singleton verifier-score cache.
    The fake-LLM in these tests returns the same `cheap_answer` for any
    given `cheap_model`, so different tests share cache keys and leak
    scores into each other. Clear the cache before each test so each
    one starts from a clean slate.
    """
    try:
        from app.services.verifier_cache import get_shared_verifier_cache

        get_shared_verifier_cache().clear()
    except Exception:  # noqa: BLE001
        pass
    yield
    try:
        from app.services.verifier_cache import get_shared_verifier_cache

        get_shared_verifier_cache().clear()
    except Exception:  # noqa: BLE001
        pass


# ---------------------------------------------------------------------------
# Fixtures and helpers
# ---------------------------------------------------------------------------


class _FakeLLM:
    """Records calls; returns a synthetic OpenAI-shape response."""

    def __init__(self):
        self.calls: List[Dict[str, Any]] = []

    async def call(self, messages, model, user_session):
        self.calls.append({"model": model, "messages": messages})
        return {
            "choices": [
                {"message": {"role": "assistant", "content": f"answer from {model}"}}
            ]
        }


class _FakeSupabase:
    """Captures cascade_decisions inserts; never raises."""

    def __init__(self, raise_on_insert: bool = False):
        self.rows: List[Dict[str, Any]] = []
        self.raise_on_insert = raise_on_insert

    def table(self, name):
        assert name == "cascade_decisions"
        return self

    def insert(self, row):
        if self.raise_on_insert:
            raise RuntimeError("supabase outage")
        self.rows.append(row)
        return self

    def execute(self):
        return {"data": self.rows, "count": 1}


def _verifier_with_score(score: float) -> VerifierModel:
    return VerifierModel(transport_fn=lambda _payload: score)


def _verifier_raising(exc: Exception) -> VerifierModel:
    def _raise(_payload):
        raise exc
    return VerifierModel(transport_fn=_raise)


def _messages(text: str = "explain quicksort") -> List[Dict[str, Any]]:
    return [{"role": "user", "content": text}]


def _user_session():
    sess = MagicMock()
    sess.id = "00000000-0000-0000-0000-000000000042"
    return sess


def _cfg(
    enabled: bool = True,
    mode: str = "active",
    threshold: float = 0.75,
    escalation_models: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    if escalation_models is None:
        escalation_models = {"simple": "claude-sonnet-4-6", "medium": "claude-opus-4-6"}
    return {
        "enabled": enabled,
        "mode": mode,
        "acceptance_threshold": threshold,
        "escalation_models": escalation_models,
    }


# ---------------------------------------------------------------------------
# 1. enabled=False is a zero-overhead noop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_disabled_returns_noop_decision():
    router = CascadeRouter(cfg=_cfg(enabled=False), verifier=_verifier_with_score(0.9))
    decision = await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert isinstance(decision, CascadeDecision)
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.meta == {"cascade_skipped": "disabled"}
    assert decision.response is None
    assert decision.verifier_score is None


# ---------------------------------------------------------------------------
# 2. verifier unavailable → noop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_verifier_unavailable_is_noop():
    unavailable = VerifierModel(weights_path=None)  # no transport, no weights
    assert unavailable.is_available() is False
    router = CascadeRouter(cfg=_cfg(enabled=True), verifier=unavailable, llm_service=_FakeLLM())
    decision = await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.meta == {"cascade_skipped": "verifier_unavailable"}


# ---------------------------------------------------------------------------
# 3. shadow mode + low score → log decision, return cheap, no escalation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_shadow_mode_below_threshold_does_not_escalate():
    llm = _FakeLLM()
    supabase = _FakeSupabase()
    router = CascadeRouter(
        cfg=_cfg(mode="shadow", threshold=0.75),
        verifier=_verifier_with_score(0.2),
        llm_service=llm,
        supabase=supabase,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.verifier_score == pytest.approx(0.2)
    assert decision.meta["shadow_mode"] is True
    assert decision.meta["verifier_accepted"] is False
    # Cheap LLM called once, escalation LLM NOT called.
    assert [c["model"] for c in llm.calls] == ["claude-haiku-4-5"]
    # Decision was logged.
    assert len(supabase.rows) == 1
    assert supabase.rows[0]["shadow_mode"] is True


# ---------------------------------------------------------------------------
# 4. active mode + score >= threshold → cheap returned, not escalated
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_active_mode_accept_returns_cheap():
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg=_cfg(mode="active", threshold=0.75),
        verifier=_verifier_with_score(0.9),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.verifier_score == pytest.approx(0.9)
    assert decision.meta["verifier_accepted"] is True
    # Only the cheap LLM was called.
    assert [c["model"] for c in llm.calls] == ["claude-haiku-4-5"]


# ---------------------------------------------------------------------------
# 5. active mode + score < threshold → escalates, returns escalation model
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_active_mode_reject_escalates():
    llm = _FakeLLM()
    # max_refinement_attempts=0 disables the iterative-refinement step so
    # this test exercises the pure cheap → reject → escalate path. The
    # refinement contract has its own dedicated tests further down.
    router = CascadeRouter(
        cfg={**_cfg(mode="active", threshold=0.75), "max_refinement_attempts": 0},
        verifier=_verifier_with_score(0.1),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is True
    assert decision.final_model == "claude-sonnet-4-6"
    assert decision.verifier_score == pytest.approx(0.1)
    assert decision.meta["verifier_accepted"] is False
    # Cheap then escalation: both called, in order. Refinement was off.
    assert [c["model"] for c in llm.calls] == ["claude-haiku-4-5", "claude-sonnet-4-6"]


# ---------------------------------------------------------------------------
# 6. no escalation model configured for tier → noop with meta flag
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_escalation_model_skips_cascade():
    router = CascadeRouter(
        cfg=_cfg(escalation_models={"medium": "claude-opus-4-6"}),  # no "simple"
        verifier=_verifier_with_score(0.9),
        llm_service=_FakeLLM(),
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.meta == {"cascade_skipped": "no_escalation_model"}


# ---------------------------------------------------------------------------
# 7. kill switch: 3 consecutive verifier errors → trip + fall through to cheap
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_kill_switch_after_three_consecutive_errors():
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg=_cfg(mode="active", threshold=0.75),
        verifier=_verifier_raising(RuntimeError("verifier crashed")),
        llm_service=llm,
    )

    # First 3 calls all fail-open to cheap (errors are absorbed, not propagated).
    for _ in range(3):
        d = await router.dispatch_with_verifier(
            messages=_messages(),
            cheap_model="claude-haiku-4-5",
            tier_name="simple",
            user_session=_user_session(),
        )
        assert d.escalated is False
        assert d.final_model == "claude-haiku-4-5"
        assert d.meta.get("verifier_error") == "RuntimeError"

    assert router._kill_switch_tripped is True

    # 4th call: kill switch active → cheap returned WITHOUT calling verifier.
    pre_calls = len(llm.calls)
    d = await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert d.escalated is False
    assert d.final_model == "claude-haiku-4-5"
    assert d.meta == {"cascade_skipped": "kill_switch"}
    # No additional LLM calls after kill switch trips (the noop returns
    # before any cheap dispatch).
    assert len(llm.calls) == pre_calls


# ---------------------------------------------------------------------------
# 8. _log_decision failure is swallowed; does not propagate into request path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_decision_failure_does_not_propagate():
    llm = _FakeLLM()
    bad_supabase = _FakeSupabase(raise_on_insert=True)
    router = CascadeRouter(
        cfg=_cfg(mode="active", threshold=0.75),
        verifier=_verifier_with_score(0.9),
        llm_service=llm,
        supabase=bad_supabase,
    )
    # Must not raise despite the broken supabase.
    decision = await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.verifier_score == pytest.approx(0.9)
    # And nothing was successfully logged.
    assert bad_supabase.rows == []


@pytest.mark.asyncio
async def test_request_id_threaded_into_cascade_decisions_row():
    """`cascade_decisions.request_id` is NOT NULL in Supabase. The caller
    must thread `request_id` through `dispatch_with_verifier`, and the
    logged row must carry it verbatim. Without this, Postgres rejects
    every insert and the cascade_decisions table stays empty in prod.
    """
    llm = _FakeLLM()
    supabase = _FakeSupabase()
    router = CascadeRouter(
        cfg=_cfg(mode="active", threshold=0.75),
        verifier=_verifier_with_score(0.9),
        llm_service=llm,
        supabase=supabase,
    )
    await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
        request_id="req-test-12345",
    )
    assert len(supabase.rows) == 1
    assert supabase.rows[0]["request_id"] == "req-test-12345"


# ---------------------------------------------------------------------------
# Eval-calibration: default threshold and force-escalate patterns
# ---------------------------------------------------------------------------


def test_default_acceptance_threshold_is_calibrated_to_080():
    """The held-out eval picked 0.80 as the production sweet spot (matches
    the public marketing claim of "98% of always-Opus quality preserved" —
    catastrophic ≤ 1.7%). Earlier default was 0.70 (97.6% quality preserved).
    See cascade_router.py:39-60 for the full threshold sweep. If this
    constant drifts without a corresponding eval update + marketing review,
    catastrophic_rate will silently change in production.
    """
    # Env override is supported via CASCADE_DEFAULT_THRESHOLD; the bare
    # default when no override is set must be 0.80.
    import os
    if "CASCADE_DEFAULT_THRESHOLD" not in os.environ:
        assert DEFAULT_ACCEPTANCE_THRESHOLD == 0.80


def test_default_force_escalate_patterns_cover_weak_domains():
    """Sanity-check that the default blocklist covers the three domain
    families flagged as low-AUROC in eval_*.json: code, summarization,
    and (implicitly) open-ended chat via short-prompt patterns."""
    joined = " ".join(p.lower() for p in DEFAULT_FORCE_ESCALATE_PATTERNS)
    assert "python" in joined
    assert "def " in joined
    assert "summarize" in joined


def test_matches_any_pattern_case_insensitive():
    patterns = ["```python", "summarize this"]
    assert _matches_any_pattern("here is ```PYTHON code", patterns) == "```python"
    assert _matches_any_pattern("Summarize This: ...", patterns) == "summarize this"
    assert _matches_any_pattern("hello world", patterns) is None
    assert _matches_any_pattern("", patterns) is None
    assert _matches_any_pattern("x", []) is None
    assert _matches_any_pattern("x", None) is None


@pytest.mark.asyncio
async def test_default_threshold_used_when_config_omits_it():
    """If cfg has no `acceptance_threshold`, fall back to DEFAULT_ACCEPTANCE_THRESHOLD."""
    cfg = {
        "enabled": True,
        "mode": "active",
        "escalation_models": {"simple": "claude-sonnet-4-6"},
        # acceptance_threshold deliberately omitted
    }
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg=cfg,
        verifier=_verifier_with_score(0.69),  # just under default 0.70
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # 0.69 < 0.70 → escalate
    assert decision.escalated is True
    assert decision.final_model == "claude-sonnet-4-6"
    assert decision.meta["threshold"] == DEFAULT_ACCEPTANCE_THRESHOLD


@pytest.mark.asyncio
async def test_code_prompt_forces_escalation_even_if_verifier_accepts():
    """Even when the verifier says the cheap answer is fine, a code-shaped
    prompt forces escalation. Held-out eval shows the verifier's AUROC on
    code (mbpp) is 0.653 — too low to trust.
    """
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg={
            "enabled": True,
            "mode": "active",
            "acceptance_threshold": 0.5,
            "escalation_models": {"simple": "claude-sonnet-4-6"},
        },
        verifier=_verifier_with_score(0.99),  # would normally be ACCEPTED
        llm_service=llm,
    )
    code_messages = [
        {"role": "user", "content": "```python\ndef fib(n):\n    pass\n```\nFill it in."},
    ]
    decision = await router.dispatch_with_verifier(
        messages=code_messages,
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is True
    assert decision.final_model == "claude-sonnet-4-6"
    assert decision.verifier_score == pytest.approx(0.99)
    assert decision.meta["forced_escalation_pattern"] is not None
    assert "python" in decision.meta["forced_escalation_pattern"].lower()


@pytest.mark.asyncio
async def test_summarize_prompt_forces_escalation():
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg={
            "enabled": True,
            "mode": "active",
            "acceptance_threshold": 0.5,
            "escalation_models": {"simple": "claude-sonnet-4-6"},
        },
        verifier=_verifier_with_score(0.95),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=[{"role": "user", "content": "Summarize this: ..."}],
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is True
    assert decision.meta["forced_escalation_pattern"] == "summarize this"


@pytest.mark.asyncio
async def test_shadow_mode_records_forced_pattern_but_does_not_escalate():
    """In shadow mode the cascade never actually escalates, but the meta
    must still record that the prompt matched a forced pattern so post-hoc
    analysis can separate "verifier said reject" from "we'd have forced
    escalate" decisions.
    """
    llm = _FakeLLM()
    supabase = _FakeSupabase()
    router = CascadeRouter(
        cfg={
            "enabled": True,
            "mode": "shadow",
            "acceptance_threshold": 0.7,
            "escalation_models": {"simple": "claude-sonnet-4-6"},
        },
        verifier=_verifier_with_score(0.99),
        llm_service=llm,
        supabase=supabase,
    )
    decision = await router.dispatch_with_verifier(
        messages=[{"role": "user", "content": "```python\ndef foo():\n    pass\n```"}],
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
        request_id="req-shadow-1",
    )
    # Shadow → never escalates regardless.
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    # Meta still records the would-be forced escalation.
    assert decision.meta["forced_escalation_pattern"] is not None
    assert decision.meta["verifier_accepted"] is False
    # And the row in cascade_decisions captures it.
    assert len(supabase.rows) == 1
    assert supabase.rows[0]["shadow_mode"] is True


@pytest.mark.asyncio
async def test_custom_force_escalate_patterns_override_defaults():
    """Customers can supply their own blocklist via cfg."""
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg={
            "enabled": True,
            "mode": "active",
            "acceptance_threshold": 0.5,
            "escalation_models": {"simple": "claude-sonnet-4-6"},
            "force_escalate_patterns": ["MAGIC_TOKEN_XYZ"],
        },
        verifier=_verifier_with_score(0.99),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=[{"role": "user", "content": "this contains MAGIC_TOKEN_XYZ inside"}],
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is True
    assert decision.meta["forced_escalation_pattern"] == "MAGIC_TOKEN_XYZ"

    # And a plain prompt with no MAGIC_TOKEN goes through the verifier as usual.
    decision2 = await router.dispatch_with_verifier(
        messages=_messages("hello"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision2.escalated is False
    assert decision2.meta["forced_escalation_pattern"] is None


# ---------------------------------------------------------------------------
# Pre-generation classifier shortcut (router v2 composed architecture)
#
# The cascade router optionally accepts a `pre_classifier` whose
# `predict_binary(prompt)` returns {p_cheap_acceptable, predicted_class,
# confidence, high_confidence, ...}. When cfg["pre_classifier_enabled"] is
# True and the classifier returns high_confidence=True, the cascade skips
# the verifier and routes directly based on the classifier's binary
# decision: predict=cheap → serve cheap, no verifier; predict=expensive →
# go straight to escalation, no wasted cheap call. Low-confidence cases
# fall through to the standard cheap-then-verifier path.
# ---------------------------------------------------------------------------


class _FakeClassifier:
    def __init__(self, p_cheap: float, high_confidence: bool):
        self.p_cheap = p_cheap
        self.high_confidence = high_confidence
        self.calls = 0

    def predict_binary(self, prompt):
        self.calls += 1
        return {
            "p_cheap_acceptable": self.p_cheap,
            "predicted_class": "cheap" if self.p_cheap >= 0.5 else "expensive",
            "confidence": max(self.p_cheap, 1 - self.p_cheap),
            "high_confidence": self.high_confidence,
            "latency_ms": 1,
        }


@pytest.mark.asyncio
async def test_high_confidence_cheap_skips_verifier():
    """When the pre-classifier is confidently cheap, the cascade ships
    the cheap response without calling the verifier — saving 180ms per
    request on the slice the classifier is reliable on.
    """
    llm = _FakeLLM()
    verifier_calls = {"n": 0}

    class _CountingVerifier:
        def is_available(self):
            return True
        async def score(self, *_args, **_kwargs):
            verifier_calls["n"] += 1
            return 0.0

    router = CascadeRouter(
        cfg={
            **_cfg(mode="active", threshold=0.7),
            "pre_classifier_enabled": True,
        },
        verifier=_CountingVerifier(),
        llm_service=llm,
        pre_classifier=_FakeClassifier(p_cheap=0.95, high_confidence=True),
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("trivial prompt"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.verifier_score is None
    assert decision.meta["pre_classifier_used"] is True
    assert decision.meta["pre_classifier_prediction"] == "cheap"
    # The verifier must NOT have been called.
    assert verifier_calls["n"] == 0
    # The cheap LLM was called once (to actually produce the answer).
    assert [c["model"] for c in llm.calls] == ["claude-haiku-4-5"]


@pytest.mark.asyncio
async def test_high_confidence_expensive_skips_cheap_call():
    """When the pre-classifier is confidently expensive, the cascade
    goes straight to the escalation tier without burning a cheap call.
    This is the cost win the verifier-only cascade cannot achieve.
    """
    llm = _FakeLLM()
    verifier_calls = {"n": 0}

    class _CountingVerifier:
        def is_available(self):
            return True
        async def score(self, *_args, **_kwargs):
            verifier_calls["n"] += 1
            return 0.0

    router = CascadeRouter(
        cfg={
            **_cfg(mode="active", threshold=0.7),
            "pre_classifier_enabled": True,
        },
        verifier=_CountingVerifier(),
        llm_service=llm,
        pre_classifier=_FakeClassifier(p_cheap=0.02, high_confidence=True),
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("hard expert prompt"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is True
    assert decision.final_model == "claude-sonnet-4-6"
    assert decision.meta["skipped_cheap_call"] is True
    # No verifier call, no cheap LLM call — only the expensive one.
    assert verifier_calls["n"] == 0
    assert [c["model"] for c in llm.calls] == ["claude-sonnet-4-6"]


@pytest.mark.asyncio
async def test_low_confidence_falls_through_to_verifier():
    """When the pre-classifier is NOT confident, the cascade ignores its
    prediction and runs the standard cheap-then-verifier path.
    """
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg={
            **_cfg(mode="active", threshold=0.7),
            "pre_classifier_enabled": True,
        },
        verifier=_verifier_with_score(0.9),
        llm_service=llm,
        pre_classifier=_FakeClassifier(p_cheap=0.55, high_confidence=False),
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("ambiguous prompt"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # Standard accept path: verifier gave 0.9, threshold 0.7 → keep cheap.
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.verifier_score == pytest.approx(0.9)
    # The cheap LLM was called (the pre-classifier did NOT short-circuit).
    assert [c["model"] for c in llm.calls] == ["claude-haiku-4-5"]
    # And the meta does NOT carry a pre_classifier_used=True (no shortcut).
    assert decision.meta.get("pre_classifier_used") is not True


@pytest.mark.asyncio
async def test_pre_classifier_ignored_when_flag_explicitly_off():
    """Operators can pin a specific profile to NOT use the pre-classifier
    by setting `pre_classifier_enabled=False`. This is the rollback knob
    for the new composed_v2 default. With the explicit False, even a
    high-confidence prediction must not short-circuit the verifier.
    """
    llm = _FakeLLM()
    pre = _FakeClassifier(p_cheap=0.99, high_confidence=True)
    router = CascadeRouter(
        cfg={**_cfg(mode="active", threshold=0.7), "pre_classifier_enabled": False},
        verifier=_verifier_with_score(0.9),
        llm_service=llm,
        pre_classifier=pre,
    )
    await router.dispatch_with_verifier(
        messages=_messages("anything"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # Classifier was never called.
    assert pre.calls == 0


@pytest.mark.asyncio
async def test_pre_classifier_enabled_by_default_when_classifier_provided():
    """Composed_v2 ships with pre_classifier_enabled defaulting to True.
    A profile that doesn't explicitly opt in still gets the shortcut as
    long as the router was constructed with a `pre_classifier=`."""
    llm = _FakeLLM()
    pre = _FakeClassifier(p_cheap=0.99, high_confidence=True)
    # cfg deliberately omits pre_classifier_enabled.
    router = CascadeRouter(
        cfg=_cfg(mode="active", threshold=0.7),
        verifier=_verifier_with_score(0.9),
        llm_service=llm,
        pre_classifier=pre,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("anything"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # Classifier WAS called; short-circuited because high-confidence cheap.
    assert pre.calls == 1
    assert decision.meta.get("pre_classifier_used") is True


@pytest.mark.asyncio
async def test_pre_classifier_skipped_in_shadow_mode():
    """Shadow mode wants the verifier's score for telemetry, so even a
    high-confidence pre-classifier prediction must NOT short-circuit it.
    """
    llm = _FakeLLM()
    supabase = _FakeSupabase()
    pre = _FakeClassifier(p_cheap=0.99, high_confidence=True)
    router = CascadeRouter(
        cfg={
            **_cfg(mode="shadow", threshold=0.7),
            "pre_classifier_enabled": True,
        },
        verifier=_verifier_with_score(0.9),
        llm_service=llm,
        supabase=supabase,
        pre_classifier=pre,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("anything"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
        request_id="req-shadow-pc",
    )
    # In shadow mode the classifier is NEVER consulted (pc=None code path).
    assert pre.calls == 0
    # And the verifier ran as usual, score logged.
    assert decision.verifier_score == pytest.approx(0.9)
    assert len(supabase.rows) == 1


@pytest.mark.asyncio
async def test_pre_classifier_exception_falls_through():
    """If predict_binary raises, the cascade must NOT abort the request;
    it falls through to the standard cheap-then-verifier path.
    """
    llm = _FakeLLM()

    class _BrokenClassifier:
        def predict_binary(self, prompt):
            raise RuntimeError("classifier crashed")

    router = CascadeRouter(
        cfg={
            **_cfg(mode="active", threshold=0.7),
            "pre_classifier_enabled": True,
        },
        verifier=_verifier_with_score(0.9),
        llm_service=llm,
        pre_classifier=_BrokenClassifier(),
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("anything"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # Fell through to standard accept path; no crash.
    assert decision.escalated is False
    assert decision.verifier_score == pytest.approx(0.9)


@pytest.mark.asyncio
async def test_request_id_omitted_falls_back_to_uuid():
    """Backward compat: callers that don't pass request_id still get a
    valid (synthetic) UUID stamped into the row so the NOT NULL constraint
    is satisfied. The synthetic id is detectably a UUID v4.
    """
    import re
    llm = _FakeLLM()
    supabase = _FakeSupabase()
    router = CascadeRouter(
        cfg=_cfg(mode="active", threshold=0.75),
        verifier=_verifier_with_score(0.9),
        llm_service=llm,
        supabase=supabase,
    )
    await router.dispatch_with_verifier(
        messages=_messages(),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
        # no request_id
    )
    assert len(supabase.rows) == 1
    row_req_id = supabase.rows[0]["request_id"]
    assert isinstance(row_req_id, str) and len(row_req_id) == 36
    # uuid4 hex pattern
    assert re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", row_req_id)


# ---------------------------------------------------------------------------
# Critical fail-open: when no llm_service is wired (production_completion.py
# does the actual LLM call AFTER cascade), scoring the empty cheap response
# would always fail the verifier and cause systematic over-escalation. The
# cascade must short-circuit to "accept cheap" in that mode and behave as a
# pre-classifier shortcut layer only.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_caller_supplied_cheap_response_text_is_scored():
    """Production wiring: caller already invoked the cheap LLM and
    passes the response text in. Cascade scores THAT text, not an
    empty string. With score below threshold it must escalate.
    """
    router = CascadeRouter(
        cfg={
            **_cfg(mode="active", threshold=0.7),
            "max_refinement_attempts": 0,  # isolate the verifier decision
        },
        verifier=_verifier_with_score(0.2),
        llm_service=None,  # production wiring
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("compare wittgenstein and heidegger"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
        cheap_response_text="A long, considered response about language philosophy.",
    )
    # Verifier scored 0.2 < threshold 0.7 → cascade escalates.
    assert decision.escalated is True
    assert decision.final_model == "claude-sonnet-4-6"
    assert decision.verifier_score == pytest.approx(0.2)
    # And the fail-open guard did NOT fire because we have a non-empty
    # cheap response.
    assert decision.meta.get("cascade_skipped") != "no_llm_service_no_cheap_response"


@pytest.mark.asyncio
async def test_caller_supplied_cheap_response_accepted_no_escalation():
    """Same as above but with a high verifier score: cascade accepts and
    does NOT escalate. Final model is the cheap model.
    """
    router = CascadeRouter(
        cfg={
            **_cfg(mode="active", threshold=0.7),
            "max_refinement_attempts": 0,
        },
        verifier=_verifier_with_score(0.95),
        llm_service=None,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("what is 2+2"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
        cheap_response_text="2+2 = 4. This is basic arithmetic.",
    )
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.verifier_score == pytest.approx(0.95)


@pytest.mark.asyncio
async def test_no_llm_service_fails_open_to_cheap():
    """Without llm_service, cascade should not try to score an empty
    cheap response — it should return as if cheap was accepted. This
    is the production wiring (production_completion.py does the actual
    LLM call AFTER cascade returns).
    """
    router = CascadeRouter(
        cfg=_cfg(mode="active", threshold=0.7),
        verifier=_verifier_with_score(0.1),  # would normally reject
        llm_service=None,                    # ← the production state
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("anything"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # Did NOT escalate, even though verifier would have scored 0.1.
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    # No verifier call was made (because cheap response was empty).
    assert decision.verifier_score is None
    assert decision.meta.get("cascade_skipped") == "no_llm_service_no_cheap_response"


# ---------------------------------------------------------------------------
# Iterative refinement loop (Move 5 — IP-1 cost extension)
#
# When the verifier rejects the cheap response, the cascade does NOT
# immediately escalate. It re-prompts the cheap model with a diagnostic
# derived from the verifier score, asks it to try again, and re-verifies.
# If any retry passes the threshold → ship the refined cheap answer
# (cost: N+1 cheap + N+1 verifier, no expensive call). If all retries
# fail → escalate as before. This is the novel architecture nobody else
# can build (it leverages the verifier's score as actionable signal).
# ---------------------------------------------------------------------------


class _VarLLM:
    """FakeLLM whose content varies per call."""

    def __init__(self, responses):
        # responses: list of strings, one per call.
        self.responses = list(responses)
        self.calls = []

    async def call(self, messages, model, user_session):
        self.calls.append({"model": model, "messages": messages})
        idx = min(len(self.calls) - 1, len(self.responses) - 1)
        return {
            "choices": [
                {"message": {"role": "assistant", "content": self.responses[idx]}}
            ]
        }


class _VarVerifier(VerifierModel):
    """VerifierModel that returns a different score per call."""

    def __init__(self, scores):
        scores = list(scores)
        self._scores_iter = iter(scores)

        def _next(_payload):
            try:
                return next(self._scores_iter)
            except StopIteration:
                return 0.0

        super().__init__(transport_fn=_next)


@pytest.mark.asyncio
async def test_refinement_succeeds_on_first_retry_ships_cheap():
    """Verifier rejects the first cheap answer, accepts the second.
    Cascade must ship the refined cheap answer and NOT call the
    escalation model. This is the headline cost win.
    """
    llm = _VarLLM(["weak first attempt", "much better second attempt"])
    router = CascadeRouter(
        cfg={**_cfg(mode="active", threshold=0.7), "max_refinement_attempts": 1},
        verifier=_VarVerifier([0.2, 0.9]),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("any prompt"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # No escalation; refined cheap was shipped.
    assert decision.escalated is False
    assert decision.final_model == "claude-haiku-4-5"
    assert decision.verifier_score == pytest.approx(0.9)
    assert decision.meta["refined"] is True
    attempts = decision.meta["refinement_attempts"]
    assert len(attempts) == 1
    assert attempts[0]["accepted"] is True
    # Two cheap calls (original + 1 refinement), zero escalation calls.
    models = [c["model"] for c in llm.calls]
    assert models == ["claude-haiku-4-5", "claude-haiku-4-5"]


@pytest.mark.asyncio
async def test_refinement_exhausts_then_escalates():
    """All refinement attempts reject → cascade escalates as fallback."""
    llm = _VarLLM(["bad", "still bad", "sonnet response"])
    router = CascadeRouter(
        cfg={**_cfg(mode="active", threshold=0.7), "max_refinement_attempts": 1},
        verifier=_VarVerifier([0.1, 0.2]),  # both fail
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("hard prompt"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is True
    assert decision.final_model == "claude-sonnet-4-6"
    assert decision.meta.get("refined") is False
    attempts = decision.meta["refinement_attempts"]
    assert len(attempts) == 1
    assert attempts[0]["accepted"] is False
    # Cheap original + 1 refinement + 1 escalation = 3 LLM calls.
    models = [c["model"] for c in llm.calls]
    assert models == ["claude-haiku-4-5", "claude-haiku-4-5", "claude-sonnet-4-6"]


@pytest.mark.asyncio
async def test_refinement_disabled_when_max_attempts_zero():
    """max_refinement_attempts=0 disables the loop entirely; behavior
    matches pre-Move-5 cascade.
    """
    llm = _VarLLM(["bad", "sonnet"])
    router = CascadeRouter(
        cfg={**_cfg(mode="active", threshold=0.7), "max_refinement_attempts": 0},
        verifier=_VarVerifier([0.1]),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("any prompt"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.escalated is True
    assert decision.meta.get("refined") is None
    assert "refinement_attempts" not in decision.meta
    # Only 2 LLM calls: cheap + escalation, no refinement attempts.
    models = [c["model"] for c in llm.calls]
    assert models == ["claude-haiku-4-5", "claude-sonnet-4-6"]


@pytest.mark.asyncio
async def test_refinement_skipped_on_force_escalate_pattern():
    """Forced-escalation domains (code, summarize) bypass the verifier
    entirely. The refinement loop must also be skipped on those — the
    verifier cannot reliably grade them, so retries are wasted spend.
    """
    llm = _VarLLM(["def foo(): pass", "sonnet"])
    router = CascadeRouter(
        cfg={
            **_cfg(mode="active", threshold=0.7),
            "max_refinement_attempts": 3,
        },
        verifier=_VarVerifier([0.99]),  # would normally accept
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=[{"role": "user", "content": "```python\ndef foo():\n    pass\n```"}],
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # Forced escalation; refinement should NOT have run.
    assert decision.escalated is True
    assert decision.meta["forced_escalation_pattern"] is not None
    assert "refinement_attempts" not in decision.meta
    # Cheap + escalation only, no refinement retries.
    models = [c["model"] for c in llm.calls]
    assert models == ["claude-haiku-4-5", "claude-sonnet-4-6"]


@pytest.mark.asyncio
async def test_refinement_meta_records_per_attempt_scores():
    """Two refinement attempts both fail then escalate; meta carries the
    score per attempt for post-hoc analysis in cascade_decisions."""
    llm = _VarLLM(["a1", "a2", "a3", "sonnet"])
    router = CascadeRouter(
        cfg={**_cfg(mode="active", threshold=0.7), "max_refinement_attempts": 2},
        verifier=_VarVerifier([0.1, 0.2, 0.3]),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("hard"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    attempts = decision.meta["refinement_attempts"]
    assert len(attempts) == 2
    assert attempts[0]["score"] == pytest.approx(0.2)
    assert attempts[1]["score"] == pytest.approx(0.3)
    assert all(a["accepted"] is False for a in attempts)
    assert decision.escalated is True


@pytest.mark.asyncio
async def test_refinement_includes_diagnostic_in_followup_prompt():
    """The refinement turn's message list must contain the prior
    assistant answer + a user-role diagnostic message that nudges the
    cheap model to improve. We don't fix the exact wording, but we
    require the diagnostic to mention attempt count and the prior
    answer to appear in the conversation.
    """
    llm = _VarLLM(["first attempt", "second attempt"])
    router = CascadeRouter(
        cfg={**_cfg(mode="active", threshold=0.7), "max_refinement_attempts": 1},
        verifier=_VarVerifier([0.1, 0.9]),
        llm_service=llm,
    )
    await router.dispatch_with_verifier(
        messages=_messages("original prompt"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # Second LLM call (the refinement turn) should have the prior
    # assistant answer + a follow-up user message in its message list.
    refinement_call = llm.calls[1]
    msgs = refinement_call["messages"]
    # Original user prompt first, then assistant's prior answer, then
    # the diagnostic user message at the end.
    assert msgs[-2]["role"] == "assistant"
    assert msgs[-2]["content"] == "first attempt"
    assert msgs[-1]["role"] == "user"
    assert "improve" in msgs[-1]["content"].lower()

