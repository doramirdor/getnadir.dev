"""Tests for per-domain acceptance thresholds in ``CascadeRouter``.

The held-out eval flagged code (AUROC 0.66), summarization (0.78), and
math (0.79) as domains where the verifier's grading is too noisy to
trust at the default 0.70 acceptance threshold. ``CascadeRouter`` now
raises the threshold on prompts that match those domain patterns. These
tests exercise the resolution rules: match → tighter threshold,
no-match → unchanged, multiple matches → strictest wins, and the
``meta`` carries the matched patterns + effective threshold for
post-hoc analysis.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock

import pytest

from app.services.cascade_router import (
    CascadeRouter,
    DEFAULT_ACCEPTANCE_THRESHOLD,
    DEFAULT_DOMAIN_THRESHOLDS,
    _resolve_effective_threshold,
)
from app.services.verifier_model import VerifierModel


@pytest.fixture(autouse=True)
def _clear_verifier_cache_between_tests():
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
# Fixtures
# ---------------------------------------------------------------------------


class _FakeLLM:
    def __init__(self):
        self.calls: List[Dict[str, Any]] = []

    async def call(self, messages, model, user_session):
        self.calls.append({"model": model, "messages": messages})
        return {
            "choices": [
                {"message": {"role": "assistant", "content": f"answer from {model}"}}
            ]
        }


def _verifier_with_score(score: float) -> VerifierModel:
    return VerifierModel(transport_fn=lambda _payload: score)


def _user_session():
    sess = MagicMock()
    sess.id = "00000000-0000-0000-0000-000000000777"
    return sess


def _messages(text: str) -> List[Dict[str, Any]]:
    return [{"role": "user", "content": text}]


def _cfg(
    *,
    threshold: float = 0.70,
    domain_thresholds: Optional[List[List[Any]]] = None,
    force_escalate_patterns: Optional[List[str]] = None,
) -> Dict[str, Any]:
    cfg: Dict[str, Any] = {
        "enabled": True,
        "mode": "active",
        "acceptance_threshold": threshold,
        "escalation_models": {"simple": "claude-sonnet-4-6"},
        # Disable the legacy force-escalate gate so this suite measures
        # the threshold logic in isolation.
        "force_escalate_patterns": force_escalate_patterns
        if force_escalate_patterns is not None
        else [],
    }
    if domain_thresholds is not None:
        cfg["domain_thresholds"] = domain_thresholds
    return cfg


# ---------------------------------------------------------------------------
# 1. DEFAULT_DOMAIN_THRESHOLDS shape matches the eval spec
# ---------------------------------------------------------------------------


def test_default_domain_thresholds_constant_shape():
    """Sanity-check the constant: tuple of (pattern, threshold) pairs.
    Patterns are non-empty strings; thresholds are floats > default."""
    assert isinstance(DEFAULT_DOMAIN_THRESHOLDS, tuple)
    assert len(DEFAULT_DOMAIN_THRESHOLDS) >= 5
    patterns = {p for p, _ in DEFAULT_DOMAIN_THRESHOLDS}
    # Eval-flagged domains are represented.
    assert any("python" in p for p in patterns)
    assert any("summarize" in p for p in patterns)
    assert any("solve for" in p for p in patterns)
    for pattern, thr in DEFAULT_DOMAIN_THRESHOLDS:
        assert isinstance(pattern, str) and pattern
        assert isinstance(thr, float)
        # Domain thresholds are at least as strict as the global default.
        # When the default rises (e.g. 0.70 → 0.80) some domain thresholds
        # may collapse to equality with the default; that is acceptable
        # because the floor itself moved up. The invariant is "untrusted
        # domains require AT LEAST the global default" — see cascade_router.py.
        assert thr >= DEFAULT_ACCEPTANCE_THRESHOLD


# ---------------------------------------------------------------------------
# 2. Helper: no match → returns default unchanged
# ---------------------------------------------------------------------------


def test_resolve_no_match_returns_default():
    matched, effective = _resolve_effective_threshold(
        "what is the capital of france",
        DEFAULT_DOMAIN_THRESHOLDS,
        default_threshold=0.70,
    )
    assert matched == []
    assert effective == 0.70


def test_resolve_empty_text_returns_default():
    matched, effective = _resolve_effective_threshold(
        "", DEFAULT_DOMAIN_THRESHOLDS, default_threshold=0.70
    )
    assert matched == []
    assert effective == 0.70


def test_resolve_empty_thresholds_returns_default():
    matched, effective = _resolve_effective_threshold(
        "```python\nprint(1)\n```", None, default_threshold=0.70
    )
    assert matched == []
    assert effective == 0.70


# ---------------------------------------------------------------------------
# 3. Helper: match → strictest threshold wins (max across matches and default)
# ---------------------------------------------------------------------------


def test_resolve_single_match_raises_threshold():
    matched, effective = _resolve_effective_threshold(
        "```python\nprint(1)\n```",
        DEFAULT_DOMAIN_THRESHOLDS,
        default_threshold=0.70,
    )
    assert "```python" in matched
    assert effective == pytest.approx(0.85)


def test_resolve_multiple_matches_picks_max():
    """A prompt that hits two domain patterns gets the stricter threshold."""
    text = "```python\nplease summarize this code\n```"
    matched, effective = _resolve_effective_threshold(
        text,
        DEFAULT_DOMAIN_THRESHOLDS,
        default_threshold=0.70,
    )
    # Both "```python" (0.85) and "summarize" (0.80) match.
    assert "```python" in matched
    assert "summarize" in matched
    assert effective == pytest.approx(0.85)


def test_resolve_default_already_higher_keeps_default():
    """If the cfg default threshold is already stricter than any matched
    domain threshold, the default wins (we never lower the bar)."""
    matched, effective = _resolve_effective_threshold(
        "summarize this paragraph please",
        DEFAULT_DOMAIN_THRESHOLDS,
        default_threshold=0.95,
    )
    assert "summarize" in matched
    assert effective == pytest.approx(0.95)


def test_resolve_case_insensitive():
    matched, effective = _resolve_effective_threshold(
        "Please SUMMARIZE the following text",
        DEFAULT_DOMAIN_THRESHOLDS,
        default_threshold=0.70,
    )
    assert "summarize" in matched
    assert effective == pytest.approx(0.80)


def test_resolve_accepts_list_of_lists_override():
    """Customers can supply per-profile thresholds as list-of-lists
    (typical jsonb shape from supabase)."""
    override = [["MAGIC_TOKEN", 0.92], ["other", 0.75]]
    matched, effective = _resolve_effective_threshold(
        "this has MAGIC_TOKEN in it",
        override,
        default_threshold=0.70,
    )
    assert matched == ["MAGIC_TOKEN"]
    assert effective == pytest.approx(0.92)


def test_resolve_skips_malformed_pairs():
    """Invalid entries (wrong shape, non-numeric threshold) are silently
    skipped — the rest of the list still applies."""
    junk = [
        ["fine_pattern", 0.81],
        ["bad_threshold", "not-a-float"],
        "not-a-pair",
        ["", 0.99],  # empty pattern, ignored
        ["only_one_element"],
    ]
    matched, effective = _resolve_effective_threshold(
        "this has fine_pattern in it",
        junk,
        default_threshold=0.70,
    )
    assert matched == ["fine_pattern"]
    assert effective == pytest.approx(0.81)


# ---------------------------------------------------------------------------
# 4. dispatch_with_verifier: default thresholds applied on prompt match
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_default_domain_threshold_applied_on_match():
    """Verifier score 0.80 normally accepts (>= 0.70 default), but a code
    prompt raises the effective threshold to 0.85 and forces escalation.
    """
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg=_cfg(threshold=0.70),
        verifier=_verifier_with_score(0.80),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("```python\ndef foo():\n    pass\n```"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # 0.80 < effective 0.85 → escalate.
    assert decision.escalated is True
    assert decision.final_model == "claude-sonnet-4-6"
    assert decision.meta["effective_threshold"] == pytest.approx(0.85)
    assert decision.meta["default_threshold"] == pytest.approx(0.70)
    assert "```python" in decision.meta["matched_domain_patterns"]


# ---------------------------------------------------------------------------
# 5. Custom thresholds override default constant
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_custom_domain_thresholds_override_defaults():
    """cfg.domain_thresholds fully replaces DEFAULT_DOMAIN_THRESHOLDS. A
    code prompt that would normally raise to 0.85 no longer does, because
    the customer didn't include a python pattern."""
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg=_cfg(
            threshold=0.70,
            domain_thresholds=[["CUSTOMER_X", 0.99]],
        ),
        verifier=_verifier_with_score(0.80),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("```python\ndef foo():\n    pass\n```"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # No domain match → effective threshold stays at default 0.70.
    # 0.80 >= 0.70 → cheap accepted.
    assert decision.escalated is False
    assert decision.meta["effective_threshold"] == pytest.approx(0.70)
    assert decision.meta["matched_domain_patterns"] == []


# ---------------------------------------------------------------------------
# 6. No match leaves default threshold unchanged
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_domain_match_uses_default_threshold():
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg=_cfg(threshold=0.70),
        verifier=_verifier_with_score(0.71),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("what is the capital of france"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # 0.71 >= 0.70 default → accept.
    assert decision.escalated is False
    assert decision.meta["effective_threshold"] == pytest.approx(0.70)
    assert decision.meta["matched_domain_patterns"] == []


# ---------------------------------------------------------------------------
# 7. Max-aggregation when multiple patterns match
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_multiple_patterns_pick_strictest_threshold():
    """A prompt that triggers BOTH a code (0.85) and summarize (0.80)
    pattern uses the stricter 0.85 floor."""
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg=_cfg(threshold=0.70),
        verifier=_verifier_with_score(0.82),  # passes 0.80 but fails 0.85
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("```python\n# please summarize this\n```"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert decision.meta["effective_threshold"] == pytest.approx(0.85)
    patterns = decision.meta["matched_domain_patterns"]
    assert "```python" in patterns
    assert "summarize" in patterns
    # 0.82 < 0.85 → escalate.
    assert decision.escalated is True


# ---------------------------------------------------------------------------
# 8. Meta carries matched_domain_patterns + effective_threshold
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_meta_carries_matched_patterns_and_thresholds():
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg=_cfg(threshold=0.70),
        verifier=_verifier_with_score(0.95),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("solve for x: 2x + 3 = 7"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    assert "matched_domain_patterns" in decision.meta
    assert "effective_threshold" in decision.meta
    assert "default_threshold" in decision.meta
    assert "solve for" in decision.meta["matched_domain_patterns"]
    assert decision.meta["effective_threshold"] == pytest.approx(0.80)
    assert decision.meta["default_threshold"] == pytest.approx(0.70)


# ---------------------------------------------------------------------------
# 9. Backward-compat: cfg without domain_thresholds still uses defaults
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cfg_without_domain_thresholds_falls_back_to_default_constant():
    """Production cfg today does not set ``domain_thresholds``. Default
    constant must kick in on prompt match so production gets the
    tighter bar automatically."""
    cfg = {
        "enabled": True,
        "mode": "active",
        "acceptance_threshold": 0.70,
        "escalation_models": {"simple": "claude-sonnet-4-6"},
        # Disable force-escalate to isolate threshold logic.
        "force_escalate_patterns": [],
        # NOTE: no `domain_thresholds` key.
    }
    llm = _FakeLLM()
    router = CascadeRouter(
        cfg=cfg,
        verifier=_verifier_with_score(0.80),
        llm_service=llm,
    )
    decision = await router.dispatch_with_verifier(
        messages=_messages("```python\nprint(1)\n```"),
        cheap_model="claude-haiku-4-5",
        tier_name="simple",
        user_session=_user_session(),
    )
    # Default constant raised threshold to 0.85; 0.80 < 0.85 → escalate.
    assert decision.escalated is True
    assert decision.meta["effective_threshold"] == pytest.approx(0.85)
