# Outcome-Conditioned Retraining (OCR) Runbook

Weekly closed-loop pipeline that keeps the verifier hyper-tuned to actual
production traffic. The verifier decides whether a cheap-model answer is
good enough to serve; OCR re-labels a sample of those decisions with a
stronger judge model and feeds the disagreements back into the next
training round.

**Live execution NOT enabled by default.** Operator must set `OCR_LIVE=1`
and approve the LLM cost (~$0.50/week judge calls). See `settings.py`.

---

## 1. When to run

- **Cadence:** weekly. Sunday 02:00 UTC is the slot the rest of the
  back-office cron uses (`invoice_scheduler`, `cluster_performance`).
- **Trigger options:**
  - Celery beat (separate wiring step — not part of this delivery).
  - Manual: `python -m app.services.ocr_pipeline` from the backend
    venv. The orchestrator's `run_weekly()` method is the entrypoint.
- **Skip conditions:**
  - `OCR_LIVE` is unset or zero.
  - Fewer than 1,000 cascade decisions in the last 7 days (sample
    will be too noisy to be useful).
  - The verifier has been retrained in the last 7 days (don't chase
    your own tail).

## 2. Expected cost

- **Judge model:** Sonnet-4-6.
- **Sample size:** 500 rows/week.
- **Per-call cost:** roughly $0.001 input + minor output. Conservative
  budget is ~$0.50 per weekly run, or about $2/month.
- The judge prompt is single-turn, ~600 tokens in, ~80 tokens out.
- No retries on success means the budget holds even when the model is
  chatty — the parser cleans up prose-prefixed JSON.

If the cost estimate ever drifts above $5/week, stop the cron and
investigate before continuing. That usually means sample size has
ballooned or the prompts in `usage_logs` are unusually long.

## 3. Reading the stats dict

`run_weekly()` returns:

```
{
  "sampled":               # rows pulled from cascade_decisions
  "fetched":               # rows that had readable prompt + response in usage_logs
  "judged":                # rows that survived to receive a judge label
  "disagreements_written": # rows where verifier_accepted != judge_accept (high-conf)
  "output_path":           # JSONL ready for verifier/train_local.py
}
```

### Interpreting disagreement rate

`disagreement_rate = disagreements_written / judged`

| Rate     | Meaning                                    | Action                        |
|----------|--------------------------------------------|-------------------------------|
| < 5%     | Verifier is well-calibrated to traffic.    | Skip retraining this week.    |
| 5 - 15%  | Healthy drift signal.                      | Retrain on Colab as scheduled.|
| 15 - 30% | Verifier drifting from production traffic. | Retrain + manual spot-check.  |
| > 30%    | Verifier drifting **badly** — something    | Page founder. Do not auto-    |
|          | has shifted in the input distribution.     | promote a new checkpoint.     |

A high `sampled` but low `fetched` ratio usually means many users have
`store_prompts=false` and we cannot judge their rows. That is expected
and a privacy feature, not a bug.

## 4. A/B testing a new checkpoint

After Colab training produces a new `.pt` artifact, run it through the
shadow-mode A/B before promoting:

1. Drop the new checkpoint into `backend/app/services/verifier_weights/`
   alongside the live one (e.g. `verifier_v3.pt` next to
   `verifier_v2.pt`).
2. Set `CASCADE_MODE=shadow` and point the cascade router at the new
   checkpoint for 10% of traffic via the per-user
   `model_parameters.cascade.verifier_checkpoint` override.
3. Let it run for ≥48 hours so the rolling window in
   `routing_quality_tracker` accumulates a comparable sample.
4. Compare the two checkpoints on a held-out validation slice using
   `verifier/eval.py --checkpoint <path>`.

## 5. Promotion criteria

A new checkpoint must clear ALL of these before going live:

- **AUROC:** ≥ live checkpoint AUROC + 1.0 percentage point on the
  held-out RouterBench-style validation set
  (`verifier/data/holdout_eval.jsonl`).
- **Downgrade rate:** ≤ 2.5% (current production sweet spot).
- **Wasted-escalation rate:** within 1.5pp of the live checkpoint.
- **Latency:** p99 < 25ms on CPU. Anything over 40ms gets rejected.

Document the comparison in `verifier/reports/promotion_<date>.md`
before flipping the env var.

## 6. Promotion procedure

1. Bake the new checkpoint into the Docker image (replace the file in
   `backend/app/services/verifier_weights/`).
2. Build + push:
   `./aws/deploy-aws.sh --update`
   (this is the same path described in CLAUDE.md).
3. App Runner auto-redeploys on the new `:latest` push.
4. Watch the first 30 minutes of CloudWatch logs for verifier errors —
   the kill-switch in `cascade_router.py` will trip after 3 consecutive
   errors and the cascade will fall through to the cheap path.

## 7. Rollback

If the new checkpoint regresses on production traffic — visible as
either of:

- Rising `verifier_error_count` in CloudWatch (already monitored by
  the kill-switch).
- Rising `disagreement_rate` in next week's OCR run (>30%).
- Spike in customer complaints about answer quality.

then rollback is:

1. Revert the file in `backend/app/services/verifier_weights/` to the
   previous checkpoint.
2. `./aws/deploy-aws.sh --update`.
3. File an entry in `verifier/reports/rollback_<date>.md` with the
   metric that triggered the revert.

The kill-switch already protects against catastrophic failure modes
(verifier raises on every call), so rollback is rarely time-critical.

## 8. Privacy contract

The pipeline silently skips any row whose `usage_logs.prompt` starts
with `sha256:` — that prefix is the marker
`supabase_unified_llm_service._redact_for_privacy` stamps when
`user_session.store_prompts=False`. The pipeline must never attempt to
re-derive the original prompt from the hash.

## 9. Files of interest

- `backend/app/services/ocr_pipeline.py` — orchestrator
- `backend/app/services/ocr_judge.py` — judge wrapper (LiteLLM)
- `backend/tests/test_ocr_pipeline.py`, `test_ocr_judge.py` — fully mocked tests
- `verifier/train_local.py` — consumes the JSONL this pipeline writes
- `verifier/colab_train.ipynb` — production retraining notebook
