"""W1 tests for /v1/messages streaming passthrough + tool-block forwarding.

Covers:
  - `_extract_routing_text` contract (no raises, tool-only sentinel,
    string vs list-of-blocks content).
  - `_proxy_stream_claude` byte passthrough, upstream error frame,
    mid-stream transport failure terminal frame.
  - Verbatim body forwarding (tool blocks, image blocks left intact;
    only `model` rewritten).
  - StreamingResponse media_type.

All network I/O is mocked via `httpx.MockTransport`. No real upstream calls.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List

import httpx
import pytest

from app.api import anthropic_messages as am_mod
from app.api.anthropic_messages import (
    ANTHROPIC_UPSTREAM,
    _TOOL_ONLY_SENTINEL,
    _extract_routing_text,
    _proxy_stream_claude,
)


# ---------------------------------------------------------------------------
# _extract_routing_text — pure helper, no I/O
# ---------------------------------------------------------------------------


class TestExtractRoutingText:
    def test_string_content_concatenates(self):
        body = {
            "messages": [
                {"role": "user", "content": "hello world"},
                {"role": "assistant", "content": " from claude"},
                {"role": "user", "content": " again"},
            ],
        }
        assert _extract_routing_text(body) == "hello world from claude again"

    def test_string_system_prefixes(self):
        body = {
            "system": "you are concise. ",
            "messages": [{"role": "user", "content": "hi"}],
        }
        assert _extract_routing_text(body) == "you are concise. hi"

    def test_list_blocks_pick_only_text(self):
        body = {
            "messages": [
                {"role": "user", "content": [
                    {"type": "text", "text": "describe "},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}},
                    {"type": "text", "text": "this"},
                ]},
            ],
        }
        assert _extract_routing_text(body) == "describe this"

    def test_list_system_blocks(self):
        body = {
            "system": [
                {"type": "text", "text": "alpha "},
                {"type": "text", "text": "beta "},
            ],
            "messages": [{"role": "user", "content": "hi"}],
        }
        # Helper concatenates verbatim, no separator inserted. Whitespace
        # comes from whatever the blocks themselves carry.
        assert _extract_routing_text(body) == "alpha beta hi"

    def test_tool_only_body_returns_sentinel(self):
        body = {
            "messages": [
                {"role": "assistant", "content": [
                    {"type": "tool_use", "id": "t1", "name": "calc", "input": {"x": 1}},
                ]},
                {"role": "user", "content": [
                    {"type": "tool_result", "tool_use_id": "t1", "content": "42"},
                ]},
            ],
        }
        assert _extract_routing_text(body) == _TOOL_ONLY_SENTINEL

    def test_image_only_body_returns_sentinel(self):
        body = {
            "messages": [
                {"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}},
                ]},
            ],
        }
        assert _extract_routing_text(body) == _TOOL_ONLY_SENTINEL

    def test_empty_messages_returns_empty(self):
        assert _extract_routing_text({"messages": []}) == ""
        assert _extract_routing_text({}) == ""

    def test_missing_messages_returns_empty(self):
        # No `messages` key at all → empty string (not the sentinel).
        assert _extract_routing_text({"model": "claude-sonnet-4-6"}) == ""

    def test_non_dict_body_returns_empty(self):
        assert _extract_routing_text(None) == ""  # type: ignore[arg-type]
        assert _extract_routing_text("not a dict") == ""  # type: ignore[arg-type]

    def test_never_raises_on_garbage_blocks(self):
        body = {
            "system": 12345,  # invalid type
            "messages": [
                {"role": "user", "content": [
                    None,
                    {"type": "text"},  # missing 'text'
                    {"type": "text", "text": "ok"},
                    {"no_type": "weird"},
                ]},
                "not a dict",
            ],
        }
        # Must not raise; must return whatever text it could salvage.
        assert _extract_routing_text(body) == "ok"


# ---------------------------------------------------------------------------
# _proxy_stream_claude — mocked upstream via httpx.MockTransport
# ---------------------------------------------------------------------------


def _install_mock_transport(monkeypatch: pytest.MonkeyPatch, handler):
    """Patch httpx.AsyncClient so its underlying transport is the mock.

    `handler(request) -> httpx.Response` is the user-supplied per-request
    callback. Returns the list of captured requests for inspection.
    """
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


async def _drain(agen) -> bytes:
    buf = bytearray()
    async for chunk in agen:
        buf.extend(chunk)
    return bytes(buf)


@pytest.mark.asyncio
async def test_proxy_stream_passes_bytes_through_on_200(monkeypatch):
    sse_body = (
        b"event: message_start\ndata: {\"type\":\"message_start\"}\n\n"
        b"event: content_block_start\ndata: {\"type\":\"content_block_start\"}\n\n"
        b"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == httpx.URL(ANTHROPIC_UPSTREAM)
        return httpx.Response(200, content=sse_body)

    _install_mock_transport(monkeypatch, handler)

    out = await _drain(_proxy_stream_claude(
        forward_body={"model": "claude-sonnet-4-6", "messages": [{"role": "user", "content": "hi"}]},
        headers={"x-api-key": "sk-test", "anthropic-version": "2023-06-01"},
    ))
    assert out == sse_body


@pytest.mark.asyncio
async def test_proxy_stream_emits_single_error_frame_on_non_200(monkeypatch):
    err_body = json.dumps({"type": "error", "error": {"type": "invalid_request_error", "message": "bad key"}}).encode()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, content=err_body)

    _install_mock_transport(monkeypatch, handler)

    out = (await _drain(_proxy_stream_claude(
        forward_body={"model": "claude-sonnet-4-6", "messages": [{"role": "user", "content": "hi"}]},
        headers={"x-api-key": "sk-bad"},
    ))).decode("utf-8")

    assert out.startswith("event: error\n")
    # Exactly one frame, ends with the SSE double-newline.
    assert out.count("event: error\n") == 1
    assert out.endswith("\n\n")
    # Body of frame is the JSON payload describing the upstream status.
    data_line = [line for line in out.split("\n") if line.startswith("data: ")][0]
    payload = json.loads(data_line[len("data: "):])
    assert payload["type"] == "error"
    assert payload["error"]["type"] == "api_error"
    assert "upstream status 401" in payload["error"]["message"]


@pytest.mark.asyncio
async def test_proxy_stream_emits_terminal_frame_on_mid_stream_failure(monkeypatch):
    """When upstream returns 200 then dies mid-stream, generator must close
    with a terminal `event: error` frame so Anthropic SDK clients unblock.
    """

    # Build a fake response object that yields some bytes then raises.
    real_async_client = httpx.AsyncClient

    class _FakeUpstream:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def aread(self):
            return b""

        async def aiter_bytes(self):
            yield b"event: message_start\ndata: {}\n\n"
            raise httpx.RemoteProtocolError("connection lost mid-stream")

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def stream(self, method, url, headers=None, json=None, **kw):
            return _FakeUpstream()

    monkeypatch.setattr(am_mod.httpx, "AsyncClient", _FakeClient)

    out = (await _drain(_proxy_stream_claude(
        forward_body={"model": "claude-sonnet-4-6", "messages": [{"role": "user", "content": "hi"}]},
        headers={"x-api-key": "sk-test"},
    ))).decode("utf-8")

    # First chunk made it through.
    assert "event: message_start" in out
    # Terminal error frame appended.
    assert "event: error" in out
    # Locate the JSON payload of the trailing error frame.
    last_data = out.split("event: error")[-1]
    data_line = [line for line in last_data.split("\n") if line.startswith("data: ")][0]
    payload = json.loads(data_line[len("data: "):])
    assert payload["error"]["type"] == "stream_error"
    assert payload["error"]["message"] == "upstream connection lost"


@pytest.mark.asyncio
async def test_proxy_stream_forwards_body_verbatim_with_only_model_rewritten(monkeypatch):
    """Tool blocks, image blocks, `thinking`, `tools` arrays must pass through
    untouched to Anthropic. Only the `model` field has been swapped by the
    caller (the route handler) before the body reaches `_proxy_stream_claude`.
    """
    captured_body: Dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured_body.update(json.loads(request.content))
        return httpx.Response(200, content=b"data: ok\n\n")

    _install_mock_transport(monkeypatch, handler)

    forward_body = {
        "model": "claude-sonnet-4-6",  # rewritten by caller
        "max_tokens": 1024,
        "messages": [
            {"role": "user", "content": [
                {"type": "text", "text": "use the calc tool"},
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "AAA"}},
            ]},
            {"role": "assistant", "content": [
                {"type": "tool_use", "id": "tu_1", "name": "calc", "input": {"x": 2}},
            ]},
            {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "tu_1", "content": "4"},
            ]},
        ],
        "tools": [{"name": "calc", "input_schema": {"type": "object"}}],
        "tool_choice": {"type": "auto"},
        "thinking": {"type": "enabled", "budget_tokens": 1024},
    }

    await _drain(_proxy_stream_claude(
        forward_body=forward_body,
        headers={"x-api-key": "sk-test", "anthropic-version": "2023-06-01"},
    ))

    # Body forwarded byte-identical.
    assert captured_body == forward_body
    # All structural fields still present.
    assert captured_body["tools"][0]["name"] == "calc"
    assert captured_body["tool_choice"]["type"] == "auto"
    assert captured_body["thinking"]["type"] == "enabled"
    assert captured_body["messages"][1]["content"][0]["type"] == "tool_use"
    assert captured_body["messages"][0]["content"][1]["type"] == "image"


# ---------------------------------------------------------------------------
# StreamingResponse smoke — confirms the route handler returns the right
# media type when the routed target is Claude and stream=true.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_streaming_response_media_type_is_event_stream(monkeypatch):
    """Round-trip the route handler far enough to confirm the streaming
    branch returns `text/event-stream`. We bypass auth + routing by stubbing
    `_route_messages_model` and `_resolve_upstream_anthropic_key`, and stub
    httpx so no real network call happens.
    """
    from app.api import anthropic_messages as am

    async def fake_route(body, current_user, requested_model):
        return {"model": "claude-sonnet-4-6", "analysis": {"strategy": "smart_route"}}

    monkeypatch.setattr(am, "_route_messages_model", fake_route)
    monkeypatch.setattr(am, "_resolve_upstream_anthropic_key", lambda _u: "sk-test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"event: message_start\ndata: {}\n\n")

    _install_mock_transport(monkeypatch, handler)

    # Build a minimal Request-like fake for the handler.
    class _FakeRequest:
        headers: Dict[str, str] = {}

        async def json(self):
            return {
                "model": "claude-sonnet-4-6",
                "max_tokens": 16,
                "stream": True,
                "messages": [{"role": "user", "content": "hi"}],
            }

    class _FakeUser:
        api_key_config: Dict[str, Any] = {"anthropic_api_key": "sk-test"}
        raw_data: Dict[str, Any] = {}
        key_mode = "byok"

    resp = await am.anthropic_messages(raw=_FakeRequest(), current_user=_FakeUser())  # type: ignore[arg-type]
    assert resp.media_type == "text/event-stream"
    assert resp.headers.get("x-nadir-routed-to") == "claude-sonnet-4-6"
    assert resp.headers.get("x-nadir-request-id", "").startswith("req_")
