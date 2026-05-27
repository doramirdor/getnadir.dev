# Cycle 1 Retro

**Date**: 2026-05-23
**Duration**: Single session, ~5 agent rounds (research → architect → review → execute → validate)
**Agents spawned**: 15 (3 researcher + 3 architect + 3 reviewer + 3 executor + 3 validator)

---

## What shipped

### Code (all reversible, no production deploys, no public actions)

**WS-1 Contamination audit module** (`eval/contamination_audit/`):
- `hasher.py` (NFC + casefold + SHA-256), `corpus_loader.py` (recursive glob + JSONL support), `arena_downloader.py` (mocked HF), `audit_runner.py` (CLI with non-zero exit on FAIL), README, 11 tests passing.

**WS-2 W1 Streaming + Claude passthrough** (`backend/app/api/anthropic_messages.py`):
- `_extract_routing_text` with `[tool call]` sentinel, `_proxy_stream_claude` async generator, `try/finally` analytics hook, `try/except (RemoteProtocolError, ReadTimeout, StreamError)` mid-stream terminal frame, `CancelledError` terminal frame, `StreamingResponse` wiring, tool/image/thinking block passthrough verbatim. 15 new streaming tests + 19 existing translator tests passing.

**WS-3 Bandit foundation** (`backend/app/services/bandit_router.py`, two SQL migrations, settings):
- `routing_arms` table with full `lambda_matrix float8[][]`, correct optimistic-upsert SQL pattern documented, `bandit_reward_log` dedup table, NIG math kernel (`nig_sample`, `nig_update` with closed-form conjugate beta update per Murphy 2007), `_compute_reward` matching COS formula, `BanditRouter` class with NotImplementedError stubs for DB methods, 6 settings entries. 6 tests passing.

### Documentation

- `competitor-profiles/weaverouter.md` — full competitor profile
- `competitor-profiles/_plan-beat-weaverouter.md` — 12-week program plan with execution log + layer ownership
- `competitor-profiles/_cycle1-synthesis.md` — three researchers' outputs synthesized into one program
- `competitor-profiles/blueprints/ws1-...md`, `ws2-...md`, `ws3-...md` — architect blueprints with reviewer must-fixes appended
- `competitor-profiles/_cycle1-retro.md` — this file

### Test totals

- 11 contamination audit tests (`eval/contamination_audit/tests/`)
- 19 translator tests (`backend/tests/test_anthropic_translate.py`)
- 15 streaming tests (`backend/tests/test_anthropic_messages_stream.py`)
- 6 bandit tests (`backend/tests/test_bandit_router.py`)
- **51 total tests, all passing.**

---

## What the loop caught that we would have shipped otherwise

The five-stage loop (research → architect → review → execute → validate) caught real bugs at every stage:

### Caught in the architect→reviewer stage (before any code written)

1. **WS-1 adapter wraps wrong endpoint.** `/v1/custom_recommendation` is a Gemini-backed ranker, not the trained `wide_deep_asym_v3` classifier. A submission would have been material misrepresentation. Caught by code-reviewer before any RouterArena PR.
2. **WS-1 hash NFC normalization missing.** NFD vs NFC accented characters produce different hashes → false-negative contamination on real overlap.
3. **WS-2 routing-before-translation order causes `HTTPException(400)` in tool-only bodies.** Without the `[tool call]` sentinel, every tool-only Claude Code request would have 400'd mid-stream.
4. **WS-2 analytics gap.** Streaming requests would have been completely invisible to billing + savings pipeline.
5. **WS-3 SQL upsert is silently broken.** `WHERE n_obs = excluded.n_obs - 1` resolves to `excluded.n_obs - 1 = excluded.n_obs - 1` (always true). Conflict detection would never have fired in production.
6. **WS-3 NIG defense is wrong reasoning.** Quality is binary 0/1 in OCR, not continuous. The reviewer rewrote the rationale (Bayesian linear regression / Gaussian likelihood / context-dependence).
7. **WS-3 ThompsonSamplingBandit is memory-only.** "Import not reimplement" claim was misleading — would have caused 4-worker posterior divergence at 25% of expected sample size without explicit acknowledgement.
8. **WS-3 diagonal Lambda discards rank-1 outer product mass** during the highest-information phase. Mathematically unsound during exploration.

### Caught in the execute→validate stage

