# RouterArena Submission Package — Nadir

**Submitter**: Nadir Research (getnadir.dev)
**Date prepared**: 2026-05-26
**Router name**: `nadir`
**Router class**: `NadirRouter` (pre-generation tier classifier, wide_deep_asym_v3)
**Production classifier artifact**: `backend/app/complexity/models/wide_deep_asym_v3.pt`
**Eval-only endpoint**: `POST /v1/route_only` on `api.getnadir.com`
**Schema version**: 1 (fingerprinted in every response)

This is the cover document a RouterArena reviewer should read first. It
describes what we are submitting, what guarantees we make about the
decision path, where the evidence lives, and what state the submission is
in. Below the status checklist there is a list of gap items that are
**not** ready and what we need to do before we can credibly hit "submit."

---

## 1. What RouterArena grades, and what we expose

RouterArena (RouteWorks/RouterArena on HuggingFace) is a router-grading
benchmark, not an end-to-end response benchmark. The pipeline asks each
candidate router for a *model selection* per prompt; RouterArena then
costs the request at the pre-published `model_cost.json` rate for the
selected model and scores routing decisions (no response text is graded
on the leaderboard; correctness is implied by model choice + the
RouterBench-derived ground-truth response columns).

For that to be a faithful evaluation of Nadir, the endpoint we expose
**must**:

1. Run the production trained classifier (`wide_deep_asym_v3`), not a
   Gemini-backed `GeminiModelRecommender` or any fallback ranker.
2. Return a model name only — no LLM call, no Stripe write, no
   `usage_logs` row. (Otherwise the eval bill is $$$ and we leak
   benchmark prompts into production logs.)
3. Fingerprint the response schema so the adapter cannot silently drift
   from what RouterArena expects.

`POST /v1/route_only` (in `backend/app/api/route_only.py`) was built for
exactly this contract. It refuses to answer if (a) the caller has clusters
or expert-models configured, (b) the classifier path fell through to a
fallback, or (c) the model artifact is missing.

### Endpoint shape

```http
POST /v1/route_only
Content-Type: application/json
X-API-Key: <eval-only key with no clusters and no expert models>

{
  "messages": [{"role": "user", "content": "<prompt>"}],
  "model": null
}
```

Response:

```json
{
  "schema_fingerprint": "<sha256 of sorted response field names>",
  "tier": "simple" | "medium" | "complex",
  "model": "claude-haiku-4-5" | "claude-sonnet-4-6" | "claude-opus-4-6",
  "complexity_score": 0.0,
  "classifier_confidence": 0.0,
  "latency_ms": 0,
  "classifier_version": "wide_deep_asym_v3"
}
```

Response header:

```
x-nadir-classifier-sha: <sha256 of wide_deep_asym_v3.pt>
```

The adapter is required to assert (a) `schema_fingerprint` equals the
constant captured at adapter build time, and (b) `x-nadir-classifier-sha`
is constant for every response in a run. Either check failing aborts the
run rather than publishing a degraded leaderboard score.

---

## 2. What we are submitting to RouterArena's repo

A single PR with:

| File | Purpose |
| --- | --- |
| `router_inference/config/nadir.json` | Pipeline config (router name, class, models list) |
| `router_inference/nadir_adapter.py` | `NadirRouter(BaseRouter)` calling `/v1/route_only` |
| `model_cost/model_cost.json` diff | Adds Haiku-4.5, Sonnet-4.6, Opus-4.6 prices |
| (if needed) `universal_model_names.py` | Adds the three model names |

The adapter is a thin sync HTTP client over our existing endpoint. It
falls back to the mid-tier (`claude-sonnet-4-6`) on any error so a
leaderboard run completes deterministically rather than hanging or
raising.

PR description references the contamination audit, the smoke run, and
this `SUBMISSION_PACKAGE.md`.

---

## 3. Status checklist (audit of blueprint vs current state)

Source of truth for the plan: `competitor-profiles/blueprints/ws1-cycle3-routerarena-adapter.md`.

### Production endpoint (Day 1 of blueprint)

