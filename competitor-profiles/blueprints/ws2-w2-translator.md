# WS-2 W2 Blueprint — Cross-Format SSE Translation

**Generated**: 2026-05-23 (Cycle 2)
**Status**: Draft, pending reviewer pass

## Context

W1 (Claude streaming + passthrough) shipped in cycle 1. Key facts from existing code:
- `anthropic_messages.py:164-173` coerces non-Claude recommendations back to `CLAUDE_FALLBACK_MODEL`. **W2 lifts this**.
- `anthropic_messages.py:302-309` returns hard 400 for `stream=true` on non-Claude.
- `anthropic_messages.py:352-401` (`_wrapped_stream`) has `CancelledError` flush. W2 must verify it composes with ToolCallAccumulator state.
- `anthropic_messages.py:456-477` (`_resolve_upstream_anthropic_key`) handles only Anthropic. W2 extends to provider-aware.

## Section 1 — `anthropic_sse_translate.py`

Location: `backend/app/services/anthropic_sse_translate.py`. Pure Python stdlib.

### `ToolCallAccumulator` dataclass
```
@dataclass
class ToolCallAccumulator:
    openai_index: int
    tool_use_id: str         # "toolu_<24hex>"
    name: str
    args_buffer: str         # accumulates arguments fragments
    anthropic_block_index: int
    emitted_start: bool
```

Keyed `dict[int, ToolCallAccumulator]` by OpenAI tool_calls index. The Anthropic block index is auto-incremented by appearance order, NOT derived from OpenAI index (handles index gaps).

### State machine

States: `IDLE`, `TEXT_OPEN`, `TOOL_OPEN`, `DONE`. Lazy `message_start` emission on first non-empty delta (avoids leading-empty-chunk issue).

```
IDLE
  first non-empty text -> emit message_start + content_block_start(idx=0,text) + content_block_delta -> TEXT_OPEN
  first tool name      -> emit message_start + content_block_start(idx=next,tool_use) -> TOOL_OPEN

TEXT_OPEN
  text delta            -> content_block_delta text_delta
  new tool name         -> content_block_stop(idx=0) + content_block_start(idx=next,tool_use) -> TOOL_OPEN
  finish_reason         -> content_block_stop(idx=0) + message_delta + message_stop -> DONE

TOOL_OPEN
  same-index name       -> ignore (dup)
  new-index name        -> close prev block (flush args as input_json_delta) + open new
  arguments fragment    -> accumulator[N].args_buffer += fragment  (do NOT stream partial!)
  finish_reason         -> for each open block: emit input_json_delta(full args) + content_block_stop
                          + message_delta + message_stop -> DONE

DONE
  all chunks no-op
```

### Finish-reason mapping

| OpenAI | Anthropic |
|---|---|
| `stop` | `end_turn` |
| `length` | `max_tokens` |
| `tool_calls` | `tool_use` |
| `content_filter` | `stop_sequence` |
| other | `end_turn` |

### `_sse(event_type, data_dict) -> bytes`
```
b"event: " + event_type.encode() + b"\ndata: " + json.dumps(data_dict).encode() + b"\n\n"
```

### Class signature
```python
class AnthropicSseTranslator:
    def __init__(self, msg_id: str, target_model: str) -> None: ...
    async def translate(self, openai_stream: AsyncIterator[bytes]) -> AsyncIterator[bytes]: ...
```

### Mid-stream cancellation / error flush

`translate` wraps the `async for chunk in openai_stream:` in `try/finally`. Finally block:
- TEXT_OPEN → emit `content_block_stop(idx=0)`
- TOOL_OPEN → for each accumulator with `emitted_start`: emit args + `content_block_stop`
- Always: `message_delta stop_reason=error` + `message_stop`

Do NOT catch CancelledError. Let it propagate after finally (mirrors W1 `_wrapped_stream`).

### OpenAI chunk parser
1. Split on `\n\n` for SSE frames
2. Extract `data:` line, skip `[DONE]` and empty
3. JSON-parse
4. Route on `choices[0].delta` + `choices[0].finish_reason`
5. Skip empty deltas (no spurious message_start)

