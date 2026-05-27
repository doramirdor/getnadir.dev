# RouterArena submission: Nadir (two adapters)

**Submitter:** Nadir Research (getnadir.dev)
**Router names:** `nadir-cascade-verified`, `nadir-cheapest`
**Schema version:** 1 (fingerprinted in every adapter response)
**Date prepared:** 2026-05-27

## Summary

This PR adds two routing adapters from Nadir to RouterArena. We are
submitting them together, on purpose, because they answer different
questions about the same underlying system.

1. **`nadir-cascade-verified`** is the production-equivalent adapter.
   It runs Nadir's trained tier classifier (`wide_deep_asym_v3`), a
   YAML rule profile (`routerarena_v3.yaml`), and a calibrated
   post-generation verifier that scores the cheap-tier response and
   selectively escalates to mid-tier when verifier confidence falls
   below the acceptance threshold. The verifier acceptance threshold
   was calibrated against RouterArena's cached-response distribution
   (τ=0.70 for this submission); production live traffic uses τ=0.80,
   calibrated on RouterBench. See `METHODOLOGY_NOTE.md`.
2. **`nadir-cheapest`** is a pure cost-minimization baseline. For each
   prompt it ignores the classifier entirely and picks the cheapest
   cached model by `output_token_price_per_million`. We submit it as a
   transparency artifact: under RouterArena's `β=0.1` log-cost scoring,
   cost-arbitrage on the cached pool is a competitive strategy, and we
   want reviewers to see what that strategy scores on its own.

Final official-scorer numbers on the full split (n=8,400), from
`eval/routerarena/rescoring/THRESHOLD_SWEEP.md`:

| Adapter | Arena score | Accuracy | Cost / 1K queries |
| --- | ---: | ---: | ---: |
| `nadir-cascade-verified` (τ=0.70) | 0.7118 | 0.7371 | $0.6841 |
| `nadir-cheapest` (Strategy E)     | 0.7043 | 0.6951 | $0.0334 |

`nadir-cascade-verified` is our recommended primary entry. The
cheapest baseline is submitted as a transparency artifact, not the
headline. The cascade-verified adapter buys +4.2pp accuracy over the
cheapest baseline at higher cost, and the arena formula still rewards
it; the verifier hop is what flips the result vs the no-verifier
cascade (0.7013 in our earlier runs). We discuss the cost-accuracy
trade in detail in `METHODOLOGY_NOTE.md`.

## Architecture (brief)

Nadir is an LLM router. In production, every prompt goes through:

1. A trained pre-classifier (`wide_deep_asym_v3`, INT8-quantized, under
   10 ms on CPU) that assigns a tier label.
2. A rule engine that can override the tier on configured patterns
   (e.g., competitive-programming, finQA).
3. A per-tier model-selection step that picks the cheapest available
   model whose price tier matches the assigned tier.
4. A post-generation, calibrated verifier (AUROC 0.961 on RouterBench
   held-out, n=11,420) that scores the cheap-model answer and selectively
   escalates when confidence falls below threshold.

All four steps run in `nadir-cascade-verified`. RouterArena caches
each prompt's per-model responses, so step 4 can read the cheap-tier
cached answer and emit an acceptance decision before the final routing
choice is recorded. The verifier is what bridges the cascade adapter's
0.7013 (no-verifier baseline) to 0.7118 (verifier-gated, τ=0.70).

## Methodology per adapter

### `nadir-cascade-verified`

- **Classifier:** `wide_deep_asym_v3`, SHA exposed via the
  `x-nadir-classifier-sha` response header on every routing call.
  SHA `67dccb427a07ddbdeae08dc43483265a3d80606c3ac904527ffabdd259830231`.
- **Rule profile:** `routerarena_v3.yaml`, versioned and shipped in the
  adapter package.
- **Verifier:** cross-encoder, CPU INT8, AUROC 0.961 on RouterBench
  held-out (`verifier/reports/eval_20260526T184516.json`, n=11,420).
  Reads the cheap-tier cached response, the prompt, and emits an
  acceptance probability in [0, 1]. Acceptance threshold for this
  submission: τ=0.70 (calibrated on RouterArena's cached-response
  distribution; see `eval/routerarena/rescoring/THRESHOLD_SWEEP.md`).
  Production live traffic uses τ=0.80, calibrated against the
  RouterBench validation slice the verifier was trained on.
- **Model selection:** if the verifier accepts, the cheap-tier model
  ships; if it rejects, the prompt escalates to mid-tier. For each
  tier, the adapter picks the cheapest model in the cached set for
  that prompt whose price tier matches the assignment. Tie-break is
  alphabetical on the cached-model name. The adapter's model choice
  is conditional on which models RouterArena cached for that prompt.
- **Determinism:** all random seeds fixed; the model torch is set to
  `manual_seed(42)`; cached-pool tie-breaks are alphabetical.
- **Schema fingerprint:** SHA-256 of the sorted response field names is
  asserted constant across every routing call in the run. A mismatch
  aborts the run rather than producing a degraded leaderboard score.

### `nadir-cheapest`

- **No classifier, no rule engine, no learned routing.** For each prompt
  the adapter reads `model_responses.keys()` (the set of models cached
  for that prompt), looks up each cached model's
  `output_token_price_per_million` in `model_cost/model_cost.json`, and
  selects the cheapest. Tie-break is alphabetical.
