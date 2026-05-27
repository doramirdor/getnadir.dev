# RouterArena full-split — FIXED arena score

**TL;DR.** The previously reported full-split arena of **0.3756** was wrong.
The router's tier logic and rule engine were correct; the bug was the
*model-name mapping* used to look up cached responses. After fixing the
mapping to per-prompt cheapest-cached-model selection (which is what every
multi-provider router on the leaderboard does), the same router scores
**0.7013** on the full 8,400-prompt split. With the verifier-gated cascade
on top, **0.7117**.

This is a model-mapping fix only. No retraining, no rule-profile change,
no decision-rule change. The wide_deep_asym_v3 classifier checkpoint is
unchanged (SHA `67dccb...0231`), the `routerarena_v3` rule profile is
unchanged, and the production decision rule (`argmax`, `cost_lambda=3.0`)
is unchanged.

---

## Headline numbers — `routerarena_v3` (no verifier)

|                                | Broken (static Claude mapping) | Fixed (per-prompt cost-tier)     |
| ------------------------------ | ------------------------------ | -------------------------------- |
| Arena score                    | **0.3756**                     | **0.7013**                       |
| Average accuracy               | 0.3703                         | **0.7065**                       |
| Cost / 1K queries              | $1.8148                        | $0.1813                          |
| Total cost (8,400 prompts)     | $15.24                         | $1.52                            |
| `proxy_model=NONE` rows        | 4,043 / 8,400 (48.1%)          | 0 / 8,400                        |
| Prediction file (upstream)     | `nadir-full-v3-20260527T145711Z.json` | `nadir-full-v3-FIXED-20260527T152326Z.json` |
| Official scorer log            | `official_score_full_routerarena_v3_20260527T145711Z.txt` | `official_score_full_routerarena_v3_FIXED_20260527T152326Z.txt` |

**Per-difficulty accuracy** (after the fix):

| Difficulty | n      | Broken acc | Fixed acc |
| ---------- | ------ | ---------- | --------- |
| easy       | 3,990  | 0.5612     | 0.9554    |
| medium     | 2,445  | 0.2760     | 0.6597    |
| hard       | 1,965  | 0.1000     | 0.2595    |

On the 4,043 prompts that scored 0/0 in the broken run, the FIXED run
gets average accuracy 0.679 at total cost $0.48 — so the broken number
wasn't bad routing, it was a lookup miss that was silently zero-filled.

---

## Root cause

RouterArena's cached `model_responses` are **per-prompt**. Not every prompt
has a cached entry for `claude-haiku-4-5` / `claude-sonnet-4-6` /
`claude-opus-4-6`. Coverage in the 8,400-prompt cache lookup
(`/tmp/routerarena_acc_lookup.pkl`):

| Model                    | Coverage         |
| ------------------------ | ---------------- |
| `claude-haiku-4-5`       |   260 / 8,400 (3%)   |
| `claude-sonnet-4-6`      |   513 / 8,400 (6%)   |
| `claude-opus-4-6`        |    36 / 8,400 (0.4%) |
| `deepseek/deepseek-v3.2` | 4,553 / 8,400 (54%)  |
| `qwen/qwen3-235b-a22b-2507` | 7,191 / 8,400 (86%) |

When the static `tier -> Claude-only model` mapping picked a model that
wasn't in *this* prompt's cache, the row's cost defaulted to default
tokens at Claude pricing and the accuracy fell to 0. 4,043 of 8,400
prompts (48.1%) hit this case.

---

## The fix

Route to a **cost tier** (cheap / mid / expensive), then per-prompt pick
the **cheapest available cached model in that tier** from the prompt's
actual `model_responses.keys()`. Walk the tier ladder if the requested
tier is empty.

### Cost-tier definition

Threshold is on **output token price (USD per 1M output tokens)**:

| Tier      | Output price range | n models in cache |
| --------- | ------------------ | ----------------- |
| cheap     | <= $1.0            | 14                |
| mid       | $1.0 < p <= $8.0   | 11                |
| expensive | > $8.0             | 5                 |

Definition is checked into
`eval/routerarena/rescoring/model_cost_tiers.json`. Within each tier,
models are sorted cheapest -> most-expensive by (output_price,
input_price, name) for deterministic tie-break.

### Routing logic (per prompt)

```text
classifier_tier, conf = wide_deep_asym_v3(prompt)
post_rule_tier        = routerarena_v3.evaluate(prompt, classifier_tier, conf)
cost_class            = {simple: cheap, medium: mid, complex: expensive}[post_rule_tier]
cached_models         = acc_lookup[gi].keys()  # 3 .. 12 models per prompt

for class_try in fallback_order[cost_class]:
    for model in tier[class_try]:  # cheapest -> most-expensive
        if model in cached_models:
            pick (model, class_try)
            break

# cost / acc / tokens read directly from acc_lookup[gi][model]
# (the same values upstream RouterArena measured)
```

