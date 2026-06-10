# Satisfaction Predictor — f(prompt, model) → P(task satisfied)

**Module:** `backend/app/complexity/satisfaction_predictor.py`

## What it is

A pre-dispatch predictor of whether a given model will satisfy a given task —
the per-query *joint* signal that tier-based routing lacks (the tier describes
the prompt alone; per-model stats describe the model alone). "Satisfied" is
defined by data Nadir already records in `cascade_decisions`:

```
satisfied := verifier accepted (score ≥ acceptance threshold) AND not escalated
```

## The model

Hierarchical Beta-Bernoulli with backoff — training-free, stdlib-only,
calibrated probabilities. The prompt enters through its context (tier +
semantic cluster_id), and evidence is aggregated at four levels, each shrunk
toward its parent with `k=20` pseudo-counts:

```
prior(model, tier)                       sigmoid((quality_index − difficulty(tier)) / 12)
  └─ (model)                             global outcomes
       └─ (tier, model)                  outcomes on this difficulty band
            └─ (cluster, model)          outcomes on this kind of prompt
                 └─ (user, cluster, model)   this tenant's traffic
```

With no evidence the prediction is exactly the prior; specific evidence
overrides broad evidence in proportion to its sample size. Decisions use the
posterior **lower confidence bound**, so a handful of lucky outcomes can't
clear a dispatch bar the prior wouldn't clear.

The logistic prior (difficulty 25/45/65 per tier, scale 12) is a heuristic
calibration; once verifier labels accumulate it should be replaced by a
fitted calibration (isotonic regression) — the hierarchy above it is
unchanged by that swap. A trained upgrade path also already exists in-tree:
the two-tower analyzer (TF-IDF prompt tower × model embeddings) is
f(prompt, model)-shaped and can be re-trained on these verifier labels to
replace the cluster bucketing with a learned prompt representation.

## Dispatch rule

```python
pick, ranked = select_cheapest_satisfying(candidates, tier, cluster_id=..., evidence=...)
```

Cheapest candidate whose satisfaction LCB clears the threshold (default
0.85); if none qualify, the highest-predicted model gets the task. Unknown
pricing (cost ≤ 0) never wins on cost. The annotated ranking doubles as the
cascade escalation order.

## How it composes with the rest of the PR

- **model_ranker** answers *"cheapest within ε of the best quality"*
  (relative, per-tier). The predictor answers *"will this model satisfy this
  task at all"* (absolute, per-prompt-context). Wired together, the floor set
  can additionally be filtered by satisfaction LCB.
- **cascade_router** gets a principled pre-dispatch choice of cheap model
  (today's cheap model is fixed per preset) and an evidence-ranked
  escalation chain.
- `evidence_from_cascade_rows()` consumes the exact columns
  `cascade_router._log_decision()` persists; the periodic DB refresh is the
  same Cycle-2 task as the ranker's EWMA feed.

## Wiring plan (follow-up)

1. Background job: aggregate `cascade_decisions` (joined with cluster_id and
   tier from request analytics) into `SatisfactionEvidence`, refreshed every
   few minutes, cached in-process.
2. Shadow mode: log `select_cheapest_satisfying` picks alongside production
   picks; compare verifier outcomes.
3. Active: use as the cascade's cheap-model selector; then as a floor-set
   filter in the ranker.
4. Calibration: fit the prior on accumulated (quality_index, tier, outcome)
   triples; later, retrain the two-tower on verifier labels for a learned
   prompt representation.
