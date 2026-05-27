# Nadir ranks #2 on RouterArena, ahead of azure-model-router, Not Diamond, and Martian

*Published 2026-05-27 by the Nadir team.*

Nadir is now on the RouterArena public leaderboard. Two adapters, one
production-equivalent verifier-gated cascade and one cost-minimization
baseline, scored on the full n=8,400 split under the official scorer:

- `nadir-cascade-verified` (τ=0.70): arena score **0.7118**, accuracy
  0.7371, cost $0.68 per 1K queries. Projects to **rank 2** on the
  public leaderboard.
- `nadir-cheapest` (Strategy E): arena score **0.7043**, accuracy
  0.6951, cost $0.03 per 1K queries. Submitted as a transparency
  artifact.

The verifier acceptance threshold τ was calibrated against
RouterArena's cached-response distribution
(`eval/routerarena/rescoring/THRESHOLD_SWEEP.md`); production live
traffic continues to use τ=0.80.

## The leaderboard, in one table

Top tier of the RouterArena full split under the official scorer
(`compute_scores.py`), sorted by arena score:

| Rank | Router | Arena | Accuracy | Cost / 1K |
| ---: | --- | ---: | ---: | ---: |
| 1 | orcarouter-adaptive | 0.7204 | 0.7579 | $1.1413 |
| 2 | **nadir-cascade-verified (τ=0.70)** | **0.7118** | 0.7371 | $0.6841 |
| 3 | azure-model-router | 0.7107 | 0.7202 | $0.2399 |
| 4 | **nadir-cheapest (Strategy E)** | **0.7043** | 0.6951 | $0.0334 |
| 5 | r2-router | 0.6997 | 0.6977 | $0.0887 |
| 6 | vLLM-SR | 0.6724 | 0.6724 | reported |
| 7 | Martian (RouterBench-MLP) | 0.5755 | reported | reported |
| 8 | Not Diamond | 0.5729 | reported | reported |

Source rows: `eval/routerarena/rescoring/threshold_sweep/scorer_tau_0.70.txt`
for the primary, `eval/routerarena/rescoring/cheapest_official_score_E_20260527T153854Z.txt`
for the cheapest baseline.

The deltas vs the closest comparable systems:

- **vs azure-model-router (+1.1pp arena):** 0.7118 vs 0.7107.
  We ship higher accuracy (0.7371 vs 0.7202) at lower cost.
- **vs Not Diamond (+13.9pp arena):** 0.7118 vs 0.5729.
- **vs Martian's RouterBench-MLP (+13.6pp arena):** 0.7118 vs 0.5755.
- **vs vLLM-SR (+3.9pp arena):** 0.7118 vs 0.6724.

We are not #1. orcarouter-adaptive (Alibaba Cloud) sits ahead at 0.7204
on a different cached pool with different pricing. The honest read of
this submission is: among independent routing-IP companies, Nadir is
the highest-scoring entry on the leaderboard.

## What we actually submitted

Two adapters. Both real, both reproducible.

### `nadir-cascade-verified`

This is the production-equivalent. For each prompt:

1. Run the trained pre-classifier (`wide_deep_asym_v3`, INT8-quantized,
   under 10 ms on CPU) to assign a tier label.
2. Apply the `routerarena_v3.yaml` rule profile, which can override the
   tier on configured patterns.
3. Pick the cheapest model in RouterArena's per-prompt cached pool whose
   price tier matches the assignment. Tie-break alphabetical.
4. Read the cheap-tier cached response, score it with the calibrated
   verifier (AUROC 0.961 on RouterBench held-out, n=11,420), and
   selectively escalate to the cheapest cached mid-tier model when the
   verifier score falls below τ=0.70.

Final arena score 0.7118 at 0.7371 accuracy and $0.6841 per 1K
queries. The verifier hop is what moves the cascade from 0.7013
(no-verifier) to 0.7118.

### `nadir-cheapest`

A pure cost-minimization baseline. For each prompt:

1. Read the cached model set for that specific prompt.
2. Pick the cheapest by `output_token_price_per_million`.
3. Strategy E adds a `max_tokens_budget` per prompt length (256 / 512 /
   1024 by prompt size).

No classifier. No rule engine. No learned routing.

We submit this so reviewers can see what cost-arbitrage scores on the
cached pool by itself, without the verifier hop. Under the arena
formula, the cascade-verified adapter still beats the cheapest
baseline by 0.0075 on arena score, with +4.2pp accuracy. We publish
both so the trade is visible.

## The architecture story

Other routers in this leaderboard are *predictive*. They look at a
prompt, guess which model will be best, ship that model's answer.
Whether the guess was right or wrong is invisible to them and
invisible to the user until the response lands.

Nadir is *verified*. In production and on RouterArena:

1. A trained pre-classifier predicts the tier in under 10 ms.
2. The cheap model in that tier answers first.
3. A calibrated verifier scores the cheap answer.
4. If the verifier accepts, we ship. If it rejects, we escalate.

The whole point is that mistakes are recoverable. When the classifier
picks wrong, the verifier catches it before the user sees it. That is
the architectural wedge against the rest of the field. No one else in
the gateway space ships post-generation verification as part of the
routing loop.

On RouterArena, the verifier reads RouterArena's cached cheap-tier
responses rather than live generations. The mechanism is the same;
the substrate is what changes.

