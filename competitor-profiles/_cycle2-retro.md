# Cycle 2 Retro

**Date**: 2026-05-23
**Duration**: Single session, 5 agent rounds (audit + 4-stage loop for two parallel workstreams)
**Agents spawned**: 12 (1 audit-runner + 2 architects + 2 reviewers + 2 executors + 2 validators + 3 inline patches by main)

---

## Headline result

**Contamination audit: PASS on both splits.** 0 overlap on 8,399 RouterArena prompts vs 10,759 training prompts (NFC-normalized SHA-256 intersection). RouterArena submission path is unblocked from the contamination angle.

**Total test count across project**: 148 passing (up from 51 at cycle 1 close).
- 11 contamination audit
- 84 backend (19 W1 translate + 21 body translate + 19 SSE translate + 15 stream + 4 W2 integration + 6 bandit)
- 53 npm installer

---

## What shipped

### Contamination audit run

- Real audit executed against `RouteWorks/RouterArena` HF dataset (sub_10 + full splits).
- Reports written to `eval/contamination_audit/reports/`.
- Caught and fixed during execution: arena downloader was only checking lowercase keys, but RouterArena uses `Question` and `Context`. First run cached empty prompts and produced a false-PASS. Fixed to case-insensitive lookup.
- One open item: `trained_model.pkl` MISSING at expected path. Recorded in artifact_hashes. Needs founder confirmation as live vs vestigial.

### WS-2 W2: Cross-format SSE translator

NEW files:
- `backend/app/services/anthropic_sse_translate.py` — `AnthropicSseTranslator` state machine + `ToolCallAccumulator` + `_is_skipworthy_chunk` predicate + `_sse` helper
- `backend/tests/test_anthropic_body_to_openai_body.py` (21 tests)
- `backend/tests/test_anthropic_sse_translate.py` (19 tests)
- `backend/tests/test_anthropic_messages_w2.py` (4 tests)

MODIFIED:
- `backend/app/services/anthropic_translate.py` — added `anthropic_body_to_openai_body` + 5 helpers (multi-tool-result fan-out, None/{} → "{}", `stream_options.include_usage` injection)
- `backend/app/api/anthropic_messages.py` — `_UPSTREAM_URLS`, `_detect_provider`, `_resolve_upstream_key`, `_proxy_stream_openai_compat`, lifted Claude coercion in `_route_messages_model`, anthropic-beta moved inside Claude branch, CancelledError ownership clarified, `UpstreamTransportError` exception class added (validator follow-up)

### WS-2 W3: `@nadir/router` npm installer

15 files at `getnadir.dev/install/npm/`:
- `package.json`, `vitest.config.js`, `README.md` (with `@nadir` org fallback note added per validator)
- `bin/cli.js` (TTY guard, --yes/--telemetry reminder, project-commit reminder)
- `src/args.js` (.replaceAll fix), `src/config.js` (homedir validation), `src/managed_block.js` (CRLF-safe regex + EOL preservation + hash normalize), `src/telemetry.js` (default OFF + fire-and-forget)
- `src/targets/codex.js`, `src/targets/opencode.js`, `src/targets/claude_code.js` (with env-key value-compare on uninstall)
- 7 test files: 53/53 passing, `npm publish --dry-run` clean (10.8 kB packed)

---

## Bug-catch totals

### Caught at architect → reviewer (8)

WS-2 W2 reviewer:
1. State machine misses 4 OpenAI delta patterns (delta.role-only, delta.refusal, delta.reasoning, null finish_reason)
2. `tool_result` multi-block mapping is wrong (would merge multiple tool results into one message)
3. Double terminal frame on cancel (`_wrapped_stream` + `translate` both emit)
4. `stream_options.include_usage` injection missing (usage permanently zero)

WS-2 W3 reviewer:
5. TOML regex breaks on CRLF files (`\n` strips `\r` as garbage)
6. Claude Code uninstall stomps user edits silently (no value compare)
7. API key prompt hangs on piped stdin (no TTY guard)
8. `os.homedir()` empty/`/` on headless Docker (no validation)

### Caught at execute → validate (5)

WS-2 W2 validator:
9. `_proxy_stream_openai_compat` returns silently on httpx errors → translator interprets as clean EOF → emits `stop_reason=end_turn` instead of `error`. Docstring lied. Patched: raise `UpstreamTransportError`.

WS-2 W3 validator:
10. `.replace("-", "_")` only replaces first occurrence — fragile for future multi-hyphen target names. Patched to `.replaceAll`.
11. No test for `assertHome()` failure path (test seam missing). Deferred to cycle 3.
12. No test for runtime TTY guard. Deferred to cycle 3.
13. `@nadir` org fallback not documented anywhere. Patched: added note to README.

### Deferred (5)

- `asyncio_mode = "auto"` config (cycle 1 retro item 14, still unfixed)
- Test seam for homedir validation
- `tests/cli.test.js` for TTY guard runtime
- WS-2.5 Gemini upstream + Google API key positive validation
- Backend `POST /v1/telemetry/install` endpoint

