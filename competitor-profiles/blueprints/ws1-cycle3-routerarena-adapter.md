# WS-1 Cycle 3 Blueprint — Production-Classifier-Backed RouterArena Adapter

**Date**: 2026-05-23
**Cycle**: 3, WS-1
**Status**: Draft, awaiting reviewer pass
**Prerequisite**: Cycle 2 contamination audit PASS committed at `eval/contamination_audit/reports/`

---

## 0. The blocking finding from cycle 1

Cycle 1 reviewer caught: original `nadir_adapter.py` wrapped `/v1/custom_recommendation` (in `recommendation.py:29`), which instantiates `GeminiModelRecommender.ranker()`. That endpoint is Gemini-backed, not the trained `wide_deep_asym_v3` classifier. Submission via that path would have been material misrepresentation.

Production classifier path: `get_intelligent_model_recommendation_with_analysis` in `backend/app/api/production_completion.py:482-725`. When `COMPLEXITY_ANALYZER_TYPE=wide_deep_asym` (or `trained`), it routes through `WideDeepAsymAnalyzer` (`wide_deep_asym_v3.pt`, `ANALYZER_VERSION="wide_deep_asym_v3"`). Fix: thin decision-only endpoint that calls this function with no downstream LLM call.

---

## 1. `/v1/route_only` endpoint design

**File**: `backend/app/api/route_only.py` (new). One-line registration in `main.py`.

### Schema (SCHEMA_VERSION = 1)

Request:
```
{ "messages": [{"role":str, "content":str}], "model": str | null }
```

Response:
```
{
  "schema_version": 1,
  "tier": "simple"|"medium"|"complex",
  "model": str,
  "complexity_score": float,
  "classifier_confidence": float,
  "latency_ms": int,
  "classifier_version": str
}
```

Header: `x-nadir-classifier-sha: <sha256 of wide_deep_asym_v3.pt>`.

### Calling convention

Synthetic user config to force smart-routing:
```python
user_config = {
    "selected_models": ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
    "sort_strategy": "smart-routing",
    "load_balancing_policy": "round-robin",
    "use_fallback": False,
    "model_parameters": {},
    "layers": {"routing": True, "fallback": False, "optimize": "off"},
}
```

Extract from `complexity_analysis`:
- `tier` ← `extracted_metrics.tier` mapped via `{1:"simple", 2:"medium", 3:"complex"}`
- `classifier_version` ← prefer `WideDeepAsymAnalyzer.ANALYZER_VERSION` constant import; fall back to `selection_method`
- `latency_ms` ← `analyzer_latency_ms` if present, else wall-clock

MUST NOT call any LLM. Endpoint terminates after the classifier returns.

### Auth + rate limit

Mirror `models.py:39` pattern: `Depends(get_current_user)` + `Depends(check_rate_limit)`. `get_current_user` delegates to `validate_api_key`.

### Classifier SHA at module load

Compute once via `hashlib.sha256(open(_MODEL_PATH, "rb").read())`. Cache as `_CLASSIFIER_SHA`. On missing file (dev env without `wide_deep_asym_v3.pt`): set `"unavailable"`, log warning, do not crash.

### Schema drift protection

```python
_ROUTE_ONLY_SCHEMA_VERSION = 1
```
Every response includes this. The adapter asserts equality at startup and warns loudly on mismatch.

---

## 2. RouterArena `NadirRouter` adapter

### Files

- `eval/routerarena/__init__.py`
- `eval/routerarena/nadir_adapter.py` — `NadirRouter(BaseRouter)`
- `eval/routerarena/config/nadir.json` — pipeline config
- `eval/routerarena/run_sub10.sh` — smoke script
- `eval/routerarena/tests/test_nadir_adapter.py` — 6 adapter tests

### Class

```python
class NadirRouter(BaseRouter):
    EXPECTED_SCHEMA_VERSION = 1

    def __init__(self, config_path):
        super().__init__(config_path)
        self._base_url = os.environ["NADIR_API_URL"]
        self._api_key  = os.environ["NADIR_API_KEY"]
        self._client   = httpx.Client(timeout=10.0)
        self._tier_map = {
            "simple":  "claude-haiku-4-5",
            "medium":  "claude-sonnet-4-6",
            "complex": "claude-opus-4-6",
        }

    def _get_prediction(self, query):
        try:
            resp = self._client.post(
                f"{self._base_url}/v1/route_only",
                headers={"X-API-Key": self._api_key},
                json={"messages": [{"role": "user", "content": query}]},
            )
            resp.raise_for_status()
            body = resp.json()
            if body.get("schema_version") != self.EXPECTED_SCHEMA_VERSION:
                print(f"[NadirRouter] schema mismatch: got {body.get('schema_version')}", file=sys.stderr)
            return self._tier_map.get(body["tier"], self._tier_map["medium"])
        except Exception as exc:
            print(f"[NadirRouter] error, falling back to mid-tier: {exc}", file=sys.stderr)
            return self._tier_map["medium"]
```

