# WS-1 Blueprint — RouterArena Adapter + Contamination Audit

**Architect's verdict for pipeline owner**: CANNOT CONFIRM CLEAN without running the audit. Our v3 training corpus pulls from `chatbot_arena_55k` and `wildchat_1m`; RouterArena's dataset is also derived from Chatbot Arena. Real overlap risk.

## Decision rule

- 0 overlapping prompts → PASS → proceed to submission
- 1-10 overlaps → NEEDS-REVIEW → founder + eng-lead sign-off
- >10 overlaps → FAIL → block PR, plan retrain

## Components

### Contamination audit (`eval/contamination_audit/`)
- `corpus_loader.py` — enumerate every training prompt from `backend/labeled_data/{v3/combined_labeled.json, v3/batches/*, v2/arena_batches/*, raw/*, batches/*}` plus `Horizen/need_to_remove/training/training/model_recommender/*.jsonl`
- `arena_downloader.py` — pull `RouteWorks/RouterArena` from HuggingFace (`sub_10` then `full`)
- `hasher.py` — `normalize_and_hash(text)`: strip + collapse whitespace + casefold + SHA-256
- `audit_runner.py` — orchestrate, write `reports/audit_{split}_{date}.json` with `overlap_count`, `verdict`, `classifier_artifact_hash`
- Report binds classifier artifact SHA (`backend/app/complexity/models/wide_deep_asym_v3.pt` + `trained_model.pkl`) to the audit

### RouterArena adapter (`eval/routerarena/`)
- `nadir_adapter.py` — `NadirRouter(BaseRouter)` with `_get_prediction(query) -> model_str`
- Wraps `/v1/custom_recommendation` (reuses `eval/phase0_weave_baseline.py:125-158` call pattern)
- Tier map: `simple→claude-haiku-4-5`, `medium→claude-sonnet-4-6`, `complex→claude-opus-4-6`
- On error: fallback to mid-tier, log to stderr, no raise
- `config/nadir.json` — RouterArena pipeline config
- `run_sub10.sh` — smoke test before full submission

## 3-day sequence

**Day 1 (audit core, sub_10 verdict gate)**: hasher → arena_downloader → corpus_loader → audit_runner → run sub_10. If overlap >10, STOP.

**Day 2 (full audit + adapter)**: run full audit, build NadirRouter, smoke test against local backend.

**Day 3 (tests + reports)**: 5 audit tests + 5 adapter tests, commit the audit report as permanent evidence, tag commit with classifier artifact hashes.

## Risk register (top 5)

1. **Contamination found** (medium-high likelihood given shared upstream): blocks submission, requires retrain.
2. **NadirClaw DistilBERT provenance undocumented**: scope to Pro `wide_deep_asym` for this submission, defer NadirClaw audit.
3. **RouterArena model_cost.json doesn't have Claude 4.x**: PR must add prices from Anthropic's published page, not internal pricing.
4. **`/v1/custom_recommendation` schema drift**: pin via SCHEMA_VERSION comment, test catches.
5. **HuggingFace access/format change**: catch DatasetNotFoundError with clear instructions, cache after first download.

## Files

13 new, 1 modified (`eval/requirements.txt` adds `datasets`, `huggingface_hub`).

---

## Reviewer must-fixes (applied 2026-05-23)

1. **Wrong endpoint**: `/v1/custom_recommendation` is a Gemini-backed ranker, NOT the trained `wide_deep_asym_v3` classifier. Submitting via it would be material misrepresentation. **Fix**: expose a new `/v1/route_only` endpoint backed by `get_intelligent_model_recommendation_with_analysis` (the actual production path), or call `/v1/chat/completions` with a `route_only=true` flag that skips the LLM call.
2. **NFC Unicode normalization missing**: add `unicodedata.normalize("NFC", text)` before casefolding in `hasher.py`. Without this, accented chars in NFD vs NFC produce different hashes → false-negative contamination.
3. **Threshold too lenient**: revise to **0 exact matches = PASS, 1+ exact matches = FAIL**. The original 1-10 NEEDS-REVIEW bucket is for near-duplicate (embedding/edit-distance) detection, which is out-of-scope for this cycle.
4. **Corpus glob misses files**: replace explicit subdirectory list with `backend/labeled_data/**/*.json` recursive glob plus block-list (`*_labels.json`, `cache/`, `results/`). Adds `arena_labeled_200.json`, `arena_prompts_200_clean.json`, top-level `batches/batch_*`.
5. **Report records both train-set and labeled-but-dropped overlap separately** (some labeled prompts may not have been in the final v3 training split).
6. **`model_cost.json` PR step**: pull existing `claude-3-5-sonnet` entry as format reference, mirror schema exactly, verify input/output separate vs blended, verify per-token vs per-million units. Record Anthropic pricing page URL + date in PR description.
7. **End-to-end Day 2 dry run**: before any PR, run the adapter against local backend with 5 known prompts and verify tier mapping is correct.

Nice-to-have (will not block):
- Strip markdown code fences before hashing (low rate of false-negative on coding prompts).
- Strip trailing punctuation in normalization chain.
- Document NadirClaw DistilBERT provenance gap explicitly in audit report.
