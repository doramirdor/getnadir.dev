# WS-2.5 Blueprint — Native Gemini Upstream Support

**Generated**: 2026-05-23 (Cycle 3)
**Status**: Draft, pending reviewer pass

---

## Context

Deferred from W2 (see `ws2-w2-translator.md` Section 7 + reviewer should-fix #7, #9). Four concrete blockers:

1. **Uppercase finish_reason enums**: Gemini emits `SAFETY`, `RECITATION`, `MAX_TOKENS`, `OTHER`. W2 `_FINISH_REASON_MAP` has no entries.
2. **Auth ambiguity**: Service-account JSON blob passed as `google_api_key` silently 401s. Positive `AIza` validation was deferred.
3. **Missing `index` on streaming tool_calls**: Gemini OpenAI-compat endpoint omits `index` from `tool_calls[]` items (confirmed Nov 2025, still unresolved).
4. **`stream_options` rejection on older models**: Gemini 2.5+ accepts `stream_options: {include_usage: true}`. Older versions may 400.

---

## Section 1 — Detection + routing

**File**: `backend/app/api/anthropic_messages.py`

Extend `_UPSTREAM_URLS` (line 60):
```python
_UPSTREAM_URLS = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "google": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
}
```

Extend `_detect_provider`:
```python
def _detect_provider(model_id: str) -> str:
    if _looks_like_claude(model_id):
        return "claude"
    if _looks_like_gemini(model_id):
        return "google"
    return "openai"

def _looks_like_gemini(model_id: str) -> bool:
    if not model_id:
        return False
    m = model_id.lower()
    return m.startswith("gemini") or m.startswith("google/") or m.startswith("models/gemini")
```

---

## Section 2 — Auth + positive key validation

Gemini OpenAI-compat accepts `Authorization: Bearer <AIza-key>`. No header change in `_proxy_stream_openai_compat`.

**Positive validation** (W2 reviewer should-fix #7, deferred):
```python
def _validate_google_api_key(key: str) -> Optional[str]:
    """AIza prefix + length 39. Reject service-account JSON blobs explicitly."""
    if isinstance(key, str) and key.strip().startswith("{"):
        logger.warning(
            "google_api_key looks like service-account JSON blob; "
            "service account credentials are not supported — provide an API key"
        )
        return None
    if not (isinstance(key, str) and key.startswith("AIza") and len(key) == 39):
        logger.warning("google_api_key failed positive validation (expected AIza prefix, len 39)")
        return None
    return key

def _resolve_upstream_google_key(current_user: UserSession) -> Optional[str]:
    api_key_config = getattr(current_user, "api_key_config", None) or {}
    raw_data = getattr(current_user, "raw_data", None) or {}
    byok = api_key_config.get("google_api_key") or raw_data.get("google_api_key")
    if not byok and getattr(current_user, "key_mode", None) == "hosted":
        from app.settings import settings
        byok = getattr(settings, "GOOGLE_API_KEY", None)
    return _validate_google_api_key(byok) if byok else None
```

Extend dispatcher:
```python
def _resolve_upstream_key(provider, current_user):
    if provider == "claude":  return _resolve_upstream_anthropic_key(current_user)
    if provider == "openai":  return _resolve_upstream_openai_key(current_user)
    if provider == "google":  return _resolve_upstream_google_key(current_user)
    return None
```

---

## Section 3 — Finish-reason mapping

**File**: `backend/app/services/anthropic_sse_translate.py`

Extend `_FINISH_REASON_MAP`:
```python
_FINISH_REASON_MAP = {
    # OpenAI lowercase
    "stop": "end_turn",
    "length": "max_tokens",
    "tool_calls": "tool_use",
    "content_filter": "stop_sequence",
    # Gemini uppercase enums via OpenAI-compat surface
    "SAFETY": "stop_sequence",       # policy block
    "RECITATION": "stop_sequence",   # training-data recitation block
    "MAX_TOKENS": "max_tokens",
    "OTHER": "end_turn",
}
```

Rationale per entry:
- `SAFETY` / `RECITATION` → `stop_sequence` (closest non-natural-stop Anthropic equivalent)
- `MAX_TOKENS` direct semantic match
- `OTHER` explicit `end_turn` (defensive; default fallback already returns this but explicit prevents future ambiguity)

Not yet listed: `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `MALFORMED_FUNCTION_CALL`, `LANGUAGE` — these fall through to `end_turn` default. Add to `stop_sequence` after production traffic confirms which surface.

---

## Section 4 — Parallel function-call response

**Finding**: Gemini's OpenAI-compat streaming omits `index` from `tool_calls[]` items.

**Existing mitigation**: `_handle_tool_call_fragment` at `anthropic_sse_translate.py:352-358` already has:
```python
oai_index = tc.get("index")
if oai_index is None:
    oai_index = 0
```

This covers Gemini exactly. **No code change required.**

**Documented limitation**: when Gemini sends parallel tool calls in streaming, all fragments collapse into the first accumulator slot. Cannot solve until Google adds `index` to their streaming chunks. Add docstring note in `_handle_tool_call_fragment` as a provider-specific behavior.

---

## Section 5 — Native Gemini endpoint

**Decision: Gemini-shaped `generateContent` endpoint** (not Anthropic-shaped mirror).

Clients using `google.generativeai` or `google-genai` SDKs expect `contents`/`parts`/`candidates`, not `messages`/`choices`. The Anthropic-shaped path already exists for these models via `/v1/messages` cross-format dispatch (Section 1-3 above).

**File**: `backend/app/api/gemini_messages.py`

Routes:
- `POST /v1beta/models/{model}:generateContent` (non-streaming)
- `POST /v1beta/models/{model}:streamGenerateContent` (streaming)

Flow:
1. Parse Gemini-shaped body (`contents`, `tools`, `generationConfig`, `safetySettings`, `systemInstruction`).
2. Extract routing text from last user turn's text parts.
3. Call shared `_route_messages_model` → `{model, provider, analysis}`.
4. If `provider != "google"`, **coerce** to `gemini-2.0-flash` with response header `x-nadir-coerced-to: gemini-2.0-flash`. Cross-provider dispatch from native Gemini endpoint is cycle-4 scope.
5. Translate via `gemini_translate.gemini_body_to_openai_body` → OpenAI body.
6. Dispatch via `_proxy_stream_openai_compat` (streaming) or one-shot POST.
7. Translate response back via `gemini_translate.openai_response_to_gemini`.

---

## Section 6 — Body translation (`gemini_translate.py`)

**File**: `backend/app/services/gemini_translate.py` — pure functions, mirrors `anthropic_translate.py`.

### `gemini_body_to_openai_body(body) -> (openai_body, tool_id_map)`

Mapping:
- `systemInstruction.parts[].text` → OpenAI `messages[0]` with `role:"system"`
- `contents[*].role` `"model"` → `"assistant"`, `"user"` → `"user"`
- `parts[].text` → string `content` or multipart
- `parts[].functionCall` → `tool_calls:[{id: "call_<hex8>", type:"function", function:{name, arguments: json.dumps(args)}}]` (synthesize id)
- `parts[].functionResponse` → `role:"tool"` message with `tool_call_id` matching the synthesized id (lookup via name in same turn)
- `parts[].inlineData` → multipart `image_url` with `data:<mime>;base64,<data>`
- `generationConfig.maxOutputTokens` → `max_tokens`; `.temperature` → `temperature`; `.topP` → `top_p`; `.stopSequences` → `stop`
- `tools[*].function_declarations[*]` → `tools:[{type:"function", function:{name, description, parameters}}]`
- `tool_config.function_calling_config.mode`: `AUTO` → `"auto"`, `ANY` → `"required"`, `NONE` → `"none"`

ID synthesis: `"call_" + uuid.uuid4().hex[:8]` per `functionCall`. Track in a per-request dict keyed by function name so `functionResponse` can match.

Return as `(openai_body, tool_id_map)` named tuple.

### `openai_response_to_gemini(openai_response, model) -> dict`

Output:
```json
{
  "candidates": [{"content": {"role":"model", "parts":[...]}, "finishReason": "...", "index": 0}],
  "usageMetadata": {"promptTokenCount":..., "candidatesTokenCount":..., "totalTokenCount":...},
  "modelVersion": "<model>"
}
```

Reverse finish_reason map:
- `stop` → `STOP`
- `length` → `MAX_TOKENS`
- `tool_calls` → `STOP` (Gemini uses STOP for tool completions)
- `content_filter` → `SAFETY`
- other → `OTHER`

### `openai_sse_to_gemini_sse(chunk, model) -> Optional[dict]`

Streaming: wrap each OpenAI candidate update in Gemini `StreamGenerateContentResponse` outer shape. Return `None` for skipworthy (empty/role-only) chunks. Gemini streaming uses bare `data:` lines (no `event:` headers).

---

## Section 7 — Tests

### `backend/tests/test_gemini_translate.py` (NEW, 12 tests)
1-9: body translation (text, system instruction, model→assistant, functionCall, functionResponse with id match, inlineData, generationConfig passthrough, tools, tool_config modes)
10-12: response translation (text, tool_calls, finish_reason map)

### `backend/tests/test_gemini_messages.py` (NEW, 4 tests)
- Non-streaming Gemini body → router → translated response (mocked httpx)
- Streaming path verifies SSE frames have Gemini shape
- Non-Gemini route coerced + `x-nadir-coerced-to` header
- Missing key → 401 in Gemini error format

### `backend/tests/test_anthropic_messages_w2.py` (MODIFY)
- Extend provider detection with 3 Gemini assertions (`gemini-2.0-flash`, `google/gemini-pro`, `models/gemini-2.5-pro`)
- 3 new tests for `_validate_google_api_key`: valid AIza key returns key; JSON blob returns None; wrong length returns None

### `backend/tests/test_anthropic_sse_translate.py` (MODIFY)
- `test_finish_reason_gemini_values`: SAFETY → stop_sequence, RECITATION → stop_sequence, MAX_TOKENS → max_tokens, OTHER → end_turn
- `test_gemini_missing_tool_index`: streaming tool_call chunk without `index` handled as index 0, no exception

---

## Section 8 — Files

| File | Action |
|---|---|
| `backend/app/api/anthropic_messages.py` | MODIFY: `_UPSTREAM_URLS`, `_detect_provider`+`_looks_like_gemini`, `_validate_google_api_key`, `_resolve_upstream_google_key`, extend `_resolve_upstream_key` |
| `backend/app/services/anthropic_sse_translate.py` | MODIFY: `_FINISH_REASON_MAP` adds SAFETY/RECITATION/MAX_TOKENS/OTHER; docstring note on missing-index |
| `backend/app/api/gemini_messages.py` | NEW: `:generateContent` + `:streamGenerateContent` routes |
| `backend/app/services/gemini_translate.py` | NEW: body↔OpenAI, response↔Gemini, SSE chunk translation |
| `backend/tests/test_gemini_translate.py` | NEW: 12 tests |
| `backend/tests/test_gemini_messages.py` | NEW: 4 tests |
| `backend/tests/test_anthropic_messages_w2.py` | MODIFY: provider detection + key validation |
| `backend/tests/test_anthropic_sse_translate.py` | MODIFY: finish_reason + missing-index tests |
| `backend/app/main.py` | MODIFY: register `gemini_messages_router` |

---

## Section 9 — Data flow

**Path A — `/v1/messages` with Gemini upstream (Anthropic SDK client)**
```
Client POST /v1/messages model="gemini-2.0-flash"
  → _route_messages_model → {model, provider:"google"}
  → _resolve_upstream_google_key → _validate_google_api_key → key
  → anthropic_body_to_openai_body → openai_body
  → _proxy_stream_openai_compat (Bearer key, _UPSTREAM_URLS["google"])
     → OpenAI SSE with Gemini finish_reasons (SAFETY etc)
  → AnthropicSseTranslator
     → _FINISH_REASON_MAP maps SAFETY → stop_sequence
     → missing tool index defaults to 0
  → Anthropic SSE to client
```

**Path B — Native Gemini endpoint (Google SDK client)**
```
Client POST /v1beta/models/gemini-2.0-flash:generateContent
  → gemini_messages.generate_content
  → extract routing text from contents[-1].parts[].text
  → _route_messages_model → {model, provider:"google"}
     (if provider != "google": coerce to gemini-2.0-flash)
  → _resolve_upstream_key("google", user) → key
  → gemini_body_to_openai_body → openai_body
  → POST UPSTREAM_URLS["google"] Bearer key
  → openai_response_to_gemini → gemini-shaped response
  → JSONResponse
```

---

## Section 10 — Risk register

1. **`stream_options.include_usage` rejection on pre-2.5 models**: Gemini 2.5+ accepts it; older may 400. **Open question for reviewer** (see end of doc).
2. **Service-account JSON forever refused**: Positive AIza validation rejects with clear error. Future workstream could add `google_service_account_json` BYOK + OAuth 2.0 token exchange; out of scope here.
3. **SAFETY false positives**: Borderline content can trigger SAFETY. We map to `stop_sequence`. Document in `gemini_messages.py` so clients know to inspect content to distinguish safety blocks from real stop sequences.
4. **Quota differences**: Google AI Studio uses per-project quota. Hosted `GOOGLE_API_KEY` will hit quota faster under multi-user load. Add Gemini-specific circuit breaker threshold lower than default. BYOK unaffected.
5. **SSE byte-level compatibility**: Confirmed identical to OpenAI's `data: <json>\n\n` framing. If Google changes framing, translator's `_process_frame` silently drops unrecognized frames rather than crashing.

---

## Section 11 — Build sequence

**Day 1**: `_UPSTREAM_URLS` + `_detect_provider`+`_looks_like_gemini` + `_validate_google_api_key` + `_resolve_upstream_google_key` + dispatcher extension. Provider detection + key validation tests. Full suite green.

**Day 2**: `_FINISH_REASON_MAP` extension (SAFETY/RECITATION/MAX_TOKENS/OTHER). Missing-index test. Gemini SSE integration test through cross-format `/v1/messages`. Full suite green.

**Day 3**: `gemini_translate.py` — body → OpenAI (with id synthesis), response → Gemini, SSE chunk → Gemini. 12 unit tests. Full suite green.

**Day 4**: `gemini_messages.py` native endpoint + 4 integration tests + register in `main.py`. Coercion path for non-Gemini routes. Full suite green.

**Day 5 (BLOCKED on founder providing AIza key)**: Smoke against real Google AI Studio. Non-streaming + streaming + tool turn + SAFETY trigger + BYOK + hosted fallback.

---

## Open question for reviewer

**`stream_options` stripping for older Gemini models.**

`anthropic_body_to_openai_body` unconditionally injects `stream_options: {include_usage: true}` when `stream=True`. Google accepts this for Gemini 2.5+. For older Gemini models (e.g., `gemini-1.5-flash`) the endpoint may reject with 400.

Options:
- **(A)** Strip `stream_options` for all Gemini requests, accept zero usage counts.
- **(B)** Keep injecting; older-model users get a 400 that surfaces immediately.

Recommendation: **(B)**, with a stripping helper as future migration if production traffic shows 1.5-series usage. Reviewer to confirm before Day 1.