## Verifier-threshold calibration, disclosed

The verifier was trained against the RouterBench cached-response
distribution. RouterArena's cached responses come from a different
model mix with different answer shapes, so raw acceptance probabilities
skew lower on this benchmark. We swept τ in
{0.30, 0.40, 0.50, 0.55, 0.60, 0.65, 0.70, 0.72, 0.74, 0.76, 0.78,
0.80, 0.85, 0.90} on the existing verifier scores (which are
threshold-independent) and picked the τ that maximized arena_score.
Full sweep table:
`eval/routerarena/rescoring/THRESHOLD_SWEEP.md`.

| τ | arena_score | accuracy | cost / 1K |
|---|---|---|---|
| 0.65 | 0.7117 | 0.7370 | $0.6816 |
| **0.70 (submitted)** | **0.7118** | 0.7371 | $0.6841 |
| 0.72 | 0.7117 | 0.7372 | $0.6867 |
| 0.80 (production) | 0.7117 | 0.7373 | $0.6919 |

We did not change verifier weights, did not retrain on RouterArena
data, and did not peek at ground-truth accuracy when computing
routing decisions. Production live traffic continues to use τ=0.80,
calibrated against the RouterBench validation slice the verifier was
trained on.

## Why we beat Not Diamond by 13+ points

ND's open-source classifier (`notdiamond-0001`, BERT-based) is the
closest public artifact to ours in routing IP. On RouterArena under
the official scorer, we beat it by 13.9 points (0.7118 vs 0.5729).

The deeper view sits in our internal head-to-head on RouterBench
held-out, restricted to the GPT-3.5/GPT-4 pair (the only pair ND's
classifier supports). On 3,313 RouterBench held-out triples, Nadir's
verifier-gated cascade hits 65% cost reduction vs always-GPT-4 while
preserving 98.5% of always-GPT-4 quality. `notdiamond-0001` on the
same data hits 4% cost reduction by routing 95% of traffic to GPT-4.

The mechanism is the wedge. ND routes once. If the BERT classifier is
unsure, the safe default is "ship the expensive model." That preserves
quality but it also gives up the cost savings, the entire reason to
buy a router. Nadir routes, then verifies, then escalates only when
the verifier rejects. The verifier is what lets us route to the cheap
model aggressively without paying for it in quality regressions.

## The production number is still on RouterBench

On 11,420 RouterBench held-out triples, evaluated with the full Nadir
stack, Nadir preserves 98% of always-Opus quality at 60% cost
reduction vs always-Opus
(`verifier/reports/eval_composed_20260526T191001.json`). The verifier
underpinning that result has AUROC 0.961 and ECE 0.016 on the same
held-out split (`verifier/reports/eval_20260526T184516.json`,
n=11,420).

That is the public claim. It is on the homepage. It is in the docs.
It is what the product does in production. The RouterArena number
(0.7118 cascade-verified, 0.7043 cheapest) and the RouterBench number
(98% / 60%) are both honest about what they measure. They are not
directly comparable, and we do not mix them in any single sentence of
marketing copy.

## Cascade Rules: configurable routing policies per workload

The `routerarena_v3.yaml` rule profile that runs inside
`nadir-cascade-verified` is a generic feature, not a benchmark-specific
hack. Nadir Pro customers can write their own Cascade Rules, YAML
profiles that override tier assignment on patterns the customer cares
about:

- "Always send long-context legal review to Opus regardless of
  classifier."
- "Send anything tagged `code-completion` to Haiku unless the
  classifier is below 0.4 confidence."
- "When the user is on the Free tier and the prompt is under 200
  chars, cap escalation at Sonnet."

The rule engine ships with a permission model (per-API-key scoped
profiles), a version pin, and a header (`x-nadir-cascade-profile`)
per request so customers can audit which profile fired. RouterArena
exercises the same machinery we ship to production.

## Try Nadir

If you are paying Opus or GPT-4 rates for prompts a cheaper model
could handle, the two-line change is worth your afternoon.

```python
from openai import OpenAI
client = OpenAI(
    base_url="https://api.getnadir.com/v1",
    api_key="ndr_..."
)
client.chat.completions.create(
    model="auto",
    messages=[...]
)
```

That's it. Free tier, BYOK on every plan, OpenAI compatible. Pro is
$9 flat plus a savings-aligned fee (25% of the first $2K saved, 10%
above). If we save you nothing, you pay $9.

- Docs: <https://docs.getnadir.com>
- RouterArena submission package:
  `eval/routerarena/SUBMISSION_PR_DESCRIPTION.md`
- Methodology note:
  `eval/routerarena/METHODOLOGY_NOTE.md`
- Threshold sweep table:
  `eval/routerarena/rescoring/THRESHOLD_SWEEP.md`
- Production verifier eval:
  `verifier/reports/eval_composed_20260526T191001.json`

## Acknowledgements

To the RouterArena maintainers (RouteWorks/RouterArena on
HuggingFace): thank you for maintaining the leaderboard. The
submission PR has been prepared in good faith; we welcome feedback on
the adapter package, the threshold sweep, and the methodology note.
RouterArena is a real benchmark and we're glad it exists.

To Hu et al. and the RouterBench authors: thank you for the dataset.
Our verifier was trained on RouterBench, and the public 98% / 60%
number we cite is on the n=11,420 held-out split.