| Item | Status | Evidence |
| --- | --- | --- |
| `backend/app/api/route_only.py` exists, decision-only | DONE | `backend/app/api/route_only.py:185-313` |
| Calls `get_intelligent_model_recommendation_with_analysis` (not Gemini) | DONE | `route_only.py:246` |
| Schema fingerprint computed at module load | DONE | `route_only.py:104-113` |
| Classifier SHA computed lazily, exposed as response header | DONE | `route_only.py:133-161, 303` |
| MF1 precondition: refuses if caller has clusters or expert models | DONE | `route_only.py:204-233` |
| MF2 precondition: refuses if classifier fell through to fallback | DONE | `route_only.py:253-270` |
| Registered in `main.py` | DONE | `backend/app/main.py:34` import, `:307` `include_router` |
| Unit tests (`test_route_only.py`) | DONE (file present) | `backend/tests/test_route_only.py` (13,832 bytes). Re-run `pytest backend/tests/test_route_only.py -v` to confirm green before PR. |
| Integration tests against live backend | NOT VERIFIED | live smoke against deployed `api.getnadir.com` before PR open |

### Adapter package (Day 2 of blueprint)

| Item | Status | Notes |
| --- | --- | --- |
| `eval/routerarena/__init__.py` | MISSING | Not yet built. Day-2 task. |
| `eval/routerarena/nadir_adapter.py` (`NadirRouter`) | MISSING | Class shape specified in blueprint section 2. |
| `eval/routerarena/config/nadir.json` | MISSING | 4-line JSON. |
| `eval/routerarena/run_sub10.sh` | MISSING | Depends on reading RouterArena's `evaluate.py` CLI first. |
| `eval/routerarena/tests/test_nadir_adapter.py` (6 tests) | MISSING | |

### Contamination audit (Day 3 of blueprint)

