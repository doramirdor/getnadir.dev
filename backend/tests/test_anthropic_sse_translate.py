"""Tests for AnthropicSseTranslator.

All 7 blueprint sequences plus reviewer must-fix cancel-ownership test and
the out-of-order parallel tool-call assertion.
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator, List, Tuple

import pytest

from app.services.anthropic_sse_translate import (
    AnthropicSseTranslator,
    _is_skipworthy_chunk,
)


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


def _oai_frame(payload: dict) -> bytes:
    """Encode a single OpenAI-shape SSE frame from a payload dict."""
    return b"data: " + json.dumps(payload).encode() + b"\n\n"


def _oai_done() -> bytes:
    return b"data: [DONE]\n\n"


async def _stream_from(frames: List[bytes]) -> AsyncIterator[bytes]:
    for frame in frames:
        yield frame


def _parse_sse_frames(raw: bytes) -> List[Tuple[str, dict]]:
    """Parse an Anthropic SSE byte stream into [(event_type, data_dict), ...]."""
    out: List[Tuple[str, dict]] = []
    for frame in raw.split(b"\n\n"):
        if not frame.strip():
            continue
        event = ""
        data_str = ""
        for line in frame.split(b"\n"):
            line_s = line.decode("utf-8")
            if line_s.startswith("event:"):
                event = line_s[len("event:"):].strip()
            elif line_s.startswith("data:"):
                data_str = line_s[len("data:"):].strip()
        if event and data_str:
            try:
                out.append((event, json.loads(data_str)))
            except json.JSONDecodeError:
                pass
    return out


async def _drain(agen) -> bytes:
    buf = bytearray()
    async for chunk in agen:
        buf.extend(chunk)
    return bytes(buf)


# ---------------------------------------------------------------------------
# Skipworthy-chunk predicate (reviewer must-fix #1)
# ---------------------------------------------------------------------------


class TestSkipworthyPredicate:
    def test_empty_choices_skipped(self):
        assert _is_skipworthy_chunk({"choices": []}) is True

    def test_role_only_delta_skipped(self):
        chunk = {"choices": [{"delta": {"role": "assistant"}, "finish_reason": None}]}
        assert _is_skipworthy_chunk(chunk) is True

    def test_reasoning_only_delta_skipped(self):
        chunk = {"choices": [{"delta": {"reasoning": "think..."}, "finish_reason": None}]}
        assert _is_skipworthy_chunk(chunk) is True

    def test_content_delta_not_skipped(self):
        chunk = {"choices": [{"delta": {"content": "hi"}, "finish_reason": None}]}
        assert _is_skipworthy_chunk(chunk) is False

    def test_finish_reason_not_skipped(self):
        chunk = {"choices": [{"delta": {}, "finish_reason": "stop"}]}
        assert _is_skipworthy_chunk(chunk) is False

    def test_tool_call_with_name_not_skipped(self):
        chunk = {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"name": "calc"}}]}, "finish_reason": None}]}
        assert _is_skipworthy_chunk(chunk) is False

    def test_tool_call_with_args_not_skipped(self):
        chunk = {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": "{"}}]}, "finish_reason": None}]}
        assert _is_skipworthy_chunk(chunk) is False

    def test_refusal_not_skipped(self):
        chunk = {"choices": [{"delta": {"refusal": "I can't"}, "finish_reason": None}]}
        assert _is_skipworthy_chunk(chunk) is False

    def test_empty_content_skipped(self):
        chunk = {"choices": [{"delta": {"content": ""}, "finish_reason": None}]}
        assert _is_skipworthy_chunk(chunk) is True


# ---------------------------------------------------------------------------
# Sequence 1: text-only response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sequence_1_text_only_response():
    frames = [
        _oai_frame({"choices": [{"delta": {"role": "assistant"}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {"content": "Hello"}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {"content": " world"}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {}, "finish_reason": "stop"}]}),
        _oai_done(),
    ]
    translator = AnthropicSseTranslator("msg_test", "claude-sonnet-4-6")
    raw = await _drain(translator.translate(_stream_from(frames)))
    events = _parse_sse_frames(raw)

    types = [e for e, _ in events]
    assert types == [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
    ]
    # Block-start announces text content type.
    assert events[1][1]["content_block"]["type"] == "text"
    # Deltas carry text_delta payloads.
    assert events[2][1]["delta"] == {"type": "text_delta", "text": "Hello"}
    assert events[3][1]["delta"] == {"type": "text_delta", "text": " world"}
    # Stop reason maps stop -> end_turn.
    assert events[5][1]["delta"]["stop_reason"] == "end_turn"


# ---------------------------------------------------------------------------
# Sequence 2: single tool call, multi-fragment args, batched delta
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sequence_2_single_tool_multi_fragment_args_batched():
    frames = [
        _oai_frame({"choices": [{"delta": {"tool_calls": [
            {"index": 0, "id": "call_abc", "type": "function", "function": {"name": "calc", "arguments": ""}}
        ]}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {"tool_calls": [
            {"index": 0, "function": {"arguments": "{\"x\":"}}
        ]}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {"tool_calls": [
            {"index": 0, "function": {"arguments": " 2,"}}
        ]}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {"tool_calls": [
            {"index": 0, "function": {"arguments": " \"y\": 3}"}}
        ]}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {}, "finish_reason": "tool_calls"}]}),
        _oai_done(),
    ]
    translator = AnthropicSseTranslator("msg_t2", "claude-sonnet-4-6")
    raw = await _drain(translator.translate(_stream_from(frames)))
    events = _parse_sse_frames(raw)

    types = [e for e, _ in events]
    assert types == [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
    ]
    # Single batched input_json_delta with the FULL JSON.
    delta_events = [d for e, d in events if e == "content_block_delta"]
    assert len(delta_events) == 1
    assert delta_events[0]["delta"]["type"] == "input_json_delta"
    full_args = delta_events[0]["delta"]["partial_json"]
    # Full args is the concatenation.
    assert full_args == "{\"x\": 2, \"y\": 3}"
    # Tool use ID preserved from OpenAI side.
    assert events[1][1]["content_block"]["id"] == "call_abc"
    assert events[1][1]["content_block"]["name"] == "calc"
    # Stop reason maps tool_calls -> tool_use.
    msg_delta = [d for e, d in events if e == "message_delta"][0]
    assert msg_delta["delta"]["stop_reason"] == "tool_use"


# ---------------------------------------------------------------------------
# Sequence 3: mixed text then tool
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sequence_3_mixed_text_then_tool():
    frames = [
        _oai_frame({"choices": [{"delta": {"content": "Let me check. "}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {"tool_calls": [
            {"index": 0, "id": "call_1", "type": "function", "function": {"name": "calc", "arguments": "{\"x\":1}"}}
        ]}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {}, "finish_reason": "tool_calls"}]}),
        _oai_done(),
    ]
    translator = AnthropicSseTranslator("msg_t3", "claude-sonnet-4-6")
    raw = await _drain(translator.translate(_stream_from(frames)))
    events = _parse_sse_frames(raw)

    # Two blocks: text at idx 0, tool_use at idx 1.
    starts = [(e, d["index"], d["content_block"]["type"]) for e, d in events if e == "content_block_start"]
    assert starts == [
        ("content_block_start", 0, "text"),
        ("content_block_start", 1, "tool_use"),
    ]
    stops = [d["index"] for e, d in events if e == "content_block_stop"]
    assert stops == [0, 1]


# ---------------------------------------------------------------------------
# Sequence 4: finish=length -> max_tokens
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sequence_4_finish_length_maps_to_max_tokens():
    frames = [
        _oai_frame({"choices": [{"delta": {"content": "partial"}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {}, "finish_reason": "length"}]}),
        _oai_done(),
    ]
    translator = AnthropicSseTranslator("msg_t4", "claude-sonnet-4-6")
    raw = await _drain(translator.translate(_stream_from(frames)))
    events = _parse_sse_frames(raw)
    msg_delta = [d for e, d in events if e == "message_delta"][0]
    assert msg_delta["delta"]["stop_reason"] == "max_tokens"


# ---------------------------------------------------------------------------
# Sequence 5: mid-stream RemoteProtocolError -> terminal frame
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sequence_5_mid_stream_error_emits_terminal_frame():
    async def faulty_stream() -> AsyncIterator[bytes]:
        yield _oai_frame({"choices": [{"delta": {"content": "Hello"}, "finish_reason": None}]})
        import httpx
        raise httpx.RemoteProtocolError("connection lost")

    translator = AnthropicSseTranslator("msg_t5", "claude-sonnet-4-6")
    out = bytearray()
    raised = False
    try:
        async for chunk in translator.translate(faulty_stream()):
            out.extend(chunk)
    except Exception:  # noqa: BLE001
        raised = True

    assert raised, "Translator must re-raise after finalize"
    events = _parse_sse_frames(bytes(out))
    types = [e for e, _ in events]
    # Must have emitted: message_start, content_block_start(text),
    # content_block_delta(text), then finally block: content_block_stop,
    # message_delta(error), message_stop.
    assert types[:3] == ["message_start", "content_block_start", "content_block_delta"]
    assert types[-3:] == ["content_block_stop", "message_delta", "message_stop"]
    msg_delta = [d for e, d in events if e == "message_delta"][0]
    assert msg_delta["delta"]["stop_reason"] == "error"


# ---------------------------------------------------------------------------
# Sequence 6: two sequential tool calls with OUT-OF-ORDER OAI index
# (reviewer should-fix #6)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sequence_6_parallel_out_of_order_oai_index():
    """Send OAI tool_calls index=2 BEFORE index=0. Anthropic block_start
    events must appear in OAI arrival order with distinct tool_use ids.
    """
    frames = [
        # First tool_call announced at OAI index=2.
        _oai_frame({"choices": [{"delta": {"tool_calls": [
            {"index": 2, "id": "call_z", "type": "function", "function": {"name": "second_tool", "arguments": "{\"a\":1}"}}
        ]}, "finish_reason": None}]}),
        # Second tool_call announced at OAI index=0.
        _oai_frame({"choices": [{"delta": {"tool_calls": [
            {"index": 0, "id": "call_a", "type": "function", "function": {"name": "first_tool", "arguments": "{\"b\":2}"}}
        ]}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {}, "finish_reason": "tool_calls"}]}),
        _oai_done(),
    ]
    translator = AnthropicSseTranslator("msg_t6", "claude-sonnet-4-6")
    raw = await _drain(translator.translate(_stream_from(frames)))
    events = _parse_sse_frames(raw)

    starts = [d for e, d in events if e == "content_block_start"]
    assert len(starts) == 2
    # Arrival order preserved: second_tool first, then first_tool.
    assert starts[0]["content_block"]["name"] == "second_tool"
    assert starts[0]["content_block"]["id"] == "call_z"
    assert starts[1]["content_block"]["name"] == "first_tool"
    assert starts[1]["content_block"]["id"] == "call_a"
    # Distinct anthropic block indexes, contiguous starting at 0.
    assert starts[0]["index"] == 0
    assert starts[1]["index"] == 1
    # tool_use IDs distinct.
    assert starts[0]["content_block"]["id"] != starts[1]["content_block"]["id"]


# ---------------------------------------------------------------------------
# Sequence 7: empty/role-only deltas silently ignored
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sequence_7_empty_deltas_ignored():
    frames = [
        _oai_frame({"choices": [{"delta": {}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {"role": "assistant"}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {"content": "real"}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {}, "finish_reason": "stop"}]}),
        _oai_done(),
    ]
    translator = AnthropicSseTranslator("msg_t7", "claude-sonnet-4-6")
    raw = await _drain(translator.translate(_stream_from(frames)))
    events = _parse_sse_frames(raw)
    types = [e for e, _ in events]
    # message_start appears exactly once, on the FIRST real delta.
    assert types.count("message_start") == 1
    # content_block_delta(text) only once with the real content.
    deltas = [d for e, d in events if e == "content_block_delta"]
    assert len(deltas) == 1
    assert deltas[0]["delta"]["text"] == "real"


# ---------------------------------------------------------------------------
# Reviewer must-fix #3: CancelledError ownership
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cancelled_error_translator_emits_terminal_frames_then_reraises():
    """The translator's finally must flush a terminal frame on CancelledError,
    and re-raise. Caller must NOT emit its own terminal frame.
    """
    async def cancelling_stream() -> AsyncIterator[bytes]:
        yield _oai_frame({"choices": [{"delta": {"content": "partial"}, "finish_reason": None}]})
        raise asyncio.CancelledError()

    translator = AnthropicSseTranslator("msg_cancel", "claude-sonnet-4-6")
    out = bytearray()
    cancelled = False
    try:
        async for chunk in translator.translate(cancelling_stream()):
            out.extend(chunk)
    except asyncio.CancelledError:
        cancelled = True
    except BaseException:  # noqa: BLE001
        pass

    assert cancelled, "CancelledError must propagate"
    events = _parse_sse_frames(bytes(out))
    types = [e for e, _ in events]
    # Translator finalize emitted content_block_stop + message_delta + message_stop.
    assert "message_stop" in types
    msg_delta = [d for e, d in events if e == "message_delta"][0]
    assert msg_delta["delta"]["stop_reason"] == "error"
    # Exactly one message_stop emitted by translator (no double-emit risk).
    assert types.count("message_stop") == 1


# ---------------------------------------------------------------------------
# Usage extraction from final stream_options chunk
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_usage_chunk_extracted_into_message_delta():
    frames = [
        _oai_frame({"choices": [{"delta": {"content": "ok"}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {}, "finish_reason": "stop"}]}),
        # Final usage-only chunk emitted when stream_options.include_usage=True.
        _oai_frame({"choices": [], "usage": {"prompt_tokens": 11, "completion_tokens": 22}}),
        _oai_done(),
    ]
    translator = AnthropicSseTranslator("msg_usage", "claude-sonnet-4-6")
    raw = await _drain(translator.translate(_stream_from(frames)))
    events = _parse_sse_frames(raw)
    msg_delta = [d for e, d in events if e == "message_delta"][0]
    assert msg_delta["usage"]["input_tokens"] == 11
    assert msg_delta["usage"]["output_tokens"] == 22


# ---------------------------------------------------------------------------
# Refusal handling -> text + content_filter -> stop_sequence
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refusal_opens_text_block_and_maps_content_filter():
    frames = [
        _oai_frame({"choices": [{"delta": {"refusal": "I can't help with that."}, "finish_reason": None}]}),
        _oai_frame({"choices": [{"delta": {}, "finish_reason": "content_filter"}]}),
        _oai_done(),
    ]
    translator = AnthropicSseTranslator("msg_ref", "claude-sonnet-4-6")
    raw = await _drain(translator.translate(_stream_from(frames)))
    events = _parse_sse_frames(raw)
    types = [e for e, _ in events]
    assert "content_block_start" in types
    # Refusal text shows up as text_delta.
    deltas = [d for e, d in events if e == "content_block_delta"]
    assert deltas and deltas[0]["delta"]["type"] == "text_delta"
    assert deltas[0]["delta"]["text"] == "I can't help with that."
    msg_delta = [d for e, d in events if e == "message_delta"][0]
    assert msg_delta["delta"]["stop_reason"] == "stop_sequence"
