"""Tests for OCRJudge (LLM-as-judge for outcome-conditioned retraining).

No real LLM calls — every test injects a mock `completion_fn`.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest

from app.services.ocr_judge import (
    JUDGE_PROMPT_TEMPLATE,
    OCRJudge,
    _parse_judge_json,
)


def _fake_response(content: str) -> Dict[str, Any]:
    """Build a LiteLLM-shaped response dict around a content string."""
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}


class _RecordingCompletion:
    """Sync mock that records every call and returns successive scripted contents."""

    def __init__(self, contents: List[str]):
        self.contents = list(contents)
        self.calls: List[Dict[str, Any]] = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        if not self.contents:
            raise AssertionError("ran out of scripted responses")
        return _fake_response(self.contents.pop(0))


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


# ---------------------------------------------------------------------------
# Parse-level tests
# ---------------------------------------------------------------------------


def test_parse_well_formed_json():
    raw = '{"accept": true, "confidence": 0.9, "reasoning": "looks fine"}'
    parsed = _parse_judge_json(raw)
    assert parsed is not None
    assert parsed["accept"] is True
    assert parsed["confidence"] == pytest.approx(0.9)
    assert parsed["reasoning"] == "looks fine"


def test_parse_prose_prefixed_json():
    raw = 'Here is my judgement: {"accept": false, "confidence": 0.81, "reasoning": "hallucinated city"}'
    parsed = _parse_judge_json(raw)
    assert parsed is not None
    assert parsed["accept"] is False
    assert parsed["confidence"] == pytest.approx(0.81)
    assert "hallucinated" in parsed["reasoning"]


def test_parse_broken_returns_none():
    assert _parse_judge_json("definitely not json") is None
    assert _parse_judge_json("") is None
    assert _parse_judge_json("{not: valid, json}") is None


# ---------------------------------------------------------------------------
# Judge behavior tests
# ---------------------------------------------------------------------------


def test_judge_returns_parsed_verdict_on_clean_response():
    completion = _RecordingCompletion(
        ['{"accept": true, "confidence": 0.92, "reasoning": "complete + correct"}']
    )
    judge = OCRJudge(completion_fn=completion)
    out = asyncio.run(judge.judge("what is 2+2?", "4"))
    assert out["accept"] is True
    assert out["confidence"] == pytest.approx(0.92)
    assert out["reasoning"] == "complete + correct"
    assert "raw" in out
    assert len(completion.calls) == 1


def test_judge_falls_back_to_confidence_zero_on_total_parse_failure():
    # Both attempts return garbage. With max_retries=1 we get 2 attempts total.
    completion = _RecordingCompletion(["lol nope", "still no json"])
    judge = OCRJudge(completion_fn=completion, max_retries=1)
    out = asyncio.run(judge.judge("p", "r"))
    assert out["accept"] is False
    assert out["confidence"] == 0.0
    assert out["reasoning"] == "parse_failure"
    # Two attempts consumed.
    assert len(completion.calls) == 2


def test_judge_retries_until_a_parseable_response():
    # Garbage, garbage, then good. max_retries=2 → 3 attempts.
    completion = _RecordingCompletion(
        [
            "no json here",
            "still nope",
            '{"accept": true, "confidence": 0.7, "reasoning": "ok"}',
        ]
    )
    judge = OCRJudge(completion_fn=completion, max_retries=2)
    out = asyncio.run(judge.judge("p", "r"))
    assert out["accept"] is True
    assert out["confidence"] == pytest.approx(0.7)
    assert len(completion.calls) == 3


def test_prompt_template_substitutes_correctly_and_leaves_braces_literal():
    rendered = JUDGE_PROMPT_TEMPLATE.format(prompt="hi there", response="hello!")
    assert "hi there" in rendered
    assert "hello!" in rendered
    # The JSON example braces must remain literal in the rendered template.
    assert '{"accept": true_or_false' in rendered
    # And the substitution placeholders are gone.
    assert "{prompt}" not in rendered
    assert "{response}" not in rendered


def test_custom_model_name_is_honored():
    completion = _RecordingCompletion(
        ['{"accept": true, "confidence": 0.8, "reasoning": "ok"}']
    )
    judge = OCRJudge(model="claude-opus-4-6", completion_fn=completion)
    asyncio.run(judge.judge("p", "r"))
    assert completion.calls[0]["model"] == "claude-opus-4-6"


def test_confidence_is_clamped_into_unit_interval():
    completion = _RecordingCompletion(
        ['{"accept": true, "confidence": 2.5, "reasoning": "out of range"}']
    )
    judge = OCRJudge(completion_fn=completion)
    out = asyncio.run(judge.judge("p", "r"))
    assert out["confidence"] == 1.0


def test_judge_handles_async_completion_fn():
    """Some callers pass an async mock — make sure we await it."""

    async def fake(**kwargs):
        return _fake_response(
            '{"accept": false, "confidence": 0.55, "reasoning": "async path"}'
        )

    judge = OCRJudge(completion_fn=fake)
    out = asyncio.run(judge.judge("p", "r"))
    assert out["accept"] is False
    assert out["confidence"] == pytest.approx(0.55)