---

## Loop pattern observations

Cycle 1 vs cycle 2 patterns held:
- **Reviewer stage caught 4 blocking issues per blueprint** in both cycles (8 in cycle 2).
- **Validator stage caught 1-3 real issues per workstream** in both cycles (5 in cycle 2).
- Inline patches after validation: ~20-50 lines per cycle, no test regressions.

Cycle 2 surprise: the audit runner agent found a bug in our own production code mid-execution (lowercase-only key lookup missing `Question`/`Context`). The agent fixed it autonomously and re-ran. Pattern worth replicating: give execution agents license to fix obvious blockers as they hit them, then report the patch in their final message.

Three issues that the loop did NOT catch:
1. Test-coverage gaps (validator caught these by inspection, not by failing tests).
2. Documentation gaps (validators flagged the `@nadir` fallback as undocumented).
3. Environment dependencies (collection errors in local shell vs venv — same issue from cycle 1).

---

## Cycle 3 plan

### Priority 1 — WS-1 follow-ups (RouterArena submission)

Status: contamination audit PASS, so we can proceed.

- **Build `/v1/route_only` endpoint** in backend, backed by `wide_deep_asym_v3` (production classifier, NOT Gemini ranker). This is the W1 reviewer's blocking finding.
- **Build `eval/routerarena/nadir_adapter.py`** (NadirRouter implementing BaseRouter), config JSON, smoke script.
- **Train-set vs labeled-but-dropped overlap split** in audit report (read `v3/split.json`).
- **Confirm `trained_model.pkl` status** (live vs vestigial) — needed before submission report is final.
- **Anthropic-pricing PR step** for RouterArena's `model_cost.json`.
- **Founder + eng-lead sign-off** before any RouterArena PR.

### Priority 2 — WS-2 follow-ups

- **Fix W2 validator Issue 2** (async generator yield-in-finally robustness): document the FastAPI client-disconnect limitation in code comments. Low priority since fail-safe.
- **WS-2.5 Gemini**: native `/v1beta/models/:action` endpoint + Google upstream key (positive validation with `AIza` prefix), separate finish_reason mapping for `"SAFETY"`. ~1 week, separate workstream.
- **Streaming usage extraction polish**: verify the `message_delta` final usage emission actually pulls from OpenAI's last usage chunk and not the stub zeros.
- **Backend `POST /v1/telemetry/install` endpoint** for the npm installer.

### Priority 3 — WS-3 (npm) follow-ups

- **`@nadir` npm org verification** before publish (or commit to `nadir-router` fallback).
- **Add homedir test seam** + `tests/cli.test.js` for the two test-coverage gaps the validator flagged.
- **Day 5 manual smoke testing** on real Codex/opencode/Claude Code installations (user-side work, not agent).
- **`npm publish` itself** — public action, founder approval required.

### Priority 4 — Bandit DB wiring (WS-3 cycle 1)

- Apply both migrations (`routing_arms_table.sql`, `bandit_reward_log_table.sql`) to Supabase project `cxqmqnlouozrhsprtdcb`.
- Wire `BanditRouter.select/update/_load_arms/_save_arm` to Supabase async client with the FIXED upsert pattern.
- Per-worker LRU cache with `BANDIT_LRU_TTL_SECONDS` TTL.
- Cluster_id sourcing decision (semantic vs analyzer label).
- Linear high-spend suppression `p_cross_tier = max(0, 1 - spend_usd / 1000)` (NOT cliff).
- Cluster-id multi-worker coherence note in docstring.
- Shadow-mode integration into `production_completion.py` behind `BANDIT_ENABLED_DEFAULT` flag.

### Priority 5 — Housekeeping (carried from cycle 1)

- `asyncio_mode = "auto"` in pyproject.toml or conftest.py
- WS-1 explicit DistilBERT provenance note in audit report

### Deferred to Cycle 4+

- SWE-bench Verified compound-savings benchmark (Researcher C Artifact 2)
- Bandit canary → opt-in beta → default-on rollout phases
- Dashboard surface for arm stats + reset endpoint
- OCR confidence floor recalibration from production histogram
- `/compare/weaverouter` marketing page

---

## Loop verdict

Cycle 2 validates cycle 1's pattern:
- 5-stage loop (research/audit → architect → review → execute → validate) catches roughly **13 real bugs per cycle** (8 at reviewer, 5 at validator).
- Inline post-validator patches are cheap (~20-50 lines) and don't regress tests.
- Parallel workstreams compose cleanly when scope is genuinely disjoint (audit + W2 + W3).
- Audit verdict is unambiguous and the agent autonomously fixed a downloader bug mid-execution.

Net for the program: cycle 2 advanced WS-1 from "deferred until adapter is built" to "PASS, submission unblocked"; WS-2 from "W1 streaming only" to "full cross-format translation with all reviewer must-fixes"; W3 from "blueprint only" to "53-test npm package one verification away from publish."

Three cycles in (counting Session 1 as cycle 0): we're roughly halfway through the original 12-week plan in two compressed sessions of agent work. The loop should continue.