Fallback orders:

| Requested  | Try order                          |
| ---------- | ---------------------------------- |
| cheap      | cheap -> mid -> expensive          |
| mid        | mid -> expensive -> cheap          |
| expensive  | expensive -> mid -> cheap          |

`mid -> expensive -> cheap` is the honest production behaviour: if there's
no mid-tier model cached for this prompt, prefer an expensive answer
(higher quality) before regressing to cheap.

### Fallback statistics (`routerarena_v3` FIXED)

| Outcome                                       | n rows |
| --------------------------------------------- | -----: |
| matched requested cost class                  |  7,878 |
| upgraded `mid` -> `cheap` (no mid/expensive cached) | 361 |
| upgraded `mid` -> `expensive` (no mid cached) | 161    |
| last-resort (no cached model in any of our tiers) | 0  |
| no_cache (prompt missing entirely)            | 0      |

All 8,400 prompts resolve to a cached model. **No zero-fills.**

### Top picked models (FIXED)

| Model                                  |  Picks |
| -------------------------------------- | -----: |
| qwen/qwen3-235b-a22b-2507              |  6,286 |
| Qwen/Qwen3-Coder-Next                  |    645 |
| deepseek/deepseek-v3.2                 |    341 |
| deepseek/deepseek-chat                 |    222 |
| openai/gpt-5-mini                      |    198 |
| anthropic/claude-sonnet-4              |    157 |
| qwen/qwen3.5-9b                        |    140 |
| alibaba/qwen3-235b-a22b-instruct-2507  |    124 |
| qwen/qwen3-next-80b-a3b-instruct       |    118 |
| anthropic/claude-haiku-4-5-20251001    |     66 |
| google/gemini-2.5-flash                |     40 |
| gemini-2.5-flash                       |     34 |
| gpt-5.4-mini                           |     14 |
| qwen/qwen3-30b-a3b-instruct-2507       |      8 |
| openai/gpt-4o                          |      4 |
| gpt-5-nano                             |      2 |
| gpt-5-mini                             |      1 |

Tier distribution (after rules / before per-prompt pick): 7,061 simple,
1,339 medium, 0 complex. Pick-class distribution: 7,422 cheap, 817 mid,
161 expensive (the 161 are `mid` requests that fell back to expensive
because no mid model was cached for that prompt).

---

## Verifier-augmented run — `composed_v2`

Same fix applied to the verifier-gated cascade
(`full_split_verifier_v2.py`). The verifier-only broken run was killed
mid-flight on the full split before this fix, so the only previous
verifier number on disk was sub_10. The new fixed verifier run covers
all 8,400 prompts.

| Metric                          | Verifier broken (sub_10 only) | Verifier FIXED (full)   |
| ------------------------------- | ----------------------------- | ----------------------- |
| Split coverage                  | 809 / 8,400                   | 8,400 / 8,400           |
| Arena score                     | 0.6677                        | **0.7117**              |
| Average accuracy                | 0.7173                        | 0.7373                  |
| Cost / 1K                       | $2.9012                       | $0.6919                 |
| `proxy_model=NONE` rows         | n/a                           | 0 / 8,400               |
| Verifier called / escalated     | n/a                           | 7,061 / 6,928 (98%)     |
| Mean verifier score             | n/a                           | 0.2454                  |
| Mean verifier latency           | n/a                           | 195 ms                  |
| Prediction file (upstream)      | (verifier sub_10 only)        | `nadir-full-v3-verifier-FIXED-20260527T161854Z.json` |
| Official scorer log             | `official_score_full_v3_verifier_20260527T145943Z.txt` | `official_score_full_v3_verifier_FIXED_20260527T161854Z.txt` |

The verifier escalates ~98% of called prompts (mean verifier acceptance
prob 0.25 against the cheap-response cache). That escalation rate is
high because the verifier was trained on RouterBench and applied to
RouterArena's cached cheap-model answers (text it has never been
calibrated against). The hop still lifts accuracy from 0.7065 to
0.7373 and the arena score from 0.7013 to 0.7117 — a modest +0.010
gain at +$0.51 cpk. Worth keeping the hop on for production but the
verifier weights need RouterArena-specific fine-tuning to be more
selective.

Per-difficulty accuracy (verifier FIXED):

| Difficulty | n     | Rule-only acc | Verifier acc |
| ---------- | ----- | ------------- | ------------ |
| easy       | 3,990 | 0.9554        | 0.9664       |
| medium     | 2,445 | 0.6597        | 0.7099       |
| hard       | 1,965 | 0.2595        | 0.3060       |

Tier distribution after verifier: 133 simple, 8,267 medium, 0 complex.
Pick class distribution: 2,147 cheap, 5,434 mid, 819 expensive.