Key decisions:
- Sync `httpx.Client` (RouterArena's `BaseRouter._get_prediction` is sync)
- Fall back to mid-tier on any exception. Never raise. The leaderboard run must complete.
- `EXPECTED_SCHEMA_VERSION` as class attribute, not literal — catches drift loudly
- `timeout=10s` generous for a ~50ms classifier but prevents indefinite hang

### `config/nadir.json`

```json
{
  "pipeline_params": {
    "router_name": "nadir",
    "router_cls_name": "NadirRouter",
    "models": ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"]
  }
}
```

Day-4 pre-submission check: confirm these names exist in RouterArena's `universal_model_names.py`. If not, adjust both the `models` list and `_tier_map` together.

### Smoke script

`run_sub10.sh` runs the sub_10 split (84 prompts), output to `eval/routerarena/reports/smoke_sub10_<date>.json`. Exact CLI flags depend on RouterArena's `router_arena/evaluate.py` — read on Day 2 and adjust.

---

## 3. Pricing diff for `model_cost.json`

RouterArena schema:
```json
"<model>": {
  "input_token_price_per_million": <float>,
  "output_token_price_per_million": <float>
}
```

Diff to add (verify against live Anthropic pricing on submission day):
```json
"claude-haiku-4-5":  { "input_token_price_per_million":  0.80, "output_token_price_per_million":  4.00 },
"claude-sonnet-4-6": { "input_token_price_per_million":  3.00, "output_token_price_per_million": 15.00 },
"claude-opus-4-6":   { "input_token_price_per_million": 15.00, "output_token_price_per_million": 75.00 }
```

Notes:
- RouterArena has no cache-read field. Our `_CACHE_READ_MULTIPLIER` is Nadir-internal; do NOT include here.
- PR description must cite the Anthropic pricing URL and the date checked.
- If RouterArena uses a different schema (blended per-token), mirror their convention exactly.
- This is a separate PR to the RouterArena repo. Must not merge before the main adapter PR is founder-reviewed.

---

## 4. Train-set vs labeled-but-dropped split

Cycle 2 audit reported one `overlap_count`. Cycle 1 reviewer required distinguishing:
- Prompts in the final v3 training split (`split.json` "train") → hard FAIL
- Prompts labeled but dropped from the split → NEEDS_FOUNDER_REVIEW

### Modification to `audit_runner.py`

Add fields:
```python
{
  "train_set_overlap_count": int,
  "labeled_but_dropped_overlap_count": int,
  "split_file_found": bool,
}
```

Verdict logic (additive):
- `train_set_overlap_count > 0` → FAIL (exit 1)
- `labeled_but_dropped_overlap_count > 0` AND train=0 → NEEDS_FOUNDER_REVIEW (exit 2, new)
- Both zero → PASS (unchanged)

If `split.json` absent: conservative fallback — treat all labeled as training, `train_set_overlap_count = overlap_count`, `labeled_but_dropped_overlap_count = 0`, `split_file_found = False`. Never under-counts training overlap.

---

## 5. Submission package

### Files for the RouterArena PR
1. `router_inference/config/nadir.json`
2. `router_inference/nadir_adapter.py`
3. `model_cost/model_cost.json` diff (3 entries)
4. `universal_model_names.py` additions if needed

### Evidence committed to this repo, referenced in PR description
1. `eval/contamination_audit/reports/audit_sub_10_<date>.json`
2. `eval/contamination_audit/reports/audit_full_<date>.json`
3. `eval/routerarena/reports/smoke_sub10_<date>.json`
4. Updated audit report with split counts

### Sign-off gate (PR NOT opened until both pass)

Founder + eng-lead review:
1. Contamination audit reports (no train-set overlap)
2. `route_only.py` (calls production classifier, NOT Gemini ranker)
3. Pricing diff (matches current Anthropic published rates)
4. Smoke run output (tier distribution not degenerate — not 100% one tier)

**RouterArena PR is OUT OF SCOPE for autonomous execution.** Executor stops at Day 4 with the package assembled.

---

## 6. Test plan

### `backend/tests/test_route_only.py` (8 unit tests, mocked)
| Test | Verifies |
|---|---|
| `test_schema_version_in_response` | `schema_version: 1` always present |
| `test_tier_simple_returns_haiku` | tier=1 → `claude-haiku-4-5` |
| `test_tier_medium_returns_sonnet` | tier=2 → `claude-sonnet-4-6` |
| `test_tier_complex_returns_opus` | tier=3 → `claude-opus-4-6` |
| `test_no_llm_call` | Patch `litellm.completion` to raise; request still succeeds |
| `test_classifier_sha_header` | Response header `x-nadir-classifier-sha` present |
| `test_missing_user_messages_400` | Empty messages → 400 |
| `test_analyzer_timeout_returns_mid_tier` | TimeoutError → response still succeeds with valid tier |

Mock strategy: patch `get_intelligent_model_recommendation_with_analysis` directly, not internal analyzer.

### `backend/tests/test_route_only_integration.py` (2 tests, `@pytest.mark.integration`)
- `test_classifier_version_in_response` — live call returns `"wide_deep_asym_v3"`
- `test_latency_under_200ms` — confirms no upstream LLM call

### `eval/routerarena/tests/test_nadir_adapter.py` (6 tests)
- simple/medium/complex → correct model
- HTTPStatusError → mid-tier fallback (no raise)
- ConnectError → mid-tier fallback (no raise)
- schema_version mismatch → logs to stderr, still returns valid model

### `eval/contamination_audit/tests/test_audit_split.py` (4 tests, synthetic fixtures)
- 1 train overlap → FAIL, exit 1
- 1 labeled-but-dropped overlap, 0 train → NEEDS_FOUNDER_REVIEW, exit 2
- Both zero → PASS
- Missing split.json → `split_file_found=False`, train count = total overlap (conservative)

---

## 7. Risk register

**R1: Classifier confidence below useful threshold mid-run**
λ=20 decoding is already conservative (prefer upgrades). Do NOT change routing on low confidence. Log warning at `confidence < 0.4` for monitoring only.

**R2: Rate-limiting during 8,400-prompt sub run**
Current limit: 60 RPM. Full run at 60 RPM = 140 minutes. Solutions: (a) dedicated eval key with `RATE_LIMIT_PER_MINUTE=500` set in Supabase `api_keys` (founder action), or (b) throttle in `run_sub10.sh`. Prefer (a). `/v1/route_only` is cheap (no `usage_logs` writes) but rate limiter doesn't distinguish.

**R3: Cost map disagreement**
Nadir uses LiteLLM `model_cost` (may lag). RouterArena cost map is source of truth for leaderboard. Day-4 check: verify pricing diff matches current Anthropic page, not LiteLLM.

**R4: Artifact rotation mid-evaluation**
SHA computed at module load. The adapter logs first SHA and asserts constant across run. Smoke script: capture SHA from first 5 responses, assert identical, abort if not. Production rotation requires server restart so practical risk low.

---

## 8. Build sequence (4 days)

### Day 1 — Endpoint + unit tests
- [ ] `backend/app/api/route_only.py` with Pydantic models + handler
- [ ] Import `get_intelligent_model_recommendation_with_analysis` from `production_completion`
- [ ] SHA computation at module load, exposed in `x-nadir-classifier-sha` header
- [ ] Register in `main.py` after `anthropic_messages_router`
- [ ] `backend/tests/test_route_only.py` (8 tests, all mocked)
- [ ] `pytest backend/tests/test_route_only.py` → 8 pass
- [ ] Manual smoke: `curl -X POST http://localhost:8000/v1/route_only -H "X-API-Key: $K" -d '{"messages":[{"role":"user","content":"hello"}]}'`

### Day 2 — Adapter + smoke
- [ ] Create eval/routerarena/ package
- [ ] `NadirRouter` with `EXPECTED_SCHEMA_VERSION = 1`
- [ ] `config/nadir.json`
- [ ] `run_sub10.sh` — read RouterArena CLI first, adjust flags
- [ ] `tests/test_nadir_adapter.py` (6 tests)
- [ ] Smoke against local backend; verify tier distribution roughly 40-50% simple, 30-40% medium, 15-25% complex
- [ ] Verify SHA header consistency across 10 requests

### Day 3 — Train-set split in audit
- [ ] Confirm `backend/labeled_data/v3/split.json` exists, read schema
- [ ] Modify `audit_runner.py`: add split counts, exit code 2
- [ ] `tests/test_audit_split.py` (4 tests)
- [ ] Existing 11 + new 4 = 15 passing
- [ ] Re-run full audit; commit updated report

### Day 4 — Pricing + package. STOP before PR.
- [ ] Fetch current Anthropic pricing, note date
- [ ] Write pricing diff JSON; verify model names against `universal_model_names.py`
- [ ] Run integration tests against live backend
- [ ] Assemble submission package README (evidence files, eval-key rate-limit, SHA check)
- [ ] DO NOT open RouterArena PR. Tag: `ws1-submission-candidate-<date>`
- [ ] Send package to founder + eng-lead

---

## Relevant files

Backend (create):
- `backend/app/api/route_only.py`
- `backend/tests/test_route_only.py`
- `backend/tests/test_route_only_integration.py`

Backend (modify):
- `backend/app/main.py` (add router import + `include_router`)

Eval (create):
- `eval/routerarena/__init__.py`
- `eval/routerarena/nadir_adapter.py`
- `eval/routerarena/config/nadir.json`
- `eval/routerarena/run_sub10.sh`
- `eval/routerarena/tests/test_nadir_adapter.py`
- `eval/contamination_audit/tests/test_audit_split.py`

Eval (modify):
- `eval/contamination_audit/audit_runner.py` (add split counts, exit code 2)

Read-only context:
- `backend/app/api/production_completion.py:482-725` (production classifier path)
- `backend/app/complexity/wide_deep_asym_analyzer.py:118` (`ANALYZER_VERSION`)
- `backend/app/complexity/wide_deep_asym_analyzer.py:31` (`_MODEL_PATH`)
- `backend/app/api/models.py:39` (auth pattern)
- `backend/app/api/recommendation.py:29` (the Gemini endpoint NOT to use)