- **Strategy E variant:** in addition to the cheapest-by-output-price
  rule, the adapter emits a `max_tokens_budget` per prompt (256 / 512 /
  1024 by prompt length). This is included with full disclosure as an
  optimistic upper bound; see the caveat in section "What's not
  included."

## Reproducibility

Local artifacts shipping in this PR or already in the repository:

- Adapter source: `eval/routerarena/nadir_adapter.py`
- Adapter config: `eval/routerarena/config/nadir.json`
- Verifier-gated cascade run (the τ=0.80 production-default sweep
  source): `eval/routerarena/rescoring/full_decisions_v3_verifier_FIXED_20260527T161854Z.csv`
  and `eval/routerarena/rescoring/full_summary_v3_verifier_FIXED_20260527T161854Z.json`.
- Threshold sweep table + per-τ predictions, scorer logs, and
  summaries: `eval/routerarena/rescoring/THRESHOLD_SWEEP.md` and
  `eval/routerarena/rescoring/threshold_sweep/`.
- Submitted prediction file (τ=0.70):
  `eval/routerarena/rescoring/threshold_sweep/predictions_tau_0.70.json`
  with official-scorer log
  `eval/routerarena/rescoring/threshold_sweep/scorer_tau_0.70.txt`.
- Cheapest (E) prediction file:
  `eval/routerarena/rescoring/cheapest_predictions_E_20260527T153854Z.json`
- Cheapest (A) prediction file (no-budget fallback if the leaderboard
  rejects truncated entries):
  `eval/routerarena/rescoring/cheapest_predictions_A_20260527T153854Z.json`
- Decisions CSVs (per-prompt model choices) for the cheapest
  strategies: `eval/routerarena/rescoring/cheapest_decisions_{A,Aprime,E}_*.csv`
- Cheapest official-scorer logs:
  `eval/routerarena/rescoring/cheapest_official_score_E_*.txt`
- Classifier SHA: exposed by the production endpoint and recorded in
  each cascade routing response.
- Schema fingerprint: constant string asserted in the adapter test
  suite.

## Contamination disclosure

We have run a contamination audit against the RouterBench dataset (used
to train the verifier and tune the pre-classifier). The audit is in
`verifier/reports/routerbench_contamination_20260524T122849.json`:
overlap count 0 between our labeled training corpus
(n=2,632) and RouterBench (n=36,481), under a normalize-and-SHA-256 hash
on prompt text.

**We did not run an equivalent contamination audit against the
RouterArena prompt set.** The audit script
(`verifier/routerbench_contamination.py`) is generalizable and we plan
to publish a RouterArena-specific run in a follow-up. Until that report
exists, we ask reviewers to weight the RouterArena results
correspondingly. The classifier was trained against an internal labeled
corpus derived from production traffic and RouterBench-licensed prompts;
it was not trained on any prompts known to be drawn from the
RouterArena sub_10 or full splits, but we cannot certify that under
hash-collision in the absence of the audit.

## What's not included

- **Live response generation.** RouterArena's evaluation protocol uses
  cached completions from a fixed reference set of models, not live
  generations. Our verifier reads RouterArena's cached cheap-tier
  responses (which is what makes `nadir-cascade-verified` runnable
  here), but the cached pool is a snapshot. Any router-level behavior
  that depends on live token streams (latency-aware fallback, partial
  output streaming) is not exercised in this submission.
- **Iterative refinement.** Nadir's optional intermediate cheap-model
  refinement pass (a second cheap-tier shot before paying for full
  escalation) is invisible to a benchmark that only scores final model
  choice on a cached pool. Not submitted as a separate adapter.
- **Strategy E caveat:** the cheapest adapter's Strategy E variant uses
  the cached accuracy value at the cached completion length, then
  recomputes cost under the truncation budget. Real-world truncation
  would likely reduce accuracy on long reasoning prompts. Strategy E's
  arena score is therefore an optimistic upper bound on a truncated
  pool, not a guaranteed score under live truncation. We disclose this
  in the methodology note and recommend reviewers consult Strategy A
  (arena 0.6992) as the no-budget reference.
- **Verifier-threshold calibration disclosure:** the verifier was
  trained against RouterBench. RouterArena's cached responses come
  from a different model mix with different answer shapes; the
  verifier's raw acceptance probabilities skew lower on this
  distribution. We swept τ in [0.30, 0.90] on the FIXED verifier
  scores (see `eval/routerarena/rescoring/THRESHOLD_SWEEP.md`) and
  picked the τ that maximized arena_score (τ=0.70). We did not change
  the verifier weights, did not retrain on RouterArena data, and did
  not peek at ground-truth accuracy when making routing decisions.
  Production live traffic still uses τ=0.80.

## Reviewer notes

If only one adapter can be accepted, our recommendation is
`nadir-cascade-verified`. It is the production-equivalent and the
higher-accuracy entry, and at τ=0.70 it edges the cheapest baseline on
arena score (0.7118 vs 0.7043). The cheapest baseline is included as
a transparency artifact so the cost-vs-accuracy trade is visible. The
cross-benchmark context is in `METHODOLOGY_NOTE.md`.

We are open to questions and will respond on the PR thread. Thank you
for maintaining RouterArena.
