"""
Anthropic Messages-compatible endpoint (POST /v1/messages).

This is the foundation for protocol parity with native Anthropic SDK clients
(Claude Code, opencode, Anthropic Python/TS SDKs). Clients pointing at
api.getnadir.com/v1/messages get the same routing intelligence as the
OpenAI-compat /v1/chat/completions surface.

Current scope (W1 — Claude streaming passthrough):
  - Routes via the same complexity analyzer that backs /v1/chat/completions.
  - For Claude routes (the only routed target in W1) the Anthropic body is
    forwarded verbatim upstream with only `model` rewritten. Tool blocks,
    image blocks, `thinking`, `tools`/`tool_choice` arrays all pass through
    opaquely.
  - SSE streaming is byte-for-byte piped from api.anthropic.com.

Known limitations to extend next:
  - W2: cross-format SSE translation when the router picks a non-Claude
    upstream. Today non-Claude recommendations are coerced to the
    configured Claude fallback tier.
  - W2: full analytics + billing wiring for streaming responses (today we
    emit a single logger.info terminal record; see TODO in
    `_log_stream_analytics`).
  - W3: `npx @nadir/router` installer.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.auth.supabase_auth import UserSession
from app.middleware.subscription_guard import require_active_subscription
from app.middleware.hosted_budget import enforce_hosted_budget_or_402
from app.services.anthropic_translate import (
    UnsupportedAnthropicFeature,
    anthropic_body_to_openai_body,
    anthropic_to_chat_messages,
    make_anthropic_error,
)
from app.services.anthropic_sse_translate import AnthropicSseTranslator

logger = logging.getLogger(__name__)

router = APIRouter(tags=["anthropic-messages"])

ANTHROPIC_UPSTREAM = "https://api.anthropic.com/v1/messages"
DEFAULT_ANTHROPIC_VERSION = "2023-06-01"
CLAUDE_FALLBACK_MODEL = "claude-sonnet-4-6"

# Upstream URLs for cross-format providers. Gemini is deferred to WS-2.5
# (different auth header, different finish_reason values, different
# parallel-tool-call response structure).
#
# OpenRouter is OpenAI Chat Completions compatible, so it slots into the same
# `anthropic_body_to_openai_body` -> `_proxy_stream_openai_compat` pipeline
# with only two additions: HTTP-Referer + X-Title attribution headers, and
# model ids that pass through as-is (`deepseek/deepseek-chat`, etc.).
_UPSTREAM_URLS = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
}


def _openrouter_upstream_url() -> str:
    """Resolve the OpenRouter chat completions URL respecting OPENROUTER_BASE_URL.

    Defaults to the value in `_UPSTREAM_URLS` when the env override is unset
    or matches the default base. The override exists for proxy testing.
    """
    from app.settings import settings
    base = (getattr(settings, "OPENROUTER_BASE_URL", "") or "").rstrip("/")
    if not base or base == "https://openrouter.ai/api/v1":
        return _UPSTREAM_URLS["openrouter"]
    return f"{base}/chat/completions"


# Allowlist of OpenRouter-hosted model prefixes. Conservative: explicit
# family prefixes only. Anything else with a `/` and not Claude/Anthropic
# is also routed to OpenRouter (catches future families without a code
# change) but a leading `openai/` is preserved as OpenRouter passthrough
# rather than direct OpenAI, since the user explicitly asked for OR by
# using the prefix form.
_OPENROUTER_PREFIXES = (
    "deepseek/",
    "qwen/",
    "meta-llama/",
    "mistralai/",
    "google/llama-",
    "openrouter/",
)

# Sentinel returned by _extract_routing_text when the body has messages but
# none of them carry any text (tool-only / image-only payloads). Routing
# downstream rejects empty-string prompts, so we need a non-empty stand-in.
_TOOL_ONLY_SENTINEL = "[tool call]"


def _detect_provider(model_id: str) -> str:
    """Return one of: 'claude', 'openai', 'openrouter'.

    Gemini/Google routing is deferred to WS-2.5. Detection order:
      1. Claude prefixes / contains 'claude' -> 'claude'.
      2. Explicit OpenRouter-supported family prefix -> 'openrouter'.
      3. Bare model id with no provider prefix -> 'openai' (back-compat).
      4. `openai/...` explicit prefix -> 'openai' (direct OpenAI passthrough).
      5. Any other `provider/model` shape -> 'openrouter' (OR is the
         catch-all for OSS model families).
    """
    if not model_id:
        return "openai"
    if _looks_like_claude(model_id):
        return "claude"

    m = model_id.lower()
    for prefix in _OPENROUTER_PREFIXES:
        if m.startswith(prefix):
            return "openrouter"

    # Direct OpenAI explicit prefix.
    if m.startswith("openai/"):
        return "openai"

    # Catch-all: any other vendor/model shape (e.g. `cohere/command-r`,
    # `nousresearch/hermes-3`) routes through OpenRouter. Pure bare model
    # ids (no slash) stay on direct OpenAI for back-compat with W1/W2.
    if "/" in model_id:
        return "openrouter"

    return "openai"


def _looks_like_claude(model_id: str) -> bool:
    if not model_id:
        return False
    m = model_id.lower()
    if m.startswith("anthropic/") or m.startswith("claude/"):
        return True
    return "claude" in m


def _strip_provider_prefix(model_id: str) -> str:
    if not model_id:
        return model_id
    for prefix in ("anthropic/", "claude/"):
        if model_id.startswith(prefix):
            return model_id[len(prefix):]
    return model_id


def _extract_routing_text(body: Dict[str, Any]) -> str:
    """Pull a routing-signal string from an Anthropic Messages body without raising.

    Contract: returns concatenated text from `system` (string or list of text
    blocks) and `messages[*].content` (string or list of blocks, only `type=text`
    counted). Returns the `_TOOL_ONLY_SENTINEL` when messages exist but contain
    zero text content (tool-only / image-only). Returns empty string only when
    `messages` is empty or missing. Never raises on a well-formed Anthropic body.
    """
    if not isinstance(body, dict):
        return ""

    pieces: List[str] = []

    system = body.get("system")
    if isinstance(system, str):
        pieces.append(system)
    elif isinstance(system, list):
        for block in system:
            if isinstance(block, str):
                pieces.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                txt = block.get("text")
                if isinstance(txt, str):
                    pieces.append(txt)

    messages = body.get("messages")
    has_messages = isinstance(messages, list) and len(messages) > 0
    if has_messages:
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            content = msg.get("content")
            if isinstance(content, str):
                pieces.append(content)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, str):
                        pieces.append(block)
                    elif isinstance(block, dict) and block.get("type") == "text":
                        txt = block.get("text")
                        if isinstance(txt, str):
                            pieces.append(txt)

    text = "".join(pieces).strip()
    if text:
        return text
    if has_messages:
        return _TOOL_ONLY_SENTINEL
    return ""


async def _route_messages_model(
    body: Dict[str, Any],
    current_user: UserSession,
    requested_model: Optional[str],
) -> Dict[str, Any]:
    """Return {'model': str, 'provider': str, 'analysis': dict} for the routed model.

    Pulls the routing signal text out of the raw Anthropic body via
    `_extract_routing_text`, wraps it in a minimal user-role `ChatMessage`,
    and feeds the existing intelligent recommendation pipeline. W2 lifts the
    W1 coercion: when the recommendation is non-Claude we now dispatch into
    the cross-format translation path instead of forcing claude-sonnet.
    """
    from app.api.production_completion import (
        ChatMessage,
        _map_tier_to_model,
        get_intelligent_model_recommendation_with_analysis,
        get_user_config_from_api_key,
    )

    user_config = await get_user_config_from_api_key(current_user, requested_model)

    # PDR Mode A opt-in branch. Zero-overhead when `pdr.enabled` is false
    # (default). If the decomposer succeeds with a non-fallback source (or
    # the user explicitly opts into heuristic-fallback routing via
    # `use_heuristic_fallback=True`, which is the v0 default since the
    # trained head has not shipped), short-circuit here and skip the
    # existing complexity-analyzer pipeline. Any exception falls through
    # to the existing recommendation path so PDR can never regress the
    # happy path.
    model_params = user_config.get("model_parameters") or {}
    pdr_cfg = model_params.get("pdr") or {}
    if pdr_cfg.get("enabled"):
        try:
            from app.services.decomposer import _shared_decomposer

            decision = await _shared_decomposer.classify_turn(
                body=body,
                user_config=user_config,
                confidence_threshold=pdr_cfg.get("confidence_threshold", 0.55),
            )

            use_heuristic_fallback = pdr_cfg.get("use_heuristic_fallback", True)
            if decision.source != "heuristic_fallback" or use_heuristic_fallback:
                selected_models = user_config.get("selected_models") or []
                tier_model = _map_tier_to_model(
                    decision.tier, selected_models, model_params
                )
                model = tier_model or CLAUDE_FALLBACK_MODEL
                return {
                    "model": model,
                    "provider": _detect_provider(model),
                    "analysis": {
                        "strategy": "pdr_mode_a",
                        "sub_task": decision.sub_task.value,
                        "pdr_tier": decision.tier,
                        "confidence": decision.confidence,
                        "source": decision.source,
                    },
                }
        except Exception as e:  # noqa: BLE001
            logger.warning("PDR classification failed, falling through: %s", e)
            # Intentional fall-through to existing pipeline below.

    routing_text = _extract_routing_text(body)
    adapted = [ChatMessage(role="user", content=routing_text or _TOOL_ONLY_SENTINEL)]

    try:
        recommended, analysis = await get_intelligent_model_recommendation_with_analysis(
            adapted, user_config, current_user
        )
    except Exception as e:
        logger.warning("recommendation failed in /v1/messages, falling back: %s", e)
        return {
            "model": CLAUDE_FALLBACK_MODEL,
            "provider": "claude",
            "analysis": {"strategy": "fallback", "error": str(e)},
        }

    model = _strip_provider_prefix(recommended)
    return {
        "model": model,
        "provider": _detect_provider(recommended),
        "analysis": analysis or {},
    }


def _log_stream_analytics(
    request_id: str,
    selected_model: str,
    prompt_chars: int,
    latency_ms: int,
    status: str,
) -> None:
    """Record a streaming-request analytics line.

    TODO(W2): replace this with a proper SupabaseUnifiedLLMService
    analytics_service.log_request_analytics() call so streaming requests show
    up in billing + savings. For W1 we emit a logger record so the data is at
    least surfaced — current production state was complete silence.
    """
    logger.info(
        "messages_stream_complete request_id=%s model=%s status=%s prompt_chars=%d latency_ms=%d tokens_approx=None",
        request_id,
        selected_model,
        status,
        prompt_chars,
        latency_ms,
    )


async def _proxy_stream_claude(
    forward_body: Dict[str, Any],
    headers: Dict[str, str],
):
    """Async generator that pipes an upstream Anthropic SSE stream byte-for-byte.

    Ported from NadirClaw/nadirclaw/server.py:2284-2303. On upstream non-200,
    yields a single SSE `event: error` frame and returns. On mid-stream
    transport failure (`RemoteProtocolError`, `ReadTimeout`, `StreamError`)
    yields a terminal `event: error` frame and exits cleanly. Best-effort:
    if the failure happens after a partial Anthropic frame has been written
    to the client, the injected error frame may collide with parser state on
    the client side — see W1 risk register #1 + reviewer must-fix #6.
    """
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST", ANTHROPIC_UPSTREAM, headers=headers, json=forward_body
            ) as upstream:
                if upstream.status_code != 200:
                    err_body = await upstream.aread()
                    err_text = err_body.decode("utf-8", errors="replace")[:500]
                    payload = {
                        "type": "error",
                        "error": {
                            "type": "api_error",
                            "message": f"upstream status {upstream.status_code}: {err_text}",
                        },
                    }
                    yield f"event: error\ndata: {json.dumps(payload)}\n\n".encode()
                    return

                try:
                    async for chunk in upstream.aiter_bytes():
                        if chunk:
                            yield chunk
                except (
                    httpx.RemoteProtocolError,
                    httpx.ReadTimeout,
                    httpx.StreamError,
                ) as e:
                    logger.warning("upstream stream failure: %s", e)
                    terminal = {
                        "type": "error",
                        "error": {
                            "type": "stream_error",
                            "message": "upstream connection lost",
                        },
                    }
                    yield f"event: error\ndata: {json.dumps(terminal)}\n\n".encode()
                    return
    except httpx.HTTPError as e:
        logger.warning("upstream connect error: %s", e)
        terminal = {
            "type": "error",
            "error": {
                "type": "api_error",
                "message": f"upstream error: {e}",
            },
        }
        yield f"event: error\ndata: {json.dumps(terminal)}\n\n".encode()
        return


@router.post("/v1/messages")
async def anthropic_messages(
    raw: Request,
    current_user: UserSession = Depends(require_active_subscription),
):
    """Anthropic Messages-compatible endpoint with Nadir routing.

    Routes the request through Nadir's complexity analyzer, picks the right
    Claude tier (haiku/sonnet/opus), and forwards the body to
    api.anthropic.com with the model field rewritten. Streaming requests
    are piped through SSE-byte-for-SSE-byte for Claude targets.
    """
    try:
        body = await raw.json()
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content=make_anthropic_error("invalid_request_error", f"invalid JSON: {e}"),
        )

    if not isinstance(body, dict):
        return JSONResponse(
            status_code=400,
            content=make_anthropic_error("invalid_request_error", "body must be a JSON object"),
        )

    # Hosted requests draw Nadir's own provider spend — enforce the prepaid
    # credit gate before doing any routing work (no-op for BYOK). Surface the
    # 402 in the Anthropic error envelope so SDK clients parse it cleanly.
    try:
        await enforce_hosted_budget_or_402(current_user)
    except HTTPException as gate_exc:
        gate_detail = gate_exc.detail if isinstance(gate_exc.detail, dict) else {"message": str(gate_exc.detail)}
        return JSONResponse(
            status_code=gate_exc.status_code,
            content=make_anthropic_error(
                str(gate_detail.get("error", "payment_required")),
                str(gate_detail.get("message", "Payment required.")),
            ),
        )

    is_streaming = bool(body.get("stream"))
    requested_model = body.get("model") or ""

    route = await _route_messages_model(body, current_user, requested_model)
    selected_model = route["model"]
    provider = route.get("provider") or _detect_provider(selected_model)
    analysis = route["analysis"]

    is_claude_target = provider == "claude"

    upstream_key = _resolve_upstream_key(provider, current_user)
    if not upstream_key:
        return JSONResponse(
            status_code=401,
            content=make_anthropic_error(
                "authentication_error",
                f"no {provider} key available. Provide one via BYOK or upgrade to hosted keys.",
            ),
        )

    response_headers = {
        "x-nadir-routed-to": selected_model,
        "x-nadir-strategy": str(analysis.get("strategy", "smart_route")),
    }

    # ---- Claude path ----------------------------------------------------
    if is_claude_target:
        forward_body = dict(body)
        forward_body["model"] = selected_model

        anthropic_version = (
            body.get("anthropic_version")
            or raw.headers.get("anthropic-version")
            or DEFAULT_ANTHROPIC_VERSION
        )
        forward_body.pop("anthropic_version", None)

        # Claude-only headers. anthropic-beta is forwarded ONLY here so the
        # header never leaks to OpenAI / Google upstreams.
        claude_headers = {
            "x-api-key": upstream_key,
            "anthropic-version": anthropic_version,
            "content-type": "application/json",
        }
        beta = raw.headers.get("anthropic-beta")
        if beta:
            claude_headers["anthropic-beta"] = beta

        if is_streaming:
            routing_text = _extract_routing_text(body)
            prompt_chars = len(routing_text)
            request_id = f"req_{uuid.uuid4().hex[:24]}"
            stream_start = time.time()

            async def _wrapped_stream():
                log_status = "ok"
                try:
                    async for chunk in _proxy_stream_claude(forward_body, claude_headers):
                        yield chunk
                except asyncio.CancelledError:
                    # Claude path is a byte-for-byte passthrough so we still
                    # emit a best-effort terminal frame here (W1 contract).
                    # The cross-format branch defers all terminal frame
                    # emission to AnthropicSseTranslator's finally instead.
                    log_status = "client_cancelled"
                    terminal = {
                        "type": "error",
                        "error": {
                            "type": "stream_error",
                            "message": "client disconnected",
                        },
                    }
                    try:
                        yield f"event: error\ndata: {json.dumps(terminal)}\n\n".encode()
                    except Exception:  # noqa: BLE001
                        pass
                    raise
                except Exception as e:  # noqa: BLE001
                    log_status = f"unexpected:{type(e).__name__}"
                    logger.exception("unexpected error during messages stream")
                    terminal = {
                        "type": "error",
                        "error": {
                            "type": "internal_error",
                            "message": "internal error during stream",
                        },
                    }
                    yield f"event: error\ndata: {json.dumps(terminal)}\n\n".encode()
                finally:
                    latency_ms = int((time.time() - stream_start) * 1000)
                    try:
                        _log_stream_analytics(
                            request_id=request_id,
                            selected_model=selected_model,
                            prompt_chars=prompt_chars,
                            latency_ms=latency_ms,
                            status=log_status,
                        )
                    except Exception:  # noqa: BLE001
                        logger.exception("failed to log stream analytics")

            stream_headers = dict(response_headers)
            stream_headers["x-nadir-request-id"] = request_id
            return StreamingResponse(
                _wrapped_stream(),
                media_type="text/event-stream",
                headers=stream_headers,
            )

        # Non-streaming Claude.
        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                upstream = await client.post(
                    ANTHROPIC_UPSTREAM, headers=claude_headers, json=forward_body
                )
        except httpx.HTTPError as e:
            logger.warning("upstream Anthropic error: %s", e)
            return JSONResponse(
                status_code=502,
                content=make_anthropic_error("api_error", f"upstream error: {e}"),
            )

        latency_ms = int((time.time() - start) * 1000)

        if upstream.status_code != 200:
            try:
                err_payload = upstream.json()
            except Exception:
                err_payload = make_anthropic_error("api_error", upstream.text[:500])
            return JSONResponse(status_code=upstream.status_code, content=err_payload)

        payload = upstream.json()
        response_headers["x-nadir-latency-ms"] = str(latency_ms)
        return JSONResponse(content=payload, status_code=200, headers=response_headers)

    # ---- Cross-format path (OpenAI / OpenRouter; Gemini in WS-2.5) ------
    if provider == "openrouter":
        upstream_url = _openrouter_upstream_url()
    else:
        upstream_url = _UPSTREAM_URLS.get(provider)
    if not upstream_url:
        return JSONResponse(
            status_code=400,
            content=make_anthropic_error(
                "invalid_request_error",
                f"provider '{provider}' is not yet supported on /v1/messages.",
            ),
        )

    try:
        openai_body = anthropic_body_to_openai_body(body)
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content=make_anthropic_error("invalid_request_error", str(e)),
        )
    openai_body["model"] = selected_model
    if is_streaming:
        openai_body["stream"] = True
        openai_body.setdefault("stream_options", {"include_usage": True})

    # OpenRouter attribution headers (their convention for app identification).
    extra_headers: Optional[Dict[str, str]] = None
    if provider == "openrouter":
        extra_headers = {
            "HTTP-Referer": "https://getnadir.com",
            "X-Title": "Nadir Router",
        }

    if is_streaming:
        routing_text = _extract_routing_text(body)
        prompt_chars = len(routing_text)
        request_id = f"req_{uuid.uuid4().hex[:24]}"
        stream_start = time.time()
        translator = AnthropicSseTranslator(
            msg_id=f"msg_{uuid.uuid4().hex[:24]}",
            target_model=selected_model,
        )

        async def _wrapped_stream():
            log_status = "ok"
            try:
                openai_stream = _proxy_stream_openai_compat(
                    openai_body, upstream_url, upstream_key, extra_headers=extra_headers
                )
                async for chunk in translator.translate(openai_stream):
                    yield chunk
            except asyncio.CancelledError:
                # Per reviewer must-fix #3, terminal-frame emission is owned
                # by the translator's try/finally. Just record status and
                # re-raise; the translator already flushed.
                log_status = "client_cancelled"
                raise
            except UpstreamTransportError as e:
                # Expected transport failure. Translator already emitted
                # stop_reason=error in its finally; we just record the
                # specific status so it shows up in logs as a transport
                # issue rather than an unexpected exception.
                log_status = "upstream_transport_error"
                logger.warning("cross-format stream upstream error: %s", e)
            except Exception as e:  # noqa: BLE001
                log_status = f"unexpected:{type(e).__name__}"
                logger.exception("unexpected error during cross-format stream")
            finally:
                latency_ms = int((time.time() - stream_start) * 1000)
                try:
                    _log_stream_analytics(
                        request_id=request_id,
                        selected_model=selected_model,
                        prompt_chars=prompt_chars,
                        latency_ms=latency_ms,
                        status=log_status,
                    )
                except Exception:  # noqa: BLE001
                    logger.exception("failed to log stream analytics")

        stream_headers = dict(response_headers)
        stream_headers["x-nadir-request-id"] = request_id
        return StreamingResponse(
            _wrapped_stream(),
            media_type="text/event-stream",
            headers=stream_headers,
        )

    # Non-streaming cross-format: one-shot POST then translate.
    start = time.time()
    one_shot_headers = {
        "Authorization": f"Bearer {upstream_key}",
        "content-type": "application/json",
    }
    if extra_headers:
        for k, v in extra_headers.items():
            if k.lower() in ("authorization", "content-type"):
                continue
            one_shot_headers[k] = v
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            upstream = await client.post(
                upstream_url,
                headers=one_shot_headers,
                json=openai_body,
            )
    except httpx.HTTPError as e:
        logger.warning("upstream %s error: %s", provider, e)
        return JSONResponse(
            status_code=502,
            content=make_anthropic_error("api_error", f"upstream error: {e}"),
        )

    latency_ms = int((time.time() - start) * 1000)

    if upstream.status_code != 200:
        try:
            err_payload = upstream.json()
        except Exception:
            err_payload = make_anthropic_error("api_error", upstream.text[:500])
        return JSONResponse(status_code=upstream.status_code, content=err_payload)

    from app.services.anthropic_translate import openai_response_to_anthropic
    try:
        payload = openai_response_to_anthropic(upstream.json(), selected_model)
    except ValueError as e:
        return JSONResponse(
            status_code=502,
            content=make_anthropic_error("api_error", f"translation failed: {e}"),
        )

    response_headers["x-nadir-latency-ms"] = str(latency_ms)
    return JSONResponse(content=payload, status_code=200, headers=response_headers)


def _resolve_upstream_anthropic_key(current_user: UserSession) -> Optional[str]:
    """Return the Anthropic key to use for this user's upstream call.

    Order of preference:
      1. User-provided BYOK key on the API key config.
      2. Hosted Anthropic key from settings (only for users on hosted mode).
    """
    api_key_config = getattr(current_user, "api_key_config", None) or {}
    raw_data = getattr(current_user, "raw_data", None) or {}

    byok = (
        api_key_config.get("anthropic_api_key")
        or raw_data.get("anthropic_api_key")
    )
    if byok:
        return byok

    if getattr(current_user, "key_mode", None) == "hosted":
        from app.settings import settings
        return getattr(settings, "ANTHROPIC_API_KEY", None)

    return None


def _resolve_upstream_openai_key(current_user: UserSession) -> Optional[str]:
    api_key_config = getattr(current_user, "api_key_config", None) or {}
    raw_data = getattr(current_user, "raw_data", None) or {}
    byok = api_key_config.get("openai_api_key") or raw_data.get("openai_api_key")
    if byok:
        return byok
    if getattr(current_user, "key_mode", None) == "hosted":
        from app.settings import settings
        return getattr(settings, "OPENAI_API_KEY", None)
    return None


def _resolve_upstream_openrouter_key(current_user: UserSession) -> Optional[str]:
    """Return the OpenRouter key for this user's upstream call.

    Order of preference:
      1. User-provided BYOK key on the API key config or raw_data.
      2. Hosted OpenRouter key from settings (only for users on hosted mode).

    Returns None when neither source produces a non-empty value.
    """
    api_key_config = getattr(current_user, "api_key_config", None) or {}
    raw_data = getattr(current_user, "raw_data", None) or {}

    byok = (
        api_key_config.get("openrouter_api_key")
        or raw_data.get("openrouter_api_key")
    )
    if byok:
        return byok

    if getattr(current_user, "key_mode", None) == "hosted":
        from app.settings import settings
        hosted = getattr(settings, "OPENROUTER_API_KEY", "") or ""
        return hosted or None

    return None


def _resolve_upstream_key(provider: str, current_user: UserSession) -> Optional[str]:
    """Provider-aware key resolution. Dispatches claude/openai/openrouter.

    Google/Gemini routing is deferred to WS-2.5.
    """
    if provider == "claude":
        return _resolve_upstream_anthropic_key(current_user)
    if provider == "openai":
        return _resolve_upstream_openai_key(current_user)
    if provider == "openrouter":
        return _resolve_upstream_openrouter_key(current_user)
    return None


class UpstreamTransportError(Exception):
    """Raised when the cross-format upstream fails to deliver a usable stream.

    Propagates through the translator's `async for`, triggers its `finally`
    block to emit `stop_reason=error` + `message_stop`, then bubbles up to
    `_wrapped_stream` where it is logged. Distinct from a clean EOF (which
    would produce `stop_reason=end_turn` and mislead clients into thinking
    the model completed normally).
    """


async def _proxy_stream_openai_compat(
    openai_body: Dict[str, Any],
    upstream_url: str,
    upstream_key: str,
    extra_headers: Optional[Dict[str, str]] = None,
):
    """Proxy an OpenAI-compatible Chat Completions SSE stream.

    Headers contract (reviewer should-fix #8): this function builds a FRESH
    `{"Authorization": "Bearer <key>", "content-type": "application/json"}`
    dict for the upstream call. It NEVER receives or reuses the Anthropic
    headers dict from the route handler.

    `extra_headers` is an optional mapping merged in AFTER the base headers
    (so attribution headers cannot overwrite Authorization or content-type).
    OpenRouter passes `HTTP-Referer` and `X-Title` through this seam; the
    direct OpenAI call site passes None.

    On upstream non-200 or mid-stream transport failure, raises
    `UpstreamTransportError`. The translator's `finally` then emits
    `stop_reason=error` + `message_stop`. (W2 validator Issue 1: previously
    we returned silently on failure, which the translator interpreted as
    clean EOF and emitted `end_turn`, masking real failures.)
    """
    headers = {
        "Authorization": f"Bearer {upstream_key}",
        "content-type": "application/json",
    }
    if extra_headers:
        for k, v in extra_headers.items():
            if k.lower() in ("authorization", "content-type"):
                # Defensive: never let attribution headers clobber auth.
                continue
            headers[k] = v
    try:
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST", upstream_url, headers=headers, json=openai_body
            ) as upstream:
                if upstream.status_code != 200:
                    err_body = await upstream.aread()
                    logger.warning(
                        "cross-format upstream non-200 status=%s body=%s",
                        upstream.status_code,
                        err_body[:200],
                    )
                    raise UpstreamTransportError(
                        f"upstream {upstream.status_code}: {err_body[:200].decode('utf-8', 'replace')}"
                    )
                async for chunk in upstream.aiter_bytes():
                    if chunk:
                        yield chunk
    except httpx.HTTPError as e:
        logger.warning("cross-format upstream transport error: %s", e)
        raise UpstreamTransportError(f"transport error: {e}") from e