## Section 2 — `anthropic_body_to_openai_body(body: dict) -> dict`

Add to `anthropic_translate.py` after line 163. Pure, no mutation. Add `import json` (currently absent in that module).

### Strip list (top-level)
`thinking`, `betas`, `anthropic_version`, `anthropic-beta`, `cache_control` (top-level only; nested cache_control left alone).

### Mapping rules

**`system`**: string → first `role:system`. List → flatten text blocks via existing `_flatten_text_blocks`. Absent → omit.

**`messages[*]`**:
- `role:user` string → `{role:"user", content:str}`
- `role:user` list:
  - text blocks → concatenate to string content
  - `tool_result` → `{role:"tool", tool_call_id:<id>, content:<str>}`
  - `image` → `{type:"image_url", image_url:{url:"data:<mime>;base64,<data>"}}` in multipart content
- `role:assistant` string → as-is
- `role:assistant` list:
  - text → string content
  - `tool_use` → `tool_calls:[{id, type:"function", function:{name, arguments: json.dumps(input)}}]`

**`tools`**: `{name, description, input_schema}` → `{type:"function", function:{name, description, parameters:<schema>}}`

**`tool_choice`**:
- `{type:"auto"}` → `"auto"`
- `{type:"any"}` → `"required"`
- `{type:"tool", name}` → `{type:"function", function:{name}}`
- absent → omit

**Passthrough**: `max_tokens`, `temperature`, `top_p`, `stream`. `stop_sequences` → `stop`.

**Drop**: `top_k`, `metadata`, plus the strip list above.

## Section 3 — Lift non-Claude coercion

### `_route_messages_model` (lines 131-174)

Remove `if not _looks_like_claude(recommended):` block. Return:
```python
return {
    "model": recommended,
    "provider": _detect_provider(recommended),
    "analysis": analysis or {},
}
```

`_detect_provider`: claude / google (gemini, google/, models/gemini) / openai (default).

### Route handler

Replace W1 400 guard at lines 302-309 with W2 dispatch:
1. If Claude: existing `_proxy_stream_claude` path.
2. If non-Claude streaming:
   - `openai_body = anthropic_body_to_openai_body(body)`; set model + stream=True
   - `key = _resolve_upstream_key(provider, current_user)`
   - URL from `_UPSTREAM_URLS[provider]`
   - `AnthropicSseTranslator(msg_id, target_model=selected_model_for_client)`
   - `_proxy_stream_openai_compat(openai_body, headers, url)` piped through `translator.translate(...)`

`_UPSTREAM_URLS = {"openai": "https://api.openai.com/v1/chat/completions", "google": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"}`

### `_resolve_upstream_key(provider, current_user)`

- claude → existing logic (BYOK anthropic_api_key, settings.ANTHROPIC_API_KEY)
- openai → BYOK openai_api_key, settings.OPENAI_API_KEY
- google → BYOK google_api_key, settings.GOOGLE_API_KEY

Keep `_resolve_upstream_anthropic_key` for backward compat.

### `_proxy_stream_openai_compat`

Mirror `_proxy_stream_claude` but: target the upstream URL param, use `Authorization: Bearer`. Same error handling contract.

### `anthropic-beta` header leakage fix

Move `anthropic-beta` forwarding INSIDE the Claude-only header construction path. Currently at `anthropic_messages.py:336-338` runs before branch.

## Section 4 — 7 Test Sequences

Shared helpers: `_parse_sse_frames(raw: bytes) -> list[tuple[str, dict]]` splits on `\n\n`. Reuse `_drain` pattern from `test_anthropic_messages_stream.py:157`.

