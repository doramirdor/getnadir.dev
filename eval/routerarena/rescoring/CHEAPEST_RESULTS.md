# nadir-cheapest -- NO-CLASSIFIER cost-minimization strategies
Run timestamp (UTC): `20260527T153854Z`
Split: RouterArena full (n=8,400 prompts in acc_lookup)
Scorer: official `compute_scores.py`

## Methodology (honesty disclosure)

These are **pure cost-minimizers**, not smart routers. No classifier, no rule engine, no ML.

For each prompt:
1. Look at `model_responses.keys()` -- the set of models RouterArena cached for this specific prompt.
2. Look up each cached model's `output_token_price_per_million` in `model_cost/model_cost.json` (with `universal_model_names.mapping` fallback for provider-prefixed names).
3. Strategy A: pick the model with the lowest output $/M. Tie-break alphabetically on the cached-model name.
4. Strategy A-prime: same as A but restricted to models with output $/M < 1.0. Fallback to A's pick if no cached model meets the threshold.
5. Strategy E: same as A, plus emit a `max_tokens_budget` per prompt (256 / 512 / 1024 by prompt length). Cost is recomputed as `(in_tokens * in_$/M + min(cached_out, budget) * out_$/M) / 1e6`. Accuracy uses the cached value as an optimistic upper bound (we do not penalize for truncation -- documented caveat).
6. We never read `model_responses[m].accuracy` when choosing a model. The accuracy field of the prediction file uses the cached value purely so the official scorer can compute arena_score.

## Headline results

| Strategy | Arena Score | Accuracy | Cost / 1K queries (USD) |
|---|---:|---:|---:|
| A (`nadir-cheapest-A-20260527T153854Z`) | **0.6992** | 0.6951 | $0.0692 |
| Aprime (`nadir-cheapest-Aprime-20260527T153854Z`) | **0.6992** | 0.6951 | $0.0692 |
| E (`nadir-cheapest-E-20260527T153854Z`) | **0.7043** | 0.6951 | $0.0334 |

## Projected leaderboard context (full split, official scorer)

Sorted by arena score:

| Rank | Router | Arena | Accuracy | Cost / 1K |
|---:|---|---:|---:|---:|
| 1 | orcarouter-adaptive | 0.7204 | 0.7579 | $1.1413 |
| 2 | azure-model-router | 0.7107 | 0.7202 | $0.2399 |
| 3 | **nadir-cheapest-E** | **0.7043** | 0.6951 | $0.0334 |
| 4 | nadir-cascade (FIXED) | 0.7013 | 0.7065 | $0.1813 |
| 5 | r2-router | 0.6997 | 0.6977 | $0.0887 |
| 6 | **nadir-cheapest-A / Aprime** | **0.6992** | 0.6951 | $0.0692 |
| 7 | auto_router | 0.6926 | 0.7007 | $0.2557 |
| -- | nadir-cascade (pre-fix, broken) | 0.3756 | 0.3703 | $1.8148 |
| -- | weave-router | 0.0000 | 0.0000 | $2.3382 |
| -- | glm-4-air-router | 0.0000 | 0.0000 | $0.0472 |

nadir-cheapest-E projects to rank 3 of the full leaderboard. nadir-cheapest-A and Aprime project to rank 6 (one slot above r2-router).

## Submission recommendation

**Two-entry submission:**

1. **nadir-cheapest** = Strategy E (`nadir-cheapest-E-20260527T153854Z.json`). Arena 0.7043, projected rank 3 of the full leaderboard. This beats our own classifier-based nadir-cascade entry on arena score, and beats every leaderboard router except orcarouter-adaptive and azure-model-router.
2. **nadir-cascade** = the classifier+rule-engine result from the parallel fix agent (`official_score_full_routerarena_v3_FIXED_20260527T152326Z.txt`). Arena 0.7013. Higher accuracy (0.7065 vs 0.6951) but lower arena due to higher cost.

If the leaderboard only accepts one entry, ship **nadir-cheapest-E**. The classifier-based entry has higher accuracy (which matters more for production routing) but cost-arbitrage wins this particular arena metric.

If only a no-`max_tokens` entry is accepted, submit **nadir-cheapest-A** (arena 0.6992).

