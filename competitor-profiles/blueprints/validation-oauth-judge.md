# Validation Harness Blueprint — OAuth-Judge Labeling Pipeline

**Version**: 1.0
**Date**: 2026-05-24
**Status**: Blueprint only. NO real OAuth calls until founder explicit approval.
**Parent**: [ip-1-verifier-gated-cascade.md](ip-1-verifier-gated-cascade.md) Section 2

---

## Patterns and conventions found

- **OAuth credential resolution**: `NadirClaw/nadirclaw/credentials.py:398` `get_credential("anthropic")` chains OpenClaw auth-profiles (auto-refresh), legacy, NadirClaw stored (with `_maybe_refresh_oauth` at line 337), then env `ANTHROPIC_API_KEY`. Injectable into the harness as `credential_fn` parameter.
- **Bearer vs x-api-key**: `NadirClaw/nadirclaw/claude_integration.py:116-130`. Subscription tokens (`sk-ant-oat*`) use `Authorization: Bearer`. API keys use `x-api-key`. Apply same logic.
- **Upstream URL + version**: `backend/app/api/anthropic_messages.py:53-55`. `https://api.anthropic.com/v1/messages`, `anthropic-version: 2023-06-01`.
- **httpx already in backend requirements**.
- **Schema conflict**: IP-1's `verifier_training_corpus` DDL has `label smallint NOT NULL CHECK (label IN (0,1))`. Inserting unlabeled triples needs a small migration to make `label` nullable.

---

## Architecture decision

Standalone Python package at `verifier/`, CLI script not endpoint. Matches `corpus_builder.py` / `train.py` pattern from IP-1.

OAuth client is injectable: `OAuthJudgeClient(credential_fn, transport_fn)`. Production calls `lambda: get_credential("anthropic")`. Tests pass lambdas returning canned tokens + canned `httpx.Response` objects. No `mock.patch` needed.

---

## Schema amendment (prerequisite migration)

`backend/migrations/verifier_training_corpus_nullable_label.sql`:
```sql
ALTER TABLE verifier_training_corpus ALTER COLUMN label DROP NOT NULL;
ALTER TABLE verifier_training_corpus
  DROP CONSTRAINT IF EXISTS verifier_training_corpus_label_check;
ALTER TABLE verifier_training_corpus
  ADD CONSTRAINT verifier_training_corpus_label_check
  CHECK (label IS NULL OR label IN (0, 1));
CREATE INDEX IF NOT EXISTS vtc_pending_idx
  ON verifier_training_corpus (label_source, label)
  WHERE label IS NULL;
```

Founder applies via Supabase MCP. Reversible (label was always 0 or 1 before, NULL is additive).

---

## Judge prompt template

`verifier/judge_prompt_template.txt`. Asks: given (prompt, cheap, expensive), is the cheaper response acceptable or does the expensive meaningfully improve? 3 few-shot examples (clearly acceptable, clearly unacceptable, borderline). Strict output: `{"acceptable": true|false, "confidence": 0.0-1.0, "rationale": "..."}` on a single line.

---

## Component design

### `verifier/oauth_judge.py`

```python
@dataclass
class JudgeResult:
    label: Optional[int]          # 0 or 1; None on error
    confidence: float
    rationale: str
    raw_response: str
    error: Optional[str]
    pending_review: bool          # True when JSON parse fails

class OAuthJudgeClient:
    def __init__(self,
        credential_fn: Callable[[], Optional[str]] = None,
        transport_fn: Callable = None,
        judge_model: str = "claude-sonnet-4-5",
        max_calls: int = 50,
        call_interval_s: float = 5.0,
        prompt_template_path: str = None,
    ): ...

    async def judge_triple(self, prompt, cheap, expensive) -> JudgeResult: ...
```