1. **Text-only response**: text deltas → message_start, content_block_start(text), content_block_delta(s), content_block_stop, message_delta(end_turn), message_stop.
2. **Single tool call multi-fragment args**: name + 3 arg fragments + finish=tool_calls → message_start, content_block_start(tool_use), single input_json_delta with full accumulated JSON, content_block_stop, message_delta(tool_use), message_stop. **Assert no partial fragments emitted.**
3. **Mixed text then tool**: text deltas + tool_calls → sequential blocks at idx=0 (text) and idx=1 (tool_use).
4. **finish=length → stop_reason=max_tokens**.
5. **Mid-stream RemoteProtocolError**: text delta + raise → finally flushes content_block_stop + message_delta(error) + message_stop. No exception leak.
6. **Two sequential tool calls**: indexes 0 and 1, each own args_buffer. Block index follows name-appearance order, NOT OpenAI index value.
7. **Empty delta chunks ignored**: `delta:{}` + `delta:{role:assistant}` + real delta → message_start fires exactly once, only on real delta.

## Section 5 — Files

| File | Action |
|---|---|
| `backend/app/services/anthropic_sse_translate.py` | NEW |
| `backend/tests/test_anthropic_sse_translate.py` | NEW |
| `backend/app/services/anthropic_translate.py` | MODIFY (add `anthropic_body_to_openai_body`, add `import json`) |
| `backend/app/api/anthropic_messages.py` | MODIFY (lift coercion, dispatch, `_UPSTREAM_URLS`, `_detect_provider`, `_resolve_upstream_key`, `_proxy_stream_openai_compat`, fix anthropic-beta leakage) |
| `backend/tests/test_anthropic_body_to_openai_body.py` | NEW (9 cases) |

## Section 6 — Risk register

1. **ToolCallAccumulator partial state at CancelledError**: `try/finally` inside `translate` must be innermost boundary. `_wrapped_stream` iterates `translator.translate()` as a single `async for`, not separately. Python `finally` runs on CancelledError. Verify with test 5 + dedicated cancel test.
2. **OpenAI tool_calls index gaps**: `anthropic_block_index` is auto-incremented by appearance order, dict keyed by OpenAI index for accumulator lookup only. Anthropic block indexes always contiguous.
3. **Google OpenAI-compat auth differs**: Bearer vs `x-goog-api-key`. We use Bearer. If user's BYOK google_api_key is a service-account JSON blob, 401 silently. Mitigation: validate key looks like API string, return None with logged warning if not.
4. **`message_start` usage is a stub**: token counts not available until final chunk. Parse last non-DONE chunk for usage, emit corrected `message_delta` before `message_stop`. If no usage, stub zeros acceptable. Document.
5. **`anthropic-beta` header leakage to OpenAI/Google**: must move forwarding INSIDE Claude-only branch in `anthropic_messages.py`. Currently runs before branch at line 336-338.

## Section 7 — Build sequence (4 days; Day 5 deferred to WS-2.5)

**Day 1** [SHIPPED]: `anthropic_body_to_openai_body` + unit tests. All 21 cases pass including the multi-tool-result reviewer fix.
**Day 2** [SHIPPED]: Skeleton `AnthropicSseTranslator` + text-only path + finish_reason mapping + sequences 1, 4, 7.
**Day 3** [SHIPPED]: TOOL_OPEN state + accumulator flush + `finally` flush + sequences 2, 3, 5, 6 + parallel out-of-order + dedicated CancelledError test. All 19 SSE tests pass.
**Day 4** [SHIPPED]: Lifted coercion. Added `_UPSTREAM_URLS` (openai only), `_detect_provider`, `_resolve_upstream_key`, `_proxy_stream_openai_compat`. Moved anthropic-beta into Claude-only branch. `_wrapped_stream` cancel handler no longer yields a frame in the cross-format branch — translator owns terminals. 4 integration tests pass.
**Day 5** [DEFERRED to WS-2.5]: Gemini path. Different `finish_reason` ("SAFETY"), different auth header (`x-goog-api-key`), different parallel function-call response structure.

## Data flow

