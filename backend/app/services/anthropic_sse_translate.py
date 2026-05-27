"""OpenAI Chat Completions SSE -> Anthropic Messages SSE translator.

Streams OpenAI-shape Server-Sent Events from an async byte iterator, parses
them into delta chunks, and emits the equivalent Anthropic Messages event
sequence (`message_start`, `content_block_start`, `content_block_delta`,
`content_block_stop`, `message_delta`, `message_stop`).

Tool-call argument fragments are buffered and emitted as a single
`input_json_delta` on block close. This gives Anthropic clients a valid JSON
string per tool block regardless of upstream fragmentation.

Per WS-2 W2 reviewer must-fix #3, `translate()` owns terminal-frame emission
via try/finally. The outer route handler should NOT yield a frame on
CancelledError.
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sse(event_type: str, data: Dict[str, Any]) -> bytes:
    """Format an Anthropic SSE frame: `event: <type>\\ndata: <json>\\n\\n`."""
    return (
        b"event: "
        + event_type.encode("utf-8")
        + b"\ndata: "
        + json.dumps(data).encode("utf-8")
        + b"\n\n"
    )


def _new_tool_use_id() -> str:
    return f"toolu_{uuid.uuid4().hex[:24]}"


_FINISH_REASON_MAP = {
    "stop": "end_turn",
    "length": "max_tokens",
    "tool_calls": "tool_use",
    "content_filter": "stop_sequence",
}


def _map_finish_reason(reason: Optional[str]) -> str:
    if not reason:
        return "end_turn"
    return _FINISH_REASON_MAP.get(reason, "end_turn")


# ---------------------------------------------------------------------------
# ToolCallAccumulator
# ---------------------------------------------------------------------------


@dataclass
class ToolCallAccumulator:
    """Per-tool-call state for streaming argument fragments.

    Keyed by the OpenAI `tool_calls[i].index`. The `anthropic_block_index`
    is independent — assigned in name-appearance order so the Anthropic
    block sequence is always contiguous even when OpenAI sends indices
    out of order or with gaps.
    """
    openai_index: int
    tool_use_id: str
    name: str
    args_buffer: str = ""
    anthropic_block_index: int = 0
    emitted_start: bool = False


# ---------------------------------------------------------------------------
# Skipworthy-chunk predicate (reviewer must-fix #1)
# ---------------------------------------------------------------------------


def _is_skipworthy_chunk(parsed: Dict[str, Any]) -> bool:
    """Return True iff a parsed OpenAI chunk carries no semantic signal.

    A chunk is skipworthy iff:
      - choices[0].finish_reason is None
      - choices[0].delta has no non-empty `content` string
      - choices[0].delta has no `tool_calls` entry with a non-null
        `function.name` or a non-empty `function.arguments`
      - choices[0].delta has no non-empty `refusal`

    `delta.role`-only and `delta.reasoning`-only chunks are skipworthy.
    Empty `choices` arrays (e.g. usage-only final chunks) are also skipworthy
    here; usage extraction is performed elsewhere before this predicate.
    """
    choices = parsed.get("choices") or []
    if not choices:
        return True
    first = choices[0] if isinstance(choices[0], dict) else {}
    if first.get("finish_reason"):
        return False
    delta = first.get("delta") or {}
    if not isinstance(delta, dict):
        return True

    content = delta.get("content")
    if isinstance(content, str) and content:
        return False

    refusal = delta.get("refusal")
    if isinstance(refusal, str) and refusal:
        return False

    tcs = delta.get("tool_calls")
    if isinstance(tcs, list):
        for tc in tcs:
            if not isinstance(tc, dict):
                continue
            fn = tc.get("function") or {}
            if isinstance(fn, dict):
                if fn.get("name"):
                    return False
                args = fn.get("arguments")
                if isinstance(args, str) and args:
                    return False

    return True


# ---------------------------------------------------------------------------
# AnthropicSseTranslator
# ---------------------------------------------------------------------------


# State constants
_IDLE = "IDLE"
_TEXT_OPEN = "TEXT_OPEN"
_TOOL_OPEN = "TOOL_OPEN"
_DONE = "DONE"


class AnthropicSseTranslator:
    """Translate an OpenAI Chat Completions SSE byte stream to Anthropic Messages SSE.

    Use:
        translator = AnthropicSseTranslator(msg_id, target_model)
        async for frame in translator.translate(openai_byte_stream):
            yield frame

    Owns terminal-frame emission via `try/finally` in `translate`. Callers
    must NOT emit their own terminal frame on CancelledError; just re-raise.
    """

    def __init__(self, msg_id: str, target_model: str) -> None:
        self._msg_id = msg_id
        self._model = target_model
        self._state = _IDLE
        self._text_block_index: Optional[int] = None
        self._next_anthropic_index = 0
        self._tool_accumulators: Dict[int, ToolCallAccumulator] = {}
        # Ordered list of accumulators by anthropic_block_index for flushing.
        self._tool_order: list[ToolCallAccumulator] = []
        self._current_tool: Optional[ToolCallAccumulator] = None
        self._message_started = False
        self._finish_reason: Optional[str] = None
        self._usage: Optional[Dict[str, Any]] = None
        # Track buffered SSE input bytes across iterations.
        self._buffer = b""
        # When True we have closed all content blocks and are waiting for
        # an optional usage-only chunk before emitting message_delta + message_stop.
        # This lets stream_options.include_usage land in the final delta.
        self._awaiting_usage = False

    # ---- public API ------------------------------------------------------

    async def translate(
        self, openai_stream: AsyncIterator[bytes]
    ) -> AsyncIterator[bytes]:
        try:
            async for raw_chunk in openai_stream:
                if not raw_chunk:
                    continue
                async for out_frame in self._feed_bytes(raw_chunk):
                    yield out_frame
            # End-of-stream: flush any remaining buffered SSE frames.
            async for out_frame in self._flush_buffer_eof():
                yield out_frame
            # If upstream ended cleanly without a finish_reason, still close.
            if self._state != _DONE and not self._awaiting_usage:
                async for out_frame in self._close_clean():
                    yield out_frame
            # Emit deferred terminal frames now that any usage chunk has been seen.
            if self._awaiting_usage:
                async for out_frame in self._emit_terminal_frames():
                    yield out_frame
        finally:
            # Translator owns terminal-frame emission. On cancel/error mid-stream,
            # close open blocks and emit a stop_reason=error message_delta + message_stop.
            try:
                async for out_frame in self._finalize_on_error_if_needed():
                    yield out_frame
            except Exception:  # noqa: BLE001
                # Best-effort. If the consumer is gone, swallow.
                logger.exception("error during translator finalize")

    # ---- internal: SSE chunk parsing ------------------------------------

    async def _feed_bytes(self, chunk: bytes) -> AsyncIterator[bytes]:
        self._buffer += chunk
        # SSE frames are separated by blank lines (\n\n).
        while b"\n\n" in self._buffer:
            frame, self._buffer = self._buffer.split(b"\n\n", 1)
            async for out in self._process_frame(frame):
                yield out

    async def _flush_buffer_eof(self) -> AsyncIterator[bytes]:
        if self._buffer.strip():
            frame = self._buffer
            self._buffer = b""
            async for out in self._process_frame(frame):
                yield out

    async def _process_frame(self, frame: bytes) -> AsyncIterator[bytes]:
        # An SSE frame is one or more lines. Concatenate data: lines.
        data_lines: list[str] = []
        for line in frame.split(b"\n"):
            try:
                decoded = line.decode("utf-8")
            except UnicodeDecodeError:
                continue
            decoded = decoded.rstrip("\r")
            if decoded.startswith("data:"):
                data_lines.append(decoded[len("data:"):].lstrip())
        if not data_lines:
            return
        data_str = "\n".join(data_lines)
        if not data_str or data_str == "[DONE]":
            return
        try:
            parsed = json.loads(data_str)
        except json.JSONDecodeError:
            logger.debug("ignoring non-JSON SSE data: %r", data_str[:200])
            return

        # Extract usage if present (final chunk in stream_options=include_usage path).
        usage = parsed.get("usage")
        if isinstance(usage, dict):
            self._usage = {
                "input_tokens": usage.get("prompt_tokens", 0) or 0,
                "output_tokens": usage.get("completion_tokens", 0) or 0,
            }

        # Skipworthy predicate applied BEFORE state-machine routing.
        if _is_skipworthy_chunk(parsed):
            return

        async for out in self._route_chunk(parsed):
            yield out

    # ---- internal: state machine ----------------------------------------

    async def _route_chunk(self, parsed: Dict[str, Any]) -> AsyncIterator[bytes]:
        choices = parsed.get("choices") or []
        if not choices:
            return
        first = choices[0] if isinstance(choices[0], dict) else {}
        delta = first.get("delta") or {}
        finish_reason = first.get("finish_reason")

        # Ensure message_start fires lazily on first semantic content.
        if not self._message_started:
            self._message_started = True
            yield _sse("message_start", {
                "type": "message_start",
                "message": {
                    "id": self._msg_id,
                    "type": "message",
                    "role": "assistant",
                    "model": self._model,
                    "content": [],
                    "stop_reason": None,
                    "stop_sequence": None,
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                },
            })

        # Handle refusal (treated as text content with content_filter mapping).
        refusal = delta.get("refusal")
        if isinstance(refusal, str) and refusal:
            async for out in self._ensure_text_open():
                yield out
            yield _sse("content_block_delta", {
                "type": "content_block_delta",
                "index": self._text_block_index,
                "delta": {"type": "text_delta", "text": refusal},
            })

        # Handle text content.
        content = delta.get("content")
        if isinstance(content, str) and content:
            async for out in self._ensure_text_open():
                yield out
            yield _sse("content_block_delta", {
                "type": "content_block_delta",
                "index": self._text_block_index,
                "delta": {"type": "text_delta", "text": content},
            })

        # Handle tool_calls.
        tool_calls = delta.get("tool_calls")
        if isinstance(tool_calls, list):
            for tc in tool_calls:
                async for out in self._handle_tool_call_fragment(tc):
                    yield out

        # Handle finish_reason.
        if finish_reason:
            self._finish_reason = finish_reason
            async for out in self._close_clean():
                yield out

    async def _ensure_text_open(self) -> AsyncIterator[bytes]:
        if self._state == _TEXT_OPEN:
            return
        if self._state == _TOOL_OPEN:
            # Close the current tool before switching to text. Per spec this
            # ordering shouldn't really happen (OpenAI doesn't interleave),
            # but be defensive.
            async for out in self._close_current_tool():
                yield out
        idx = self._next_anthropic_index
        self._next_anthropic_index += 1
        self._text_block_index = idx
        self._state = _TEXT_OPEN
        yield _sse("content_block_start", {
            "type": "content_block_start",
            "index": idx,
            "content_block": {"type": "text", "text": ""},
        })

    async def _handle_tool_call_fragment(
        self, tc: Dict[str, Any]
    ) -> AsyncIterator[bytes]:
        if not isinstance(tc, dict):
            return
        oai_index = tc.get("index")
        if oai_index is None:
            # Some SDKs omit index when there's only one tool; default to 0.
            oai_index = 0
        try:
            oai_index = int(oai_index)
        except (TypeError, ValueError):
            return

        fn = tc.get("function") or {}
        name = fn.get("name") if isinstance(fn, dict) else None
        args_fragment = fn.get("arguments") if isinstance(fn, dict) else None
        tc_id = tc.get("id")

        acc = self._tool_accumulators.get(oai_index)
        if acc is None:
            # New tool slot. Requires a name to be useful.
            if not name:
                # Pure-arguments fragment for an unseen slot. Skip; spec
                # requires name first.
                return
            # Close text block if open (text-then-tool transition).
            if self._state == _TEXT_OPEN:
                yield _sse("content_block_stop", {
                    "type": "content_block_stop",
                    "index": self._text_block_index,
                })
                self._state = _IDLE
            # Close currently-open tool before opening a new one.
            if self._state == _TOOL_OPEN and self._current_tool is not None:
                async for out in self._close_current_tool():
                    yield out

            anth_idx = self._next_anthropic_index
            self._next_anthropic_index += 1
            acc = ToolCallAccumulator(
                openai_index=oai_index,
                tool_use_id=tc_id or _new_tool_use_id(),
                name=name,
                args_buffer="",
                anthropic_block_index=anth_idx,
                emitted_start=False,
            )
            self._tool_accumulators[oai_index] = acc
            self._tool_order.append(acc)
            self._current_tool = acc
            self._state = _TOOL_OPEN
            yield _sse("content_block_start", {
                "type": "content_block_start",
                "index": anth_idx,
                "content_block": {
                    "type": "tool_use",
                    "id": acc.tool_use_id,
                    "name": acc.name,
                    "input": {},
                },
            })
            acc.emitted_start = True
            # Append any args carried in the same fragment.
            if isinstance(args_fragment, str) and args_fragment:
                acc.args_buffer += args_fragment
            return

        # Existing accumulator.
        if isinstance(args_fragment, str) and args_fragment:
            acc.args_buffer += args_fragment
        # Duplicate name on same slot: ignore.

    async def _close_current_tool(self) -> AsyncIterator[bytes]:
        acc = self._current_tool
        if acc is None or not acc.emitted_start:
            return
        # Emit accumulated args as a single input_json_delta.
        args_text = acc.args_buffer if acc.args_buffer else "{}"
        yield _sse("content_block_delta", {
            "type": "content_block_delta",
            "index": acc.anthropic_block_index,
            "delta": {"type": "input_json_delta", "partial_json": args_text},
        })
        yield _sse("content_block_stop", {
            "type": "content_block_stop",
            "index": acc.anthropic_block_index,
        })
        self._current_tool = None
        self._state = _IDLE

    async def _close_clean(self) -> AsyncIterator[bytes]:
        """Close any open content blocks and enter awaiting-usage state.

        Does NOT emit message_delta/message_stop. Those are deferred to
        `_emit_terminal_frames` so we can absorb a trailing usage-only chunk
        from OpenAI's stream_options.include_usage path.
        """
        if self._state == _DONE or self._awaiting_usage:
            return
        # Close text block if open.
        if self._state == _TEXT_OPEN and self._text_block_index is not None:
            yield _sse("content_block_stop", {
                "type": "content_block_stop",
                "index": self._text_block_index,
            })
            self._state = _IDLE
        # Close every tool block that was opened, in anthropic_block_index order.
        for acc in self._tool_order:
            if not acc.emitted_start:
                continue
            args_text = acc.args_buffer if acc.args_buffer else "{}"
            yield _sse("content_block_delta", {
                "type": "content_block_delta",
                "index": acc.anthropic_block_index,
                "delta": {"type": "input_json_delta", "partial_json": args_text},
            })
            yield _sse("content_block_stop", {
                "type": "content_block_stop",
                "index": acc.anthropic_block_index,
            })
            if acc is self._current_tool:
                self._current_tool = None
        self._state = _IDLE
        self._awaiting_usage = True

    async def _emit_terminal_frames(self) -> AsyncIterator[bytes]:
        """Emit message_delta + message_stop using whatever usage we have."""
        if self._state == _DONE:
            return
        stop_reason = _map_finish_reason(self._finish_reason)
        usage = self._usage or {"input_tokens": 0, "output_tokens": 0}
        yield _sse("message_delta", {
            "type": "message_delta",
            "delta": {"stop_reason": stop_reason, "stop_sequence": None},
            "usage": usage,
        })
        yield _sse("message_stop", {"type": "message_stop"})
        self._state = _DONE

    async def _finalize_on_error_if_needed(self) -> AsyncIterator[bytes]:
        if self._state == _DONE:
            return
        if self._awaiting_usage:
            # Clean close already drained content blocks. Just emit the
            # terminal frames using whatever stop_reason and usage we have.
            async for out in self._emit_terminal_frames():
                yield out
            return
        # We were interrupted mid-stream. Close open blocks and emit error
        # terminal frames so the Anthropic SDK does not block on
        # `.get_final_message()`.
        if not self._message_started:
            # Nothing was sent yet; emit a minimal message_start.
            self._message_started = True
            yield _sse("message_start", {
                "type": "message_start",
                "message": {
                    "id": self._msg_id,
                    "type": "message",
                    "role": "assistant",
                    "model": self._model,
                    "content": [],
                    "stop_reason": None,
                    "stop_sequence": None,
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                },
            })
        if self._state == _TEXT_OPEN and self._text_block_index is not None:
            yield _sse("content_block_stop", {
                "type": "content_block_stop",
                "index": self._text_block_index,
            })
        for acc in self._tool_order:
            if not acc.emitted_start:
                continue
            args_text = acc.args_buffer if acc.args_buffer else "{}"
            yield _sse("content_block_delta", {
                "type": "content_block_delta",
                "index": acc.anthropic_block_index,
                "delta": {"type": "input_json_delta", "partial_json": args_text},
            })
            yield _sse("content_block_stop", {
                "type": "content_block_stop",
                "index": acc.anthropic_block_index,
            })
        usage = self._usage or {"input_tokens": 0, "output_tokens": 0}
        yield _sse("message_delta", {
            "type": "message_delta",
            "delta": {"stop_reason": "error", "stop_sequence": None},
            "usage": usage,
        })
        yield _sse("message_stop", {"type": "message_stop"})
        self._state = _DONE
