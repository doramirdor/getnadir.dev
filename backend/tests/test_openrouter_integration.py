"""End-to-end integration tests for OpenRouter routing through /v1/messages.

Mocks the routing decision + upstream transport, then asserts the full
Anthropic SSE event sequence comes out of the StreamingResponse and that
Claude-target requests still go through the direct Anthropic path (not
OpenRouter).
"""
from __future__ import annotations

import json
from typing import Any, Dict, List

import httpx
import pytest

from app.api import anthropic_messages as am_mod


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _parse_sse(raw: bytes) -> List[tuple]:
    out: List[tuple] = []
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


# ---------------------------------------------------------------------------
# End-to-end /v1/messages -> OpenRouter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_v1_messages_routes_to_openrouter_end_to_end(monkeypatch):
    """deepseek/deepseek-chat selection -> OpenRouter URL + attribution headers,
    OpenAI-shape upstream SSE round-trips through the Anthropic translator."""

    async def fake_route(body, current_user, requested_model):
        return {
            "model": "deepseek/deepseek-chat",
            "provider": "openrouter",
            "analysis": {"strategy": "smart_route"},
        }

    monkeypatch.setattr(am_mod, "_route_messages_model", fake_route)
    monkeypatch.setattr(am_mod, "_resolve_upstream_key", lambda p, u: "sk-or-test")

    captured: Dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        sse = (
            b'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}\n\n'
            b'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n'
            b'data: {"choices":[{"delta":{"content":" from OR"},"finish_reason":null}]}\n\n'
            b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
            b'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n'
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
            }

    class _FakeUser:
        api_key_config: Dict[str, Any] = {"openrouter_api_key": "sk-or-byok"}
        raw_data: Dict[str, Any] = {}
        key_mode = "byok"

    resp = await am_mod.anthropic_messages(raw=_FakeRequest(), current_user=_FakeUser())  # type: ignore[arg-type]
    assert resp.media_type == "text/event-stream"
    assert resp.headers.get("x-nadir-routed-to") == "deepseek/deepseek-chat"

    raw = await _drain_response(resp)
    events = _parse_sse(raw)
    types = [e for e, _ in events]
    # Anthropic event sequence shape.
    for required in (
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
    ):
        assert required in types, f"missing event {required}; got {types}"

    text_pieces = [
        d["delta"]["text"]
        for e, d in events
        if e == "content_block_delta" and d.get("delta", {}).get("type") == "text_delta"
    ]
    assert "".join(text_pieces) == "Hello from OR"

    msg_delta = [d for e, d in events if e == "message_delta"][0]
    assert msg_delta["usage"]["input_tokens"] == 7
    assert msg_delta["usage"]["output_tokens"] == 3
    assert msg_delta["delta"]["stop_reason"] == "end_turn"

    # Upstream URL is OpenRouter, attribution headers present, anthropic headers stripped.
    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    lower = {k.lower(): v for k, v in captured["headers"].items()}
    assert lower.get("authorization") == "Bearer sk-or-test"
    assert lower.get("http-referer") == "https://getnadir.com"
    assert lower.get("x-title") == "Nadir Router"
    assert "anthropic-beta" not in lower
    assert "x-api-key" not in lower
    assert "anthropic-version" not in lower

    # Body translated to OpenAI shape with full slashed model id intact.
    body = captured["body"]
    assert body["model"] == "deepseek/deepseek-chat"
    assert body["stream"] is True
    assert body["stream_options"] == {"include_usage": True}
    assert body["messages"][-1]["role"] == "user"


@pytest.mark.asyncio
async def test_v1_messages_claude_does_not_route_to_openrouter(monkeypatch):
    """A Claude-target request must hit api.anthropic.com, not openrouter.ai."""

    async def fake_route(body, current_user, requested_model):
        return {
            "model": "claude-sonnet-4-6",
            "provider": "claude",
            "analysis": {"strategy": "smart_route"},
        }

    monkeypatch.setattr(am_mod, "_route_messages_model", fake_route)
    monkeypatch.setattr(am_mod, "_resolve_upstream_key", lambda p, u: "sk-ant-test")

    captured: Dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        # Minimal Anthropic SSE - just need ANY valid bytes since Claude path
        # is a byte-for-byte passthrough.
        sse = (
            b'event: message_start\ndata: {"type":"message_start"}\n\n'
            b'event: message_stop\ndata: {"type":"message_stop"}\n\n'
        )
        return httpx.Response(200, content=sse)

    _install_mock_transport(monkeypatch, handler)

    class _FakeRequest:
        headers: Dict[str, str] = {"anthropic-version": "2023-06-01"}

        async def json(self):
            return {
                "model": "claude-sonnet-4-6",
                "stream": True,
                "messages": [{"role": "user", "content": "hi"}],
            }

    class _FakeUser:
        api_key_config: Dict[str, Any] = {"anthropic_api_key": "sk-ant-byok"}
        raw_data: Dict[str, Any] = {}
        key_mode = "byok"

    resp = await am_mod.anthropic_messages(raw=_FakeRequest(), current_user=_FakeUser())  # type: ignore[arg-type]
    assert resp.media_type == "text/event-stream"

    # Drain (the body iterator must be consumed so the upstream is actually called).
    await _drain_response(resp)

    # Confirm direct Anthropic upstream, NOT OpenRouter.
    assert captured["url"] == "https://api.anthropic.com/v1/messages"
    assert "openrouter.ai" not in captured["url"]
    # And the request carried the Anthropic auth headers (x-api-key), not Bearer.
    lower = {k.lower(): v for k, v in captured["headers"].items()}
    assert lower.get("x-api-key") == "sk-ant-test"
    assert "http-referer" not in lower
    assert "x-title" not in lower