- Rate limit: `_call_count >= max_calls` → return `error="rate_limit_exceeded"` without HTTP.
- Per-call delay: `await asyncio.sleep(call_interval_s)` between calls; injectable `sleep_fn` for tests.
- Auth header: `sk-ant-oat*` → `Authorization: Bearer`. Otherwise `x-api-key`. Always include `anthropic-version: 2023-06-01`.
- 401/403 → `error="auth_failure: {code}"`, do NOT raise.
- JSON parse guard: if missing `acceptable` key or confidence not in [0,1] → `pending_review=True`, `error="malformed_json"`.
- `acceptable=true` → `label=1`; `acceptable=false` → `label=0`.

### `verifier/validation_runner.py`

```python
async def run_validation_slice(
    n: int = 50,
    judge_client: OAuthJudgeClient = None,
    supabase_client = None,
    report_dir: str = "verifier/reports",
    seed_triple_ids: list[str] = None,
) -> dict: ...

def check_calibration(judged_results, seed_triples) -> dict: ...
```

- `n > 100` raises `ValueError` synchronously before any I/O.
- Query: `verifier_training_corpus WHERE label IS NULL AND label_source='pending_oauth_judge' ORDER BY created_at LIMIT n`.
- Per-result upsert (not batch): label, label_source='oauth_judge', label_confidence.
- Kill switch: 3 consecutive errors → write partial report, exit 1.
- **`FOUNDER_APPROVED=1` env guard at function entry** (per architect's question 1, answered: hard gate via RuntimeError is correct). Bypassed when `supabase_client` is explicitly passed (test mode).

Report shape:
```json
{
  "run_at": "ISO timestamp",
  "n_requested": 50,
  "n_judged": 47,
  "n_errors": 3,
  "label_distribution": {"0": 18, "1": 29},
  "avg_confidence": 0.84,
  "wall_time_seconds": 310,
  "estimated_full_batch_seconds": 62000,
  "calibration": {"agreed": 4, "total": 4, "calibration_concern": false},
  "abort_reason": null,
  "random_examples": [{"id", "prompt", "cheap_answer", "expensive_answer", "label", "rationale"}]
}
```

### Calibration

Compare OAuth-judge labels to human-labeled seed via `verifier/seed_labels.json`. Per architect's question 2 (answered): **borderline triple 5 with `human_label=null` is recorded as observation-only in the report and excluded from agreement scoring**. Only score the 4 clear-cut triples. If agreement < 4/4 → `calibration_concern: true`.

### `verifier/seed_validation_triples.py`

Inserts 5 hand-crafted triples (`label=NULL`, `label_source='pending_oauth_judge'`). Writes `verifier/seed_labels.json` mapping `{row_id: expected_label}` where expected is 1, 0, 0, 1, null for triples 1-5 respectively.

5 triples:
1. "What is 2+2?" / Cheap: "4" / Expensive: "4, and here's why..." → expected 1 (acceptable)
2. "What year did WW2 end?" / Cheap: "1944" / Expensive: "1945" → expected 0 (factual error)
3. Simple code task / Cheap: off-by-one bug / Expensive: correct → expected 0 (unacceptable)
4. "Summarize paragraph in one sentence" / Two reasonable summaries → expected 1 (acceptable)
5. Borderline: incomplete but not wrong → expected null (uncertain, observation-only)

---

## Implementation map

**Create**:
| File | Purpose |
|---|---|
| `verifier/oauth_judge.py` | `OAuthJudgeClient` + `JudgeResult` |
| `verifier/validation_runner.py` | `run_validation_slice` + `check_calibration` + report writer |
| `verifier/seed_validation_triples.py` | 5 triples + `seed_labels.json` |
| `verifier/judge_prompt_template.txt` | Exact prompt text |
| `verifier/requirements.txt` | `httpx>=0.27`, `supabase>=2.0`, `nadirclaw>=0.13.0` (optional) |
| `backend/migrations/verifier_training_corpus_nullable_label.sql` | Schema amendment |
| `backend/tests/test_oauth_judge.py` | 8 tests, all mocked |
| `backend/tests/test_validation_runner.py` | 4 tests |

**Modify**:
| File | Change |
|---|---|
| `verifier/README.md` | Add "Running the validation slice" section + founder-approval-gate warning |
| `backend/app/services/routing_quality_tracker.py:18` | Env-gated widen: `OVERRIDE_WINDOW_SECONDS = int(os.getenv("CORPUS_OVERRIDE_WINDOW", "60"))` (default unchanged at 60s; pipeline sets to 300s via env) |

---

## Test plan (12 tests, all mocked)

### `test_oauth_judge.py` (8 tests)
1. `test_judge_acceptable_true`: mocked transport returns acceptable=true → label=1
2. `test_judge_acceptable_false`: → label=0
3. `test_judge_malformed_json`: bad response → label=None, pending_review=True
4. `test_cap_enforced`: 6th call after max_calls=5 → error="rate_limit_exceeded", no HTTP
5. `test_per_call_delay_enforced`: 3 calls → sleep_fn called 3 times with configured interval
6. `test_auth_failure_returns_error_not_exception`: 401 → error="auth_failure: 401", no exception
7. `test_bearer_token_for_oauth`: token starting `sk-ant-oat` → header `Authorization: Bearer ...`
8. `test_x_api_key_for_api_token`: token starting `sk-ant-api` → header `x-api-key: ...`

### `test_validation_runner.py` (4 tests)
9. `test_n_cap_validation_runner`: `n=200` raises `ValueError` synchronously
10. `test_report_has_required_fields`: 5 mocked triples + mocked judge → report has all required keys
11. `test_idempotency_no_double_label`: query returns empty → n_judged=0, no writes
12. `test_kill_switch_3_consecutive_failures`: 3 errors in a row → abort_reason set, exit code 1
13. `test_calibration_concern_flagged`: judge agrees on 3/4 (excluding borderline) → `calibration_concern=True`

(Architect's question 3 answered: use `transport_fn` injection, NOT `mock.patch`. Cleaner, no import-order fragility.)

---

## Risk register

| Risk | Mitigation |
|---|---|
| OAuth token expires mid-batch | `get_credential` auto-refreshes; if refresh fails → `error="auth_failure: no_credential"`; kill switch catches |
| Rate limit during validation | 429 surfaces as `JudgeResult.error`; kill switch at 3 consecutive |
| Judge output format drift | Strict JSON parse, missing/extra fields → `pending_review=True` |
| Validation slice biased toward complex prompts | Noted in report `bias_warning`; not fixed in v0 |
| Anthropic TOS interpretation grey | `FOUNDER_APPROVED=1` env gate; README startup banner; clear founder-approval gate in IP-1 |

---

## Build sequence

**Day 1 (executor implementation, mocked only — NO real OAuth calls)**:
- Apply schema migration via Supabase MCP
- Create `judge_prompt_template.txt`
- Create `oauth_judge.py` + 8 mocked tests
- Create `validation_runner.py` + 4 mocked tests
- Create `seed_validation_triples.py` + `seed_labels.json` writer
- Create `requirements.txt`
- Modify `verifier/README.md` with operational section
- All tests pass; NO real calls made

**Day 2 (post-implementation, FOUNDER APPROVAL REQUIRED)**:
- Founder confirms Anthropic TOS allows this usage
- Apply schema migration to Supabase
- Run seed script
- Run validation slice with `FOUNDER_APPROVED=1 N=50`
- Read report
- If calibration good → plan full batch; if not → refine prompt template, re-run slice

---

## Open questions answered (architect's questions)

1. **`FOUNDER_APPROVED` gate**: hard RuntimeError. Fail-loud is correct; the cost is operator awareness, not OAuth dollars.
2. **Borderline triple 5**: observation-only. Score calibration on the 4 clear triples (4/4 = pass). Triple 5's label is recorded for human review but not gating.
3. **`transport_fn` injection**: yes, per architect's recommendation. Cleaner than `mock.patch`, no import-order issues.

---

## Critical details

- `credential_fn` defaults to `lambda: get_credential("anthropic")` via deferred import (NadirClaw is optional dependency in test environment).
- `supabase_client` injectable; tests pass mock without needing `SUPABASE_URL` env.
- Thread safety: single-threaded async runner; no shared state across tasks.
- Report path collision: timestamp includes microseconds.
- Kill switch state lives on the runner instance, not the client; reset on each `run_validation_slice` call.