| Item | Status | Evidence |
| --- | --- | --- |
| Audit script | DONE | `verifier/routerbench_contamination.py` |
| Audit report (DISJOINT, n=2632 labeled vs n=36481 RouterBench) | DONE | `verifier/reports/routerbench_contamination_20260524T122849.json` |
| Audit covers RouterBench (the verifier's eval source) | DONE | overlap_count = 0 |
| Audit covers **RouterArena** (the adapter's eval source) | **MISSING** | Cycle 1 reviewer required this. RouterArena and RouterBench are not the same dataset. |
| Train/labeled-but-dropped split distinction | **MISSING** | Blueprint section 4 lists this as a hard requirement. |
| `audit_runner.py` with split counts + exit code 2 for needs-review | MISSING | |

### Pricing diff (Day 4 of blueprint)

| Item | Status | Notes |
| --- | --- | --- |
| Anthropic pricing fetched and dated | NOT DONE | Day-4 task, fetch on submission day. |
| `model_cost.json` diff drafted | NOT DONE | Numbers in `MODEL_CARD.md` are placeholders from the blueprint and must be reverified against Anthropic's published page on the day. |
| `universal_model_names.py` reconciled | NOT DONE | Must verify our three model names exist in RouterArena's enum on the day. |

### Evidence + cover documentation

| Item | Status | Evidence |
| --- | --- | --- |
| Cover doc / submission package (this file) | DONE | `eval/routerarena/SUBMISSION_PACKAGE.md` |
| Model card | DONE | `eval/routerarena/MODEL_CARD.md` |
| Methodology paragraph | DONE | references `verifier/paper/draft.md` Section 3 |
| Held-out eval report | DONE | `verifier/reports/eval_20260526T184516.json` (n=11,420, AUROC 0.961) |
| Composed-router eval report | DONE | `verifier/reports/eval_composed_20260526T191001.json` |
| Reproduction recipe for our numbers | DONE | `benchmarks/routerbench/REPRODUCTION.md` |
| Smoke run on RouterArena sub_10 split | NOT DONE | Requires the adapter (above). Mid-2-day-build away. |
| SHA consistency check (first 5 responses) | NOT DONE | Smoke-time check, scripted in `run_sub10.sh`. |

### Operational preconditions (must be true on the submission day)

| Item | Status | Notes |
| --- | --- | --- |
| Dedicated eval API key in Supabase `api_keys` with no clusters and no expert models | NOT DONE | Founder action. |
| Eval key has elevated rate limit (`RATE_LIMIT_PER_MINUTE` >= 500) | NOT DONE | 60 RPM means a full sub run takes ~140 min. R2 in blueprint. |
| `wide_deep_asym_v3.pt` present in image, SHA stable | DONE | Computed lazily by endpoint; smoke verifies header constant. |

---

## 4. What is **not ready** for actual submission (be honest)

These are concrete blocks. Each must be resolved before the PR is opened.

### Block A — Adapter package does not exist

The blueprint's Day-2 deliverables (`eval/routerarena/nadir_adapter.py`,
`config/nadir.json`, `run_sub10.sh`, `tests/`) have not been written.
Without them there is no smoke run, and without a smoke run we cannot:

- prove the SHA header is constant across a 84-prompt sub_10 sweep
- prove tier distribution is not degenerate (e.g. 100% Sonnet)
- prove the schema fingerprint matches what the adapter expects

Estimated effort: 1 working day (matches blueprint's Day 2 plan).

### Block B — RouterArena-specific contamination audit is missing

We have a RouterBench overlap audit (0 overlapping prompts of 36,481).
We do **not** have an equivalent audit against the RouterArena prompt
set. Cycle 1 reviewer flagged this explicitly. The audit must:

- pull RouterArena (RouteWorks/RouterArena) sub_10 and full splits
- normalize-and-hash prompts (strip + collapse whitespace + casefold +
  SHA-256, matching `verifier/routerbench_contamination.py`)
- compare against every training corpus path enumerated in the
  contamination blueprint (`backend/labeled_data/v3/*`, `v2/*`, `raw/*`,
  plus Horizen training data if any remains)
- distinguish *train-set overlap* (HARD FAIL) from *labeled-but-dropped*
  (NEEDS-FOUNDER-REVIEW, exit 2)

Estimated effort: ~1 day (matches blueprint's Day 3 plan).

### Block C — Operational preconditions not provisioned

- Dedicated eval API key with elevated rate limit not yet created in
  Supabase. Without it, a full RouterArena run hits the 60-RPM ceiling
  and a sub-run takes >2 hours (R2 in blueprint).
- Anthropic pricing has not been refreshed for the day of submission;
  the `model_cost.json` diff must be regenerated against the live
  Anthropic page and the date noted in the PR description.

Estimated effort: <2 hours (founder action + a price-page check).

### Block D — Endpoint integration tests have not been re-run end to end

`backend/tests/test_route_only.py` exists and `main.py` registers the
router at line 307. The remaining check is a live-backend smoke against
the deployed `api.getnadir.com` (or a local backend with the production
classifier mounted) to confirm:

- `x-nadir-classifier-sha` returns a real 64-char hex value, not
  `"unavailable"`
- `schema_fingerprint` is stable across requests
- `classifier_version` reads `wide_deep_asym_v3`, not a fallback

Estimated effort: ~2 hours.

---

## 5. Verdict

We can credibly submit **next week**, not this week. The three remaining
work items (adapter, RouterArena contamination audit, eval key + price
diff) are well-scoped and total ~2.5 working days of focused effort.
None of them require new research; the IP and the eval are done.

Until those three items close, opening a RouterArena PR would skip the
contamination claim that Cycle 1 reviewer required, and would force the
adapter into existence under deadline pressure rather than under the
test plan in section 6 of the blueprint.

---

## 6. Files in this package

- `eval/routerarena/SUBMISSION_PACKAGE.md` (this file) — cover doc
- `eval/routerarena/MODEL_CARD.md` — model card for `nadir` router
- `benchmarks/routerbench/REPRODUCTION.md` — reproduction recipe for our
  cited numbers (AUROC 0.961, 60.3% cost reduction at 2.4% downgrade)
- `benchmarks/INVENTORY.md` — other public router leaderboards we might
  pursue and feasibility scoring

External evidence already in the tree (immutable, citable):

- `verifier/reports/eval_20260526T184516.json` (sha256
  `b85b7beedb7f7b7ae0f5574434c171bf2d0ac1c6c38ff0da2d401d1f1fccc7eb`) —
  held-out 11,420-triple eval, AUROC 0.961, ECE 0.016
- `verifier/reports/eval_composed_20260526T191001.json` (sha256
  `7669f6c7a15432f2663065315e4e90afe62700bb36d674e93d7685a342d50e23`) —
  composed router eval (cascade only vs composed_v2)
- `verifier/reports/routerbench_contamination_20260524T122849.json`
  (sha256
  `c3c7c2a8c00d448f337acc8fab3da503944b096fcf13d4332db46bb6fd79c0be`) —
  RouterBench overlap audit, DISJOINT
- `verifier/paper/draft.md` — paper draft (Sections 3, 5 are the
  methodology and results)
- `backend/app/api/route_only.py` — the production endpoint
- `competitor-profiles/blueprints/ws1-cycle3-routerarena-adapter.md` —
  original build blueprint
