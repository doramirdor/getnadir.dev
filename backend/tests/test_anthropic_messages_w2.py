"""W2 integration tests for /v1/messages cross-format SSE translation.

Mocks `_route_messages_model` to return a non-Claude provider, mocks the
upstream OpenAI SSE response via httpx.MockTransport, and asserts the
StreamingResponse contains a valid Anthropic SSE event sequence.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List

import httpx
import pytest

from app.api import anthropic_messages as am_mod


def _install_mock_transport(monkeypatch: pytest.MonkeyPatch, handler):
    captured: List[httpx.Request] = []

    def capturing_handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return handler(request)

    real_async_client = httpx.AsyncClient

    def fake_async_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(capturing_handler)
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(am_mod.httpx, "AsyncClient", fake_async_client)
    return captured


def _parse_sse(raw: bytes) -> List[tuple[str, dict]]:
    out: List[tuple[str, dict]] = []
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


async def _drain_response(resp) -> bytes:
    buf = bytearray()
    async for chunk in resp.body_iterator:
        if isinstance(chunk, str):
            chunk = chunk.encode()
        buf.extend(chunk)
    return bytes(buf)


@pytest.mark.asyncio
async def test_w2_non_claude_streaming_end_to_end(monkeypatch):
    """Route handler picks an OpenAI model -> translator emits Anthropic SSE."""

    async def fake_route(body, current_user, requested_model):
        return {
            "model": "gpt-4o-mini",
            "provider": "openai",
            "analysis": {"strategy": "smart_route"},
        }

    monkeypatch.setattr(am_mod, "_route_messages_model", fake_route)
    monkeypatch.setattr(am_mod, "_resolve_upstream_key", lambda p, u: "sk-test-openai")

    captured_request: Dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured_request["url"] = str(request.url)
        captured_request["headers"] = dict(request.headers)
        captured_request["body"] = json.loads(request.content)
        # Minimal OpenAI SSE stream.
        sse = (
            b'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}\n\n'
            b'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n'
            b'data: {"choices":[{"delta":{"content":" there"},"finish_reason":null}]}\n\n'
            b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
            b'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n'
            b"data: [DONE]\n\n"
        )
        return httpx.Response(200, content=sse)

    _install_mock_transport(monkeypatch, handler)

    class _FakeRequest:
        headers: Dict[str, str] = {"anthropic-beta": "prompt-caching-2024-07-31"}

        async def json(self):
            return {
                "model": "claude-sonnet-4-6",
                "max_tokens": 64,
                "stream": True,
                "messages": [{"role": "user", "content": "hi"}],
                "anthropic-beta": "should-be-stripped",
            }

    class _FakeUser:
        api_key_config: Dict[str, Any] = {"openai_api_key": "sk-byok"}
        raw_data: Dict[str, Any] = {}
        key_mode = "byok"

    resp = await am_mod.anthropic_messages(raw=_FakeRequest(), current_user=_FakeUser())  # type: ignore[arg-type]
    assert resp.media_type == "text/event-stream"
    assert resp.headers.get("x-nadir-routed-to") == "gpt-4o-mini"

    raw = await _drain_response(resp)
    events = _parse_sse(raw)
    types = [e for e, _ in events]
    # Anthropic SSE event sequence shape.
    assert "message_start" in types
    assert "content_block_start" in types
    assert "content_block_delta" in types
    assert "content_block_stop" in types
    assert "message_delta" in types
    assert "message_stop" in types

    # Text content correctly concatenated across deltas.
    text_pieces = [
        d["delta"]["text"]
        for e, d in events
        if e == "content_block_delta" and d.get("delta", {}).get("type") == "text_delta"
    ]
    assert "".join(text_pieces) == "Hi there"

    # Usage carried through.
    msg_delta = [d for e, d in events if e == "message_delta"][0]
    assert msg_delta["usage"]["input_tokens"] == 5
    assert msg_delta["usage"]["output_tokens"] == 2
    assert msg_delta["delta"]["stop_reason"] == "end_turn"

    # Upstream URL is OpenAI Chat Completions.
    assert captured_request["url"] == "https://api.openai.com/v1/chat/completions"
    # Authorization header is Bearer; anthropic-beta MUST NOT leak.
    assert captured_request["headers"].get("authorization") == "Bearer sk-test-openai"
    assert "anthropic-beta" not in {k.lower() for k in captured_request["headers"].keys()}
    assert "x-api-key" not in {k.lower() for k in captured_request["headers"].keys()}

    # Body was translated.
    body = captured_request["body"]
    assert body["model"] == "gpt-4o-mini"
    assert body["stream"] is True
    assert body["stream_options"] == {"include_usage": True}
    assert body["messages"][-1]["role"] == "user"


@pytest.mark.asyncio
async def test_w2_non_claude_streaming_missing_key_returns_401(monkeypatch):
    async def fake_route(body, current_user, requested_model):
        return {"model": "gpt-4o", "provider": "openai", "analysis": {}}

    monkeypatch.setattr(am_mod, "_route_messages_model", fake_route)
    monkeypatch.setattr(am_mod, "_resolve_upstream_key", lambda p, u: None)

    class _FakeRequest:
        headers: Dict[str, str] = {}

        async def json(self):
            return {
                "model": "claude-sonnet-4-6",
                "stream": True,
                "messages": [{"role": "user", "content": "hi"}],
            }

    class _FakeUser:
        api_key_config: Dict[str, Any] = {}
        raw_data: Dict[str, Any] = {}
        key_mode = "byok"

    resp = await am_mod.anthropic_messages(raw=_FakeRequest(), current_user=_FakeUser())  # type: ignore[arg-type]
    # JSONResponse with 401.
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_w2_detect_provider_dispatches_correctly(monkeypatch):
    """Verify _detect_provider returns 'openai' for non-Claude model ids."""
    assert am_mod._detect_provider("gpt-4o") == "openai"
    assert am_mod._detect_provider("gpt-4o-mini") == "openai"
    assert am_mod._detect_provider("openai/gpt-4o") == "openai"
    assert am_mod._detect_provider("claude-sonnet-4-6") == "claude"
    assert am_mod._detect_provider("claude-haiku-4-5") == "claude"
    assert am_mod._detect_provider("anthropic/claude-opus-4-6") == "claude"


@pytest.mark.asyncio
async def test_w2_resolve_upstream_key_branches(monkeypatch):
    """BYOK and hosted paths for both providers."""

    class _ByokOpenAI:
        api_key_config = {"openai_api_key": "sk-openai-byok"}
        raw_data: Dict[str, Any] = {}
        key_mode = "byok"

    class _ByokAnthropic:
        api_key_config = {"anthropic_api_key": "sk-ant-byok"}
        raw_data: Dict[str, Any] = {}
        key_mode = "byok"

    assert am_mod._resolve_upstream_key("openai", _ByokOpenAI()) == "sk-openai-byok"  # type: ignore[arg-type]
    assert am_mod._resolve_upstream_key("claude", _ByokAnthropic()) == "sk-ant-byok"  # type: ignore[arg-type]
    # Unknown provider returns None.
    assert am_mod._resolve_upstream_key("gemini", _ByokOpenAI()) is None  # type: ignore[arg-type]
