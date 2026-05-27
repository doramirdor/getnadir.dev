# Nadir RouterArena Adapter

Submission adapter that wraps the production `/v1/route_only` endpoint
(`backend/app/api/route_only.py`) as a RouterArena-compatible router.
Decision-only: no LLM is ever invoked. The leaderboard score reflects the
trained `wide_deep_asym_v3` classifier, not a Gemini-backed ranker or any
fallback path.

## Layout

```
eval/routerarena/
  __init__.py
  nadir_adapter.py         # NadirRouter (the importable adapter)
  config/nadir.json        # RouterArena pipeline config
  run_sub10.sh             # 10-prompt smoke against a live backend
  test_nadir_adapter.py    # offline tests (httpx.MockTransport)
  reports/                 # smoke output (gitignored on purpose; created on first run)
  MODEL_CARD.md            # model card
  SUBMISSION_PACKAGE.md    # cover doc + status checklist
  README.md                # this file
```

## Two API layers

The adapter exposes two callables on `NadirRouter`:

| Method | Contract | When to use |
| --- | --- | --- |
| `route(prompt) -> RouteDecision` | **Strict.** Raises `NadirRouterError` on any transport, HTTP, or schema problem. | Tests, smoke scripts, anything that should see failures. |
| `_get_prediction(query) -> str` | **Never raises.** Falls back to `claude-sonnet-4-6` (mid-tier) on any failure. | RouterArena's eval harness. A leaderboard run must complete even when individual calls fail. |

`_get_prediction` is implemented as a `try/except` wrapper around `route`,
so both layers go through the same HTTP path.

## Install dependencies

The adapter only needs `httpx`. The tests also need `pytest`. The smoke
script needs `python3` on PATH and `httpx` importable in that interpreter.

```bash
pip install httpx pytest
```

If running from inside the getnadir.dev backend venv, both are already
present (httpx is a transitive dep of FastAPI's TestClient and LiteLLM).

## Point at a Nadir endpoint

The adapter reads two environment variables. Hard-coding is not supported
(intentional — eval keys and URLs must be configurable per run).

| Var | Purpose | Example |
| --- | --- | --- |
| `NADIR_BACKEND_URL` | Base URL of a **dedicated eval** Nadir deployment. | `https://cgmuqcg2di.us-east-1.awsapprunner.com` |
| `NADIR_API_KEY` | Eval-only API key. **Must have no clusters and no expert models.** | `nadir-eval-...` |

```bash
export NADIR_BACKEND_URL="https://cgmuqcg2di.us-east-1.awsapprunner.com"
export NADIR_API_KEY="<eval-only key, no clusters, no expert models>"
```

Operational preconditions (enforced by the backend; smoke fails fast on
violation):

1. The eval user has **no clusters** configured. Cluster routing would
   short-circuit the trained classifier.
2. The eval user has **no expert models** configured. Same reason.
3. The classifier's selection method is on the allow-list (not
   `*_fallback`). The endpoint returns 503 otherwise — refusing to publish
   a leaderboard score backed by a degraded router.

If any of these are violated, `/v1/route_only` returns 503 and `route()`
raises. `run_sub10.sh` then exits non-zero.

## Run the sub_10 smoke

```bash
export NADIR_BACKEND_URL=...
export NADIR_API_KEY=...
./eval/routerarena/run_sub10.sh
```

The script issues 10 representative prompts (spanning expected tiers) and
verifies four preconditions:

1. `schema_fingerprint` is constant across all 10 calls.
2. `x-nadir-classifier-sha` is constant across all 10 calls.
3. The tier distribution is non-degenerate (not 100% one tier).
4. Every per-call wall-clock latency is under 5000ms.

The full per-call detail and the precondition results land in
`eval/routerarena/reports/smoke_sub10_<UTC timestamp>.json`. The script
exits 0 on overall PASS and 1 on any precondition failure, so it can gate
a CI job or a submission step.

## Run the offline tests

```bash
# From the repo root:
pytest eval/routerarena/test_nadir_adapter.py -v

# Or from inside the package directory:
cd eval/routerarena
pytest test_nadir_adapter.py -v
```

The tests use `httpx.MockTransport` and **never touch the network**. They
cover:

- input encoding (URL, method, headers, JSON body)
- tier→model mapping for simple/medium/complex
- strict raise on every non-2xx status (`400`, `401`, `403`, `429`, `500`, `503`)
- pass-through of the schema fingerprint and `x-nadir-classifier-sha` header
- raise on schema fingerprint mismatch
- raise on read timeout / connect timeout
- never-raise behavior of `_get_prediction` (mid-tier fallback)
- unknown tier rejection
- confidence histogram bucketing and the >15%-low-confidence verdict
- missing `NADIR_BACKEND_URL` → raise

## What to do when a precondition fails

| Failure | Likely cause | Fix |
| --- | --- | --- |
| `schema_fingerprint` mismatch | Backend response shape changed (field added/removed/renamed). | Recompute the fingerprint, update `EXPECTED_SCHEMA_FINGERPRINT` in `nadir_adapter.py`, and bump the version in `config/nadir.json`. Do NOT publish a leaderboard score during a drift window. |
| `classifier_sha` not constant | Production classifier artifact rotated mid-run. | Restart the smoke. SHA is computed once per process; it stabilizes after a deployment finishes. |
| Tier distribution degenerate (all simple or all complex) | Eval prompts are unrepresentative, OR the classifier path didn't run (e.g. fell through to centroid fallback). | Inspect the report's `confidence_verdict.histogram` and a sample of `classifier_version` values. If `classifier_version != "wide_deep_asym_v3"`, the trained path didn't run — file a bug; do NOT submit. |
| Latency > 5s | Cold start, contention with production traffic, or you pointed at shared production by mistake. | Re-run against a dedicated eval deployment. The rate limiter is global; sharing the production process spikes latency. |
| HTTP 503 from `/v1/route_only` | The eval key has clusters or expert models, OR the classifier fell through to a `*_fallback` path. | Strip the eval key in Supabase (no clusters, no expert models). If the fallback persists, the trained model artifact is missing on the deployed image — re-deploy. |
| HTTP 401 / 403 | API key wrong or revoked. | Mint a fresh eval-only key. |

## Schema fingerprint

The response schema is locked by SHA-256 of the sorted Pydantic field
names. Backend constant:

- `_ROUTE_ONLY_SCHEMA_FINGERPRINT` in `backend/app/api/route_only.py:113`

Adapter constant:

- `EXPECTED_SCHEMA_FINGERPRINT` in `eval/routerarena/nadir_adapter.py`

Recompute with:

```bash
python3 -c "import hashlib; \
fs=sorted(['schema_fingerprint','tier','model','complexity_score',\
'classifier_confidence','latency_ms','classifier_version']); \
print(hashlib.sha256(','.join(fs).encode()).hexdigest())"
```

Current value: `7a1538f6cc8bf7960d564dc00b58f2e336b685af50bd123a01e2dc569731efb4`

If the backend ships a field rename or addition, the fingerprint flips,
the adapter raises on every call in strict mode, and `_get_prediction`
returns mid-tier on every call. The smoke run will be visibly degraded
and CI catches it before submission.

## Out of scope

This package assembles the submission. It does NOT:

- open a RouterArena PR
- push to RouterArena's fork
- modify RouterArena's leaderboard scoring code
- call Anthropic, Stripe, or any production write path
- run a full sub on shared production traffic

Submission is a public action that requires explicit founder approval and
the operational preconditions noted above (dedicated eval deployment +
eval API key with no clusters and no expert models).