```
Client (Anthropic SDK)
  POST /v1/messages
     |
  _route_messages_model -> {model, provider, analysis}
     |
  [Claude] -> _proxy_stream_claude -> bytes passthrough -> Client
     |
  [non-Claude] -> anthropic_body_to_openai_body -> openai_body
                    -> _resolve_upstream_key(provider)
                    -> _proxy_stream_openai_compat -> raw OpenAI SSE
                    -> AnthropicSseTranslator.translate -> Anthropic SSE
                    -> _wrapped_stream -> StreamingResponse -> Client
```

## Open question for reviewer

**Tool argument streaming: batch vs fragment-by-fragment.**

Anthropic SSE spec allows streaming `input_json_delta` fragments. Some SDK integrations render partial JSON as it arrives. Current blueprint batches (single `input_json_delta` per `content_block_stop`) for safety: guarantees one valid JSON string per block close, no parser confusion on truncation.

Reviewer confirmed: Anthropic spec accepts single-fragment + `content_block_stop` as fully compliant. The batch approach is safe. Ship batch in W2.

---

## Reviewer must-fixes (applied 2026-05-23, cycle 2)

### Blocking (must address before Day 2)

1. **Skipworthy-chunk predicate**: define explicitly in the SSE parser. A chunk is skipworthy iff `choices[0].finish_reason is None` AND `choices[0].delta` has no non-empty `content` string AND no `tool_calls` entry with non-null `function.name` or non-empty `function.arguments`. `delta.role`-only chunks are skipworthy. `delta.reasoning` is skipworthy (extended-thinking passthrough is W3+ scope). `delta.refusal` is NOT skipworthy: open a text block, emit refusal text as `text_delta`, then on `finish_reason=content_filter` map to `stop_reason=stop_sequence` (Anthropic's closest equivalent).

2. **`tool_result` multi-block mapping**: a single Anthropic user message with N `tool_result` blocks produces N separate OpenAI `role:tool` messages, each with its own `tool_call_id`. Order preserved from the source array. Add `test_multi_tool_result` to `test_anthropic_body_to_openai_body.py` covering this.

3. **CancelledError ownership**: `translate()` owns the terminal-frame emission. `_wrapped_stream` MUST catch `CancelledError` but yield NO frame in that handler; just re-raise. This eliminates the double-terminal-frame problem. Add a dedicated cancel integration test (separate from sequence 5 which is `RemoteProtocolError`).

4. **`stream_options: {include_usage: true}` injection**: `anthropic_body_to_openai_body` must add `stream_options.include_usage = True` whenever `stream` is True. Without it, OpenAI never emits the final usage chunk and `message_start`/`message_delta` usage stays zero forever.

### Should-fix (in execute pass)

5. **`json.dumps(None)` → "null" bug**: in the `tool_use → tool_calls` mapping, treat `input is None` or `input == {}` as `arguments = "{}"`. Never emit `"null"` (Anthropic SDK fails to parse it as dict).

6. **Test 6 parallel-out-of-order assertion**: in the parallel tool calls test, send OAI index=2 BEFORE index=0. Assert the Anthropic `content_block_start` events appear in OAI-arrival order (index=2 first, then index=0), each with distinct `tool_use.id` values. Anthropic clients correlate by `id`, not by block index.

7. **Google API key positive validation**: in `_resolve_upstream_key("google", ...)`, validate `key.startswith("AIza") and len(key) == 39`. On failure, log a clear warning ("service account credentials are not supported; provide an API key") and return None.

8. **Headers dict isolation**: `_proxy_stream_openai_compat` MUST build a fresh `{"Authorization": "Bearer <key>", "content-type": "application/json"}` headers dict. It must NEVER receive the Anthropic `headers` dict from the route handler (which carries `anthropic-beta`, `x-api-key`, etc.). Add this as an explicit constraint in the function docstring.

### Nice-to-have / deferred

9. **Gemini → separate WS-2.5**. Different `finish_reason: "SAFETY"` value, different auth header (`x-goog-api-key` vs Bearer), different parallel function-call response structure. Day 5 stretch is removed; Gemini becomes its own workstream.