9. **WS-1 `.jsonl` files silently dropped** because glob was `*.json` only. Horizen training corpus invisible to audit → risk of false-PASS. Patched.
10. **WS-1 `_is_blocked` checks absolute path parts.** Would have false-blocked any repo cloned under a directory named `cache` or `results`. Patched.
11. **WS-2 `CancelledError` re-raises without terminal SSE frame.** Survivable in W1 but becomes SDK-hang the moment W2's tool-call accumulator lands. Patched preemptively.
12. **WS-3 COS weight mismatch** (`0.2 / 0.3` vs blueprint's `0.25 / 0.25`). Silent correctness drift; tests masked it because `w_l + w_c = 0.5` either way. Patched.

### Caught but deferred (cycle 2 starting state)

13. **WS-1 train-set vs labeled-but-dropped overlap split** in report. Requires reading `v3/split.json` to distinguish prompts in the final training corpus from prompts that were labeled but dropped from the split. Defer to cycle 2 with clear acceptance criteria.
14. **WS-2 `asyncio_mode = "auto"` config** absent. Future async tests added without `@pytest.mark.asyncio` would silently not run. Cycle 2 hygiene.
15. **WS-3 high-spend cliff vs linear gradient.** Currently a setting with no logic wired. Cycle 2 must implement `p_cross_tier = max(0, 1 - spend_usd / 1000)` when the DB methods get implemented.
16. **WS-3 cluster-id multi-worker coherence note** missing from docstring. Cycle 2 doc nit.

---

## Loop metrics

- **Bugs caught per stage**: 8 at architect→reviewer, 4 at execute→validate, 4 deferred to cycle 2.
- **Of the 8 caught at reviewer stage, all 8 would have shipped to production without the review.** Two of them (wrong endpoint, broken SQL upsert) would have caused immediate production incidents the day they were rolled out.
- **Of the 4 caught at validate stage, all 4 are real (not nitpicks).** The `.jsonl` glob miss in particular would have produced a false-PASS contamination verdict — the single worst possible outcome for the audit.
- **Patch effort after validation**: ~20 lines of code across 3 files, 0 new test failures, 51/51 tests passing after patches.

---

## What the loop did NOT catch

- **Performance**: no agent profiled the streaming path or measured the bandit's per-request overhead. Validation agents read code, didn't run load tests.
- **Production wiring**: WS-3 bandit `select/update/_load_arms/_save_arm` are NotImplementedError stubs. Cycle 2 work. Reviewers correctly scoped this out.
- **Real-world data**: contamination audit hasn't actually been run against the real RouterArena dataset and our real training corpus. The Day-1 gate (sub_10 verdict) is ready to run but requires `pip install datasets huggingface_hub` and a real download. That's a Cycle 2 first-task.
- **Adapter**: `eval/routerarena/` (the actual RouterArena BaseRouter implementation) was deliberately deferred because of the wrong-endpoint finding. Cycle 2 must build the `/v1/route_only` endpoint or equivalent first.

---

## Cycle 2 plan

### Priority 1 — Run the contamination audit for real

- `pip install datasets huggingface_hub` in eval venv
- Run `python -m eval.contamination_audit.audit_runner --split sub_10` against real training corpus
- **If FAIL**: stop, plan retrain. **If PASS**: run `--split full`, commit report as permanent evidence.
- Owner: classifier-pipeline owner + founder review

### Priority 2 — WS-1 follow-ups + adapter

- Implement train-set vs labeled-but-dropped overlap split in `run_audit()` (must read `v3/split.json`)
- Build `/v1/route_only` endpoint backed by `wide_deep_asym_v3` (production classifier, NOT Gemini)
- Build `eval/routerarena/nadir_adapter.py` (NadirRouter, BaseRouter implementation)
- Update RouterArena `model_cost.json` per format mirror step

### Priority 3 — WS-2 W2 cross-format translator

- New `backend/app/services/anthropic_sse_translate.py` state machine
- 7 test sequences (text-only, single-tool, mixed-text-then-tool, finish=length, mid-stream-die, two-sequential-tools, empty-delta)
- Lift non-Claude coercion in `_route_messages_model`
- Strip `thinking`, `cache_control`, `betas` for non-Claude path
- Add `asyncio_mode = "auto"` to pytest config

### Priority 4 — WS-2 W3 npm installer

- `getnadir.dev/install/npm/` package (Codex first per Researcher B sequencing)
- Single `__nadir_config__` JSON key (NOT paired sentinels)
- TOML regex with `^` anchor for codex.config.toml
- Telemetry default **opt-out**
- Vitest tests for managed-block idempotency

### Priority 5 — WS-3 DB wiring

- Apply both migrations to Supabase project `cxqmqnlouozrhsprtdcb`
- Wire `BanditRouter.select / update / _load_arms / _save_arm` to Supabase async client
- LRU cache with `BANDIT_LRU_TTL_SECONDS` TTL
- Cluster_id sourcing decision (semantic vs analyzer label)
- Linear high-spend suppression: `p_cross_tier = max(0, 1 - spend_usd / 1000)` (NOT cliff)
- Cluster-id multi-worker coherence note in docstring
- Shadow-mode integration into `production_completion.py`

### Deferred to Cycle 3+

- SWE-bench Verified compound-savings benchmark (Researcher C Artifact 2)
- Bandit canary → opt-in beta → default-on rollout phases
- Dashboard surface for arm stats + reset endpoint
- OCR confidence floor recalibration from production histogram

---

## Loop effectiveness verdict

The five-stage loop worked. Two specific patterns proved their worth:

1. **Researcher → architect handoff with locked decisions**: the synthesis doc made it explicit what was locked vs open, so architects didn't relitigate.
2. **Reviewer-before-executor checkpoint**: the 8 bugs caught at this stage were all bugs that would have shipped via "trust but verify" approaches. The cost of the extra review pass was ~3 minutes of agent time; the cost of any one of those bugs in production would have been days.

Friction points:
- Three workstreams competing for the same critical-path attention sometimes produced overlapping context — particularly for the synthesis step.
- Validation agents found that some test assertions could pass for the wrong reason (WS-3 COS weights masked by symmetric weight pairs). Future cycles should ask reviewers to write at least one assertion that distinguishes "right answer for right reason" from "right answer for any answer."

Net: the loop should run again. Cycle 2 starts.
