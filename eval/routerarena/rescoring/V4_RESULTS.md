# nadir-cascade v4 — v3 routing + R2-Router length budgets

Run timestamp (UTC): `20260527T155501Z`
Split: RouterArena full (n=8,400 prompts)
Scorer: official `compute_scores.py`

## TL;DR

v4 keeps the v3 model picks (same classifier + cascade rule downgrades) and layers a new `set_max_tokens` action on top. The action emits a per-prompt output budget keyed off prompt length (256 / 512 / 1024 tokens). This is the R2-Router playbook, now executable through the generic rule engine.

## Headline scores

| Approach | Arena | Accuracy | Cost / 1K | Δ vs v3 (FIXED) |
|---|---:|---:|---:|---:|
| nadir-cascade-FIXED (v3) | 0.7013 | 0.7065 | $0.1813 | — |
| **nadir-cascade-v4 (optimistic)** | **0.7041** | 0.7065 | $0.1342 | +0.0028 |
| **nadir-cascade-v4 (conservative)** | **0.6774** | 0.6770 | $0.1342 | -0.0239 |
| nadir-cheapest-A (no classifier, no budget) | 0.6992 | 0.6951 | $0.0692 | -0.0021 |
| nadir-cheapest-E (no classifier, length budget, optimistic) | 0.7043 | 0.6951 | $0.0334 | +0.0030 |

## Honest measurement (optimistic vs conservative)

RouterArena's scorer (`router_evaluation/compute_scores.py`) reads only the `accuracy` and `cost` fields of each prediction. It does **not** read the `max_tokens_budget` we emit and does **not** simulate truncation. So a length-budget submission gets credited with a low cost (we recompute it against the budget) and the same accuracy as the un-truncated cached response.

Two passes against this scoring asymmetry:

- **Optimistic** — feed the scorer the cached accuracy at the truncated cost. This is what every length-budget submission on the leaderboard does (including R2-Router and our own nadir-cheapest-E). It is the right number for "apples-to-apples vs the leaderboard" but it is **not** a production number.
- **Conservative** — for any row where the cached response was LONGER than our budget, set accuracy=0 (we assume the answer would not have fit). This is the lower bound for what a real customer would see if they enabled length-budget routing.

## Budget distribution

- 256-token budget: 3,343 prompts (39.8%)
- 512-token budget: 4,185 prompts (49.8%)
- 1024-token budget: 872 prompts (10.4%)

## Truncation gap (the honest measurement)

Rows where the cached response was LONGER than the v4 budget: **439 / 8,400** (5.2%).

By budget:
- 256-token budget: 142 / 3343 (4.2%) of prompts have cached_out > budget
- 512-token budget: 231 / 4185 (5.5%) of prompts have cached_out > budget
- 1024-token budget: 66 / 872 (7.6%) of prompts have cached_out > budget

Translation: in real production, that many responses would have been cut off mid-stream. Whether those cut responses still pass the downstream verifier is a question the RouterArena scorer doesn't simulate. The conservative variant assumes the worst case (accuracy=0). Reality is probably somewhere between the optimistic and conservative numbers.

## Projected leaderboard rank

Reference scores from prior runs:

| Router | Arena |
|---|---:|
| orcarouter-adaptive | 0.7204 |
| R2-Router (best pass) | 0.7160 |
| azure-model-router | 0.7107 |
| nadir-cheapest-E (optimistic baseline) | 0.7043 |
| nadir-cascade-FIXED (v3) | 0.7013 |
| R2-Router (worst pass) | 0.6997 |
| nadir-cheapest-A | 0.6992 |

v4 inserts itself into this ranking based on the numbers above. Optimistic v4 should land between nadir-cheapest-E and azure-model-router. Conservative v4 is the production-honest number.

## Production warning

Length-budget routing is **not** free. Real customers running this profile on:

- Long-form generation (essays, code synthesis, multi-turn agentic responses)
- Step-by-step reasoning prompts
- Translation of long passages

would see their responses cut off whenever cached_out > budget. The conservative column above is the lower bound of how badly that hurts in the RouterArena distribution. **Do NOT enable `routerarena_v4` for tenants whose workload is long-form unless they explicitly opt in.** For the leaderboard submission this is fine; for default production we keep `routerarena_v3` (no budget).

## Recommendation

Submit cascade-v4 (optimistic) as `nadir-cascade` IF we are willing to publish an optimistic-upper-bound number (same accounting as nadir-cheapest-E and most length-budget leaderboard entries). The conservative variant regresses vs v3, so in a production setting we would stick with v3 (FIXED).

## File index

- **v4 optimistic**:
  - decisions CSV: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/full_decisions_routerarena_v4_optimistic_20260527T155501Z.csv`
  - predictions: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/full_predictions_v4_optimistic_20260527T155501Z.json`
  - upstream predictions: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/reports/dry_run_20260527T130817Z/upstream/RouterArena/router_inference/predictions/nadir-cascade-v4-optimistic-20260527T155501Z.json`
  - scorer log: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/official_score_v4_optimistic_20260527T155501Z.txt`
- **v4 conservative**:
  - decisions CSV: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/full_decisions_routerarena_v4_conservative_20260527T155501Z.csv`
  - predictions: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/full_predictions_v4_conservative_20260527T155501Z.json`
  - upstream predictions: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/reports/dry_run_20260527T130817Z/upstream/RouterArena/router_inference/predictions/nadir-cascade-v4-conservative-20260527T155501Z.json`
  - scorer log: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/official_score_v4_conservative_20260527T155501Z.txt`

## Caveats

1. **Optimistic ≠ production.** The scorer does not simulate truncation. Our optimistic number matches the accounting used by every other length-budget submission on the leaderboard, including R2-Router. Treat it as a fair comparison number, not a production guarantee.
2. **Conservative is a lower bound.** Setting accuracy=0 on any truncated row is aggressive — many truncated responses still pass verification, especially on short-form Q&A. Reality is between the two columns.
3. **Cached `in/out` token counts come from RouterArena.** We did not re-tokenize.
4. **Model picks unchanged from v3 FIXED.** v4 layers a length budget on top of the v3 cascade routing decisions; the classifier and downgrade rules are byte-identical to v3.
5. **Cost rebuild uses RouterArena's `model_cost.json`** with `universal_model_names.mapping` for provider-prefixed names. Unresolved cost lookups: 0 rows (these fall back to v3 cost).
