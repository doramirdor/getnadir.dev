"""Tests for the Mode A heuristic-only decomposer (v0).

Trained classifier path is not exercised here — `is_classifier_available()`
is asserted False so the heuristic is the only branch. When the trained
head ships, add a second file (`test_decomposer_trained.py`) rather than
loosening these assertions.
"""
from __future__ import annotations

import pytest

from app.services.decomposer import Decomposer
from app.services.decomposer_taxonomy import SubTaskType


@pytest.fixture
def decomposer() -> Decomposer:
    return Decomposer()


def _user_body(text: str) -> dict:
    return {"messages": [{"role": "user", "content": text}]}


@pytest.mark.asyncio
async def test_traceback_routes_to_interpret_error(decomposer):
    body = _user_body(
        "Help me debug:\nTraceback (most recent call last):\n"
        '  File "x.py", line 4, in <module>\n    f()\nException: boom'
    )
    decision = await decomposer.classify_turn(body, user_config={})
    assert decision.sub_task is SubTaskType.INTERPRET_ERROR
    assert decision.tier == "complex"


@pytest.mark.asyncio
async def test_summarize_prompt_routes_to_summarize(decomposer):
    body = _user_body("Please summarize this article in one paragraph.")
    decision = await decomposer.classify_turn(body, user_config={})
    assert decision.sub_task is SubTaskType.SUMMARIZE
    assert decision.tier == "simple"


@pytest.mark.asyncio
async def test_translate_prompt_routes_to_translate(decomposer):
    body = _user_body("Translate the following paragraph to French, preserving tone.")
    decision = await decomposer.classify_turn(body, user_config={})
    assert decision.sub_task is SubTaskType.TRANSLATE
    assert decision.tier == "simple"


@pytest.mark.asyncio
async def test_planning_prompt_routes_to_plan(decomposer):
    body = _user_body("Let's plan the auth module rollout for next quarter.")
    decision = await decomposer.classify_turn(body, user_config={})
    assert decision.sub_task is SubTaskType.PLAN
    assert decision.tier == "complex"


@pytest.mark.asyncio
async def test_tool_result_block_routes_to_read(decomposer):
    body = {
        "messages": [
            {
                "role": "assistant",
                "content": [
                    {"type": "tool_use", "id": "t1", "name": "read", "input": {}}
                ],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": "t1",
                        "content": "file contents here",
                    }
                ],
            },
        ]
    }
    decision = await decomposer.classify_turn(body, user_config={})
    assert decision.sub_task is SubTaskType.READ
    assert decision.tier == "simple"


@pytest.mark.asyncio
async def test_short_imperative_routes_to_execute(decomposer):
    body = _user_body("run the tests")
    decision = await decomposer.classify_turn(body, user_config={})
    assert decision.sub_task is SubTaskType.EXECUTE
    assert decision.tier == "simple"


@pytest.mark.asyncio
async def test_heuristic_source_and_confidence(decomposer):
    body = _user_body("Please summarize this article.")
    decision = await decomposer.classify_turn(body, user_config={})
    assert decision.source == "heuristic_fallback"
    assert decision.confidence == pytest.approx(0.55)


def test_is_classifier_available_false_in_v0(decomposer):
    # No model_path passed; v0 ships without weights so the classifier
    # branch must stay dead.
    assert decomposer.is_classifier_available() is False
    # Also true when an unrelated `model_path` string is provided but no
    # weights actually load (v0 ignores it entirely).
    d2 = Decomposer(model_path="/nonexistent/decomposer_head_v1.pt")
    assert d2.is_classifier_available() is False