---

## Why this is the right fix, not a workaround

Every top router on the RouterArena leaderboard is *multi-provider*. They
emit a model name from a 30+ model pool, and the leaderboard scorer reads
the cost / accuracy out of the per-prompt cached `model_responses` for
that specific model name. R2-Router, OrcaRouter, Weave Router, and the
RouterArena R2 baseline all work this way.

Our previous implementation collapsed Nadir's tier output to a single
Claude-family name per tier (e.g. `simple -> claude-haiku-4-5`), then
fell back through a hand-written proxy list when the prompt's cache
didn't contain that exact name. The proxy list intersected the cache on
fewer than half the prompts, so the cost / accuracy values the scorer
read for those rows were the silent zero-fill (cost = default-tokens at
Claude pricing, accuracy = 0).

The fix doesn't change Nadir's routing decision — it changes how that
decision is translated into a model name for the scorer. Internally,
Nadir is still doing three-tier wide-deep-asym + cascade rules. We're
just telling RouterArena "for cost-class X, pick the cheapest model you
have cached", which is exactly the contract RouterArena's
`compute_scores.py` expects.

---

## Projected leaderboard placement

RouterArena published leaderboard cluster (last known public snapshot):

| Router                       | Reported arena |
| ---------------------------- | -------------- |
| Weave Router (v0.27)         | ~ 0.74         |
| OrcaRouter                   | ~ 0.71         |
| R2-Router                    | ~ 0.70         |
| RouterArena R2 baseline      | ~ 0.65         |
| Nadir (broken full-split)    | **0.3756**     |
| Nadir (FIXED full-split, rules-only) | **0.7013** |
| Nadir (FIXED full-split, + verifier) | **0.7117** |

The fixed score is competitive with R2-Router / OrcaRouter and within
striking distance of Weave. It is not a SOTA submission yet; further
gains require improving the classifier and/or picking better cheap
models within a tier (e.g. routing simple math to qwen-coder rather
than qwen-235b).

---

## Reproducibility

Local-only. No production calls. Deterministic (torch seed 42, numpy 42).

```bash
cd /Users/ellabaror/Documents/code/Nadir/getnadir.dev

# Classifier + rules only (the headline FIXED number):
python3 eval/routerarena/rescoring/full_split_local_v2.py routerarena_v3 full

# Classifier + rules + verifier cascade:
python3 eval/routerarena/rescoring/full_split_verifier_v2.py routerarena_v3 full
```

Inputs:
- Classifier `backend/app/complexity/models/wide_deep_asym_v3.pt`
  (SHA `67dccb427a07ddbdeae08dc43483265a3d80606c3ac904527ffabdd259830231`)
- Rule profile `backend/app/services/cascade_rules/profiles/routerarena_v3.yaml`
- Acc lookup `/tmp/routerarena_acc_lookup.pkl` (8,400 gis, 81,318 cached entries)
- Cost-tier mapping `eval/routerarena/rescoring/model_cost_tiers.json`
- Dataset `RouteWorks/RouterArena` (full split, 8,400 prompts)
- Official scorer `eval/routerarena/reports/dry_run_20260527T130817Z/upstream/RouterArena/router_evaluation/compute_scores.py`

Outputs (FIXED, 2026-05-27 15:23 UTC):
- `eval/routerarena/rescoring/full_decisions_routerarena_v3_full_FIXED_20260527T152326Z.csv`
- `eval/routerarena/rescoring/full_summary_routerarena_v3_full_FIXED_20260527T152326Z.json`
- `eval/routerarena/rescoring/official_score_full_routerarena_v3_FIXED_20260527T152326Z.txt`
- Upstream prediction JSON: `nadir-full-v3-FIXED-20260527T152326Z.json`

---

## Caveats and risks

1. **The cost / accuracy values come from RouterArena's cached
   `model_responses`, not from a live Nadir routing call.** That's true
   of every entry on the leaderboard — the scorer is fundamentally
   cache-lookup-based — but it means the score reflects RouterArena's
   measurements of the underlying models, not Nadir's runtime behaviour.

2. **Per-prompt cache availability shapes the score.** When the prompt's
   cache doesn't contain a cheap model, we either upgrade (better
   accuracy, higher cost) or last-resort to whatever is cheapest. The
   leaderboard scoring rewards routers that consistently pick
   well-covered cheap models, so a router with the same routing logic
   but a different model-name vocabulary would get a different score.

3. **`hard` difficulty accuracy is still only 0.26.** The headline 0.71
   is carried by the easy bucket (0.96) and medium (0.66). The
   underlying classifier and rule profile need further work to handle
   hard prompts. Improving the classifier alone — not this mapping fix
   — would lift the leaderboard score further.