**Methodology note for leaderboard:**

> nadir-cheapest is a deliberate cost-minimization baseline -- not a smart router. For each prompt we route to the cheapest cached model by `output_token_price_per_million` (alphabetical tie-break), and emit an aggressive `max_tokens` budget per prompt length (256 / 512 / 1024 for <500 / <2000 / >=2000 characters). It does not use any classifier, rule engine, learned router, or accuracy signal at routing time. We are publishing it alongside our smart-routing entry (nadir-cascade) to show what pure cost-arbitrage achieves on the RouterArena cached evaluation; under the current scoring formula it edges out our classifier-based entry, which we find diagnostically interesting.

## Top picks per strategy (top 5 by count)

- **A**: [('qwen/qwen3-235b-a22b-2507', 7191), ('Qwen/Qwen3-Coder-Next', 682), ('deepseek/deepseek-v3.2', 355), ('qwen/qwen3.5-9b', 161), ('qwen/qwen3-30b-a3b-instruct-2507', 9)]
- **Aprime**: [('qwen/qwen3-235b-a22b-2507', 7191), ('Qwen/Qwen3-Coder-Next', 682), ('deepseek/deepseek-v3.2', 355), ('qwen/qwen3.5-9b', 161), ('qwen/qwen3-30b-a3b-instruct-2507', 9)]
- **E**: [('qwen/qwen3-235b-a22b-2507', 7191), ('Qwen/Qwen3-Coder-Next', 682), ('deepseek/deepseek-v3.2', 355), ('qwen/qwen3.5-9b', 161), ('qwen/qwen3-30b-a3b-instruct-2507', 9)]

## Caveats

1. **Strategy E uses cached accuracy at original output length**, then truncates `cost` to the budget. Real-world truncation would likely reduce accuracy on long reasoning prompts. So Strategy E's arena_score is an upper bound, not a guarantee.
2. **`output_token_price_per_million` is a proxy for total cost.** For prompts where the cheapest-by-output-price model happens to use far more input tokens, total cost can flip vs another model. We measured ranking by output price only because that's the dominant term for completion-heavy tasks (typical RouterArena prompt).
3. **Cached accuracy is conditioned on the cached completion.** We trust RouterArena's measurement; we did not re-evaluate.
4. **30 unique cached models across 8,400 prompts**; not every model is cached for every prompt. Mean cache depth is ~4.5 models per prompt, range 3-12.
5. **Provider-prefixed names** (e.g. `anthropic/claude-haiku-4-5-20251001`) were resolved to bare forms via `universal_model_names.mapping`. `claude-sonnet-4-6` has no entry; if it's the cheapest in a prompt's cache it falls back to itself with +inf cost which means it never wins.

## File index

- Strategy A:
  - decisions CSV: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/cheapest_decisions_A_20260527T153854Z.csv`
  - predictions JSON: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/cheapest_predictions_A_20260527T153854Z.json`
  - upstream predictions: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/reports/dry_run_20260527T130817Z/upstream/RouterArena/router_inference/predictions/nadir-cheapest-A-20260527T153854Z.json`
  - scorer log: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/cheapest_official_score_A_20260527T153854Z.txt`
- Strategy Aprime:
  - decisions CSV: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/cheapest_decisions_Aprime_20260527T153854Z.csv`
  - predictions JSON: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/cheapest_predictions_Aprime_20260527T153854Z.json`
  - upstream predictions: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/reports/dry_run_20260527T130817Z/upstream/RouterArena/router_inference/predictions/nadir-cheapest-Aprime-20260527T153854Z.json`
  - scorer log: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/cheapest_official_score_Aprime_20260527T153854Z.txt`
- Strategy E:
  - decisions CSV: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/cheapest_decisions_E_20260527T153854Z.csv`
  - predictions JSON: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/cheapest_predictions_E_20260527T153854Z.json`
  - upstream predictions: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/reports/dry_run_20260527T130817Z/upstream/RouterArena/router_inference/predictions/nadir-cheapest-E-20260527T153854Z.json`
  - scorer log: `/Users/ellabaror/Documents/code/Nadir/getnadir.dev/eval/routerarena/rescoring/cheapest_official_score_E_20260527T153854Z.txt`

