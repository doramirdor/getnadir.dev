# WS-2 Blueprint — Agentic Wedge (Streaming + Cross-Format + Installer)

## Key architectural unlock

**Invert routing-before-translation order.** When routed model is Claude → pure byte passthrough (tool blocks, images, SSE all already in Anthropic format). When non-Claude → translate via new `anthropic_sse_translate.py` state machine.

`_extract_routing_text(body)` helper produces the complexity signal without throwing on image/tool blocks. Routing runs first. Translation runs only on the non-Claude path.

## Week 1 — Claude passthrough

- Remove `stream=true` 400 guard in `anthropic_messages.py:139-146`
- Add `_proxy_stream_claude(body, headers)` async generator (port from `NadirClaw/nadirclaw/server.py:2284-2303`)
- Mid-stream failure: wrap `aiter_bytes()` in `try/except (httpx.RemoteProtocolError, httpx.ReadTimeout, httpx.StreamError)`, emit `event: error\ndata: {...stream_error...}\n\n` before exit
- `anthropic_translate.py` unchanged in W1; the `UnsupportedAnthropicFeature` path becomes unreachable on Claude routes

## Week 2 — Cross-format SSE translator

New module: `backend/app/services/anthropic_sse_translate.py` (separate from `anthropic_translate.py` because request vs response direction has different lifecycle).

State machine: IDLE → TEXT_OPEN → TOOL_OPEN(N) → DONE

- First `delta.content` non-empty → emit `message_start` + `content_block_start` index=0 type=text + `content_block_delta` text_delta
- `delta.tool_calls[N].function.name` → close prior text block, emit `content_block_start` index=N+1 type=tool_use
- `delta.tool_calls[N].function.arguments` partials → accumulate in dict-keyed buffer (`dict[int, ToolCallAccumulator]` to handle out-of-order indexes)
- `finish_reason: "tool_calls"` → flush accumulator as single `input_json_delta`, close block, emit `message_delta stop_reason=tool_use` + `message_stop`
- `finish_reason: "stop"|"length"` → map to `end_turn`|`max_tokens`

Strip `anthropic-beta`, `thinking`, `betas`, `anthropic_version` from request body before forwarding to OpenAI upstream.

7 pytest sequences: text-only, single-tool, mixed-text-then-tool, finish=length, mid-stream-die, two-sequential-tools, empty-delta.

## Week 3 — `npx @nadir/router`

Package at `getnadir.dev/install/npm/`. Bin `nadir-router`, ESM, Node ≥18.

### Codex (TOML)
- Read `~/.codex/config.toml`, regex-based extraction inside sentinels (NOT full `@iarna/toml` parse-reserialize, which strips comments)
- Sentinels: `# >>> nadir managed - do not edit this block manually <<<` ... `# <<< nadir managed >>>`

### opencode (JSON)
- Sibling-key sentinels (JSON can't have inline comments): `__nadir_managed_start__: true` ... block ... `__nadir_managed_end__: true`
- Use `detect-indent` to preserve user's indent style

### Flags
- `--codex / --opencode / --claude-code`, `--scope project`, `--api-key <key>`, `--base-url`, `--uninstall`, `--no-telemetry`, `--yes`

### Idempotency
- `writeBlock` always strips first then appends. Hash compare before write. Re-running produces identical bytes outside the managed block.
- `--uninstall` calls `stripBlock`, removes sentinels and content, leaves rest untouched.

### Telemetry
- Single ping `POST /v1/telemetry/install` with `{event, target, node_version, platform, ts}`. No key, no user identifier. Default opt-in. `--no-telemetry` sets `NADIR_NO_TELEMETRY=1`.

## Risk register (top 5)

1. **Mid-stream 200-then-dead is silent in client** — Anthropic SDK blocks on `.get_final_message()`; must emit `event: error` terminal frame.
2. **`@iarna/toml` strips comments on rewrite** — use regex extraction inside sentinels, not full parse-reserialize.
3. **OpenAI tool_calls out-of-order indexes** — use `dict[int, ToolCallAccumulator]` keyed by OpenAI index.
4. **`anthropic-beta` header leaks to OpenAI** — strip in `anthropic_body_to_openai_body()`.
5. **opencode JSON sentinel collision** — `__nadir_*` prefix; consider `_nadir` top-level key if schema rejects.

## Files

W1: modify `anthropic_messages.py`, new `test_anthropic_messages_stream.py`
W2: new `anthropic_sse_translate.py`, modify `anthropic_messages.py` + `anthropic_translate.py`, new `test_anthropic_sse_translate.py`
W3: 11 new files under `install/npm/`, 3 vitest test files

---

## Reviewer must-fixes (applied 2026-05-23)

1. **`_extract_routing_text` must never raise or return empty**: on tool-only / image-only bodies, return a sentinel like `"[tool call]"` (not empty string) so `get_intelligent_model_recommendation_with_analysis` does not raise `HTTPException(400, "No user messages found")` mid-stream. Document the contract.
2. **W1 analytics gap**: streaming path bypasses `SupabaseUnifiedLLMService.log_request_analytics`. Streaming requests currently invisible to billing + savings. Add a background-task analytics call after `_proxy_stream_claude` closes (model NadirClaw's `server.py:2301` pattern). Log at minimum `{request_id, selected_model, stream: true, tokens_approx: null}`.
3. **`finally:` flush on outer streaming generator**: client-cancelled streams leave `ToolCallAccumulator` buffer abandoned + no `message_stop` → Anthropic SDK blocks on `.get_final_message()` forever. Outer async generator must have `finally:` that flushes any open block + emits `message_delta stop_reason=error` + `message_stop`.
4. **opencode JSON sentinel must be a single key, not paired**: alphabetical sort by any formatter would reorder `__nadir_managed_end__` BEFORE `__nadir_managed_start__`, inverting strip logic. Use single `__nadir_config__` key holding entire managed block as value. Strip = `delete config.providers.__nadir_config__`.
5. **Strip `thinking`, `cache_control`, `betas` for non-Claude path**: extend `anthropic_body_to_openai_body()` strip list. Today these would either silently drop or cause OpenAI 400.
6. **Mid-stream `event: error` is best-effort only**: if partial Anthropic frame already written when `RemoteProtocolError` fires, error frame could collide with parser state. Document the limitation, do not try to inject after a partial frame.
7. **GDPR telemetry default**: flip to **opt-out** (default off, `--telemetry` to enable). `--yes` does NOT auto-enable telemetry.
8. **TOML regex anchor**: anchor sentinel pattern to line-start (`^# >>> nadir managed`) to prevent false matches inside multi-line string values.

Effort recalibrated: **4 eng-weeks** (was 3), still fits 3 calendar weeks with 2 engineers parallel from W2.
