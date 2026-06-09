"""Unit tests for the OpenRouter upstream provider on /v1/messages.

All tests use httpx.MockTransport via monkeypatching `httpx.AsyncClient` (the
same seam established in test_anthropic_messages_w2.py). No real network
calls. No mock.patch.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List

import httpx
import pytest

from app.api import anthropic_messages as am_mod


# ---------------------------------------------------------------------------
# Helpers (mirror test_anthropic_messages_w2.py)
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


async def _drain_async_iter(it) -> bytes:
    buf = bytearray()
    async for chunk in it:
        if isinstance(chunk, str):
            chunk = chunk.encode()
        buf.extend(chunk)
    return bytes(buf)


# ---------------------------------------------------------------------------
# _detect_provider
# ---------------------------------------------------------------------------


def test_detect_provider_openrouter():
    """Explicit OpenRouter family prefixes map to 'openrouter'."""
    assert am_mod._detect_provider("deepseek/deepseek-chat") == "openrouter"
    assert am_mod._detect_provider("deepseek/deepseek-r1") == "openrouter"
    assert am_mod._detect_provider("qwen/qwen-2.5-72b-instruct") == "openrouter"
    assert am_mod._detect_provider("meta-llama/llama-3.1-70b-instruct") == "openrouter"
    assert am_mod._detect_provider("mistralai/mistral-large") == "openrouter"
    assert am_mod._detect_provider("openrouter/auto") == "openrouter"
    # Catch-all branch: arbitrary vendor/model shape routes via OpenRouter.
    assert am_mod._detect_provider("cohere/command-r-plus") == "openrouter"
    assert am_mod._detect_provider("nousresearch/hermes-3") == "openrouter"


def test_detect_provider_claude_not_openrouter():
    """Claude prefixes win over OpenRouter catch-all."""
    assert am_mod._detect_provider("claude-sonnet-4-6") == "claude"
    assert am_mod._detect_provider("claude-haiku-4-5") == "claude"
    assert am_mod._detect_provider("anthropic/claude-opus-4-6") == "claude"
    assert am_mod._detect_provider("claude/claude-sonnet-4-6") == "claude"


def test_detect_provider_openai_simple_unchanged():
    """Bare model ids (no slash) stay on direct OpenAI for back-compat."""
    assert am_mod._detect_provider("gpt-4o") == "openai"
    assert am_mod._detect_provider("gpt-4o-mini") == "openai"
    assert am_mod._detect_provider("o1-preview") == "openai"
    # Explicit openai/ prefix is direct OpenAI passthrough, not OpenRouter.
    assert am_mod._detect_provider("openai/gpt-4o") == "openai"


# ---------------------------------------------------------------------------
# _resolve_upstream_openrouter_key
# ---------------------------------------------------------------------------


def test_resolve_openrouter_key_byok():
    """api_key_config['openrouter_api_key'] wins regardless of key_mode."""

    class _User:
        api_key_config = {"openrouter_api_key": "sk-or-byok-123"}
        raw_data: Dict[str, Any] = {}
        key_mode = "byok"

    assert am_mod._resolve_upstream_openrouter_key(_User()) == "sk-or-byok-123"
    # Dispatcher should also route to it.
    assert am_mod._resolve_upstream_key("openrouter", _User()) == "sk-or-byok-123"


def test_resolve_openrouter_key_byok_from_raw_data():
    """Falls back to raw_data when api_key_config has no openrouter key."""

    class _User:
        api_key_config: Dict[str, Any] = {}
        raw_data = {"openrouter_api_key": "sk-or-raw"}
        key_mode = "byok"

    assert am_mod._resolve_upstream_openrouter_key(_User()) == "sk-or-raw"


def test_resolve_openrouter_key_hosted_fallback(monkeypatch):
    """No BYOK + hosted mode + settings.OPENROUTER_API_KEY -> settings value."""

    class _User:
        api_key_config: Dict[str, Any] = {}
        raw_data: Dict[str, Any] = {}
        key_mode = "hosted"

    from app.settings import settings
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "sk-or-hosted-xyz")
    assert am_mod._resolve_upstream_openrouter_key(_User()) == "sk-or-hosted-xyz"


def test_resolve_openrouter_key_missing(monkeypatch):
    """No BYOK + no hosted settings -> None."""

    class _User:
        api_key_config: Dict[str, Any] = {}
        raw_data: Dict[str, Any] = {}
        key_mode = "hosted"

    from app.settings import settings
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "")
    assert am_mod._resolve_upstream_openrouter_key(_User()) is None

    # BYOK mode + no key also returns None.
    class _ByokUser:
        api_key_config: Dict[str, Any] = {}
        raw_data: Dict[str, Any] = {}
        key_mode = "byok"

    assert am_mod._resolve_upstream_openrouter_key(_ByokUser()) is None


# ---------------------------------------------------------------------------
# _proxy_stream_openai_compat with OpenRouter attribution headers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_proxy_stream_openrouter_compat_adds_attribution_headers(monkeypatch):
    """Passing extra_headers includes HTTP-Referer + X-Title in the upstream POST."""

    captured: Dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            content=b'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n\n'
                    b'data: [DONE]\n\n',
        )

    _install_mock_transport(monkeypatch, handler)

    body = {
        "model": "deepseek/deepseek-chat",
        "messages": [{"role": "user", "content": "hello"}],
        "stream": True,
    }
    extra = {
        "HTTP-Referer": "https://getnadir.com",
        "X-Title": "Nadir Router",
    }
    raw = await _drain_async_iter(
        am_mod._proxy_stream_openai_compat(
            body,
            "https://openrouter.ai/api/v1/chat/completions",
            "sk-or-test",
            extra_headers=extra,
        )
    )
    assert b"[DONE]" in raw or b"hi" in raw

    assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
    lower = {k.lower(): v for k, v in captured["headers"].items()}
    assert lower.get("authorization") == "Bearer sk-or-test"
    assert lower.get("http-referer") == "https://getnadir.com"
    assert lower.get("x-title") == "Nadir Router"


@pytest.mark.asyncio
async def test_proxy_stream_openrouter_compat_strips_anthropic_headers(monkeypatch):
    """Anthropic-only headers must NOT appear on the OpenRouter upstream request.

    `_proxy_stream_openai_compat` builds a fresh headers dict, so anthropic-beta,
    x-api-key, and anthropic-version cannot leak even if the route handler had
    them in scope.
    """
    captured: Dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = dict(request.headers)
        return httpx.Response(200, content=b'data: [DONE]\n\n')

    _install_mock_transport(monkeypatch, handler)

    # Deliberately attempt to sneak Anthropic-only headers in via extra_headers.
    # The function does NOT special-case these so they would only appear if a
    # caller passed them; verify that the BASE call (no leaking) is clean.
    body = {"model": "qwen/qwen-2.5-72b-instruct", "messages": [], "stream": True}
    await _drain_async_iter(
        am_mod._proxy_stream_openai_compat(
            body,
            "https://openrouter.ai/api/v1/chat/completions",
            "sk-or-test",
            extra_headers={
                "HTTP-Referer": "https://getnadir.com",
                "X-Title": "Nadir Router",
            },
        )
    )
    lower = {k.lower() for k in captured["headers"].keys()}
    assert "anthropic-beta" not in lower
    assert "x-api-key" not in lower
    assert "anthropic-version" not in lower


@pytest.mark.asyncio
async def test_proxy_stream_openai_compat_no_extra_headers_unchanged(monkeypatch):
    """Existing OpenAI call sites pass extra_headers=None and see no behavior change."""

    captured: Dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = dict(request.headers)
        return httpx.Response(200, content=b'data: [DONE]\n\n')

    _install_mock_transport(monkeypatch, handler)

    await _drain_async_iter(
        am_mod._proxy_stream_openai_compat(
            {"model": "gpt-4o", "messages": []},
            "https://api.openai.com/v1/chat/completions",
            "sk-openai",
            extra_headers=None,
        )
    )
    lower = {k.lower(): v for k, v in captured["headers"].items()}
    assert lower.get("authorization") == "Bearer sk-openai"
    # No attribution leakage on direct OpenAI calls.
    assert "http-referer" not in lower
    assert "x-title" not in lower


@pytest.mark.asyncio
async def test_proxy_stream_openrouter_compat_extra_headers_cannot_override_auth(monkeypatch):
    """extra_headers must NOT overwrite Authorization or content-type (defense in depth)."""

    captured: Dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = dict(request.headers)
        return httpx.Response(200, content=b'data: [DONE]\n\n')

    _install_mock_transport(monkeypatch, handler)

    await _drain_async_iter(
        am_mod._proxy_stream_openai_compat(
            {"model": "deepseek/deepseek-chat", "messages": []},
            "https://openrouter.ai/api/v1/chat/completions",
            "sk-real",
            extra_headers={
                "Authorization": "Bearer sk-attacker",
                "Content-Type": "text/plain",
                "X-Title": "Nadir Router",
            },
        )
    )
    lower = {k.lower(): v for k, v in captured["headers"].items()}
    assert lower.get("authorization") == "Bearer sk-real"
    # content-type stays JSON.
    assert "application/json" in (lower.get("content-type") or "")
    # But the non-protected header still came through.
    assert lower.get("x-title") == "Nadir Router"


# ---------------------------------------------------------------------------
# Upstream URL resolution
# ---------------------------------------------------------------------------


def test_openrouter_upstream_url_default():
    """Default URL is hardcoded when OPENROUTER_BASE_URL is the canonical value."""
    from app.settings import settings
    # Without monkeypatching, the helper should return the default.
    url = am_mod._openrouter_upstream_url()
    assert url == "https://openrouter.ai/api/v1/chat/completions"


def test_openrouter_upstream_url_env_override(monkeypatch):
    """Overriding OPENROUTER_BASE_URL changes the resolved chat/completions URL."""
    from app.settings import settings
    monkeypatch.setattr(settings, "OPENROUTER_BASE_URL", "https://or-proxy.local/api/v1")
    assert am_mod._openrouter_upstream_url() == "https://or-proxy.local/api/v1/chat/completions"

    # Trailing slash is normalized.
    monkeypatch.setattr(settings, "OPENROUTER_BASE_URL", "https://or-proxy.local/api/v1/")
    assert am_mod._openrouter_upstream_url() == "https://or-proxy.local/api/v1/chat/completions"
