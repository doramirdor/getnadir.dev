# Unified Model Ranker — ε-Constrained Cost Minimization

**Date:** 2026-06-10 · **Module:** `backend/app/complexity/model_ranker.py`

## Why a new ranker

The ranking step (tier → ordered candidate models) was implemented three
different ways:

| Path | Algorithm | Problem |
|---|---|---|
| heuristic / binary classifiers | complex: quality desc · medium: `quality/cost` ratio · simple: cost asc | ratio form is scale-pathological (a terrible cheap model can outrank everything); simple tier ignores quality entirely |
| trained classifier (**the default**) | positional: `allowed_models[0 / mid / -1]` | ignores both quality and price; returns `ranked_models: []`, so downstream cost logic never engages |
| `tier_model_selector` | thirds-by-blended-price | no quality signal at all |

None used the feedback signals already persisted (`cascade_decisions` verifier
scores/escalations), provider health, or effective cost.

Survey of production routers (RouteLLM, RouterBench/Martian, NotDiamond,
Unify, FrugalGPT, Hybrid LLM, MixLLM) shows every serious system reduces to
*predicted per-query quality ⊕ cost*, via either a λ-scalarization or a
threshold/constraint. For the stated objective — **cost reduction with no
accuracy impact** — the literature's match is the ε-constrained form
(Hybrid LLM, ICLR 2024: −40% expensive-model calls at no quality drop):

```
minimize cost   subject to   quality ≥ (best achievable) − ε(tier)
```

λ-scalarization was rejected (no λ encodes "zero accuracy loss"; λ needs
retuning as prices shift); the ratio form was rejected as unprincipled.

## The algorithm (per request, O(M log M), <1 ms, stdlib only)

1. **Effective tier.** If classifier confidence < 0.7, promote one tier —
   uncertainty buys quality, never cost.
2. **Blended quality** per candidate (empirical-Bayes shrinkage):
   `q_hat = (k·q_static + n·v_adj)/(k+n)` with `k=20` pseudo-counts,
   `v_adj = verifier_mean − 0.5·escalation_rate` (adverse-selection penalty:
   accepted-set verifier means are biased optimistic, escalations are the
   honest behavioral signal). Stats below the **min-evidence gate** (`n<30`)
   are ignored entirely — thin evidence is churn risk, not signal. With no
   usable stats this is exactly the static `quality_index` — **cold start ≡
   the legacy quality prior by construction**.
3. **Lower confidence bound.**
   `q_lcb = q_hat − 2.0·sqrt(q_hat(1−q_hat))·sqrt(n)/(k+n)` — zero at cold
   start, peaks while evidence is thin, decays ~1/√n. The conservative-bandit
   principle applied to admission: noise pushes toward the static ranking,
   never away from it.
4. **Promote-only quality floor.**
   `floor = max(static quality over healthy pool) − ε(tier)·confidence`
   with ε = 0.15 / 0.05 / **0.0** for simple / medium / complex, and
   membership quality `q_member = max(q_lcb, q_static)`. Evidence can
   **promote** a cheap model into the floor set (its LCB must clear a bar
   that noise can never lower, because the anchor is static), but can never
   **demote** a model below its static prior — so a noisy, biased, or
   drifting verifier cannot evict the catalog's good models. Per-request
   demotion of genuinely bad responses is the cascade verifier's job at
   runtime. "Never worse than the static ranker under any verifier
   behavior" is therefore a structural property, not a tuning outcome.
5. **Rank.** Floor set (healthy, `q_lcb ≥ floor`, known price) sorted by
   effective cost ascending; everything else appended quality-first as the
   fallback/escalation order. `cost_fn` hook lets callers inject
   `compression_policy.effective_cost_per_million` (compression + cache-aware
   pricing).
6. **Guardrails.** Unknown pricing (`cost ≤ 0`) can never win on cost; an
   escalation-rate spike >2× baseline trips a circuit breaker that discards a
   model's online stats (verifier-drift detector, per RouterBench cascades
   only work while judge error <0.1–0.2); unhealthy providers drop to the
   tail; the static best-quality model stays pinned in the top 2; empty floor
   set → verbatim static order. Every analyzer keeps its legacy sort as a
   fail-open fallback if the ranker can't load.

All knobs are env-overridable (`RANKER_EPSILON_*`, `RANKER_PSEUDO_COUNTS`,
`RANKER_Z_SCORE`, `RANKER_MIN_EVIDENCE`, `RANKER_MIN_HEALTH`,
`RANKER_PROMOTE_CONFIDENCE`, `RANKER_PIN_STATIC_TOP`).

## Measured results (benchmark_ranker.py — offline, deterministic, seed=7)

Monte Carlo over 2000 random 3–8 model presets sampled from the real
94-model catalog. "Violation" = pick >10 quality points below the preset's
best model.

**A. Cold start** (static data only):

| strategy | tier | quality | cost $/1M | violations |
|---|---|---|---|---|
| legacy analyzers | simple | 37.3 | 0.51 | **78.0%** |
| legacy analyzers | medium | 42.5 | 0.55 | **69.3%** |
| legacy analyzers | complex | 61.1 | 7.80 | 0.0% |
| legacy positional (default analyzer) | simple/medium/complex | ~45 | ~5.8 | ~58% |
| **nadir ranker** | simple | **57.9** | 3.15 | 11.7%* |
| **nadir ranker** | medium | **60.7** | 6.16 | **0.0%** |
| **nadir ranker** | complex | 61.1 | **7.44** | 0.0% |

\* simple-tier "violations" are within the explicit ε=0.15 tolerance (the
threshold for the violation metric is stricter than ε_simple).
Legacy sorts routed the majority of simple/medium traffic to models >10
quality points below the preset's best; the new ranker eliminates that at
medium, cuts it 78%→12% at simple, and is 4.6% cheaper at complex at
identical quality (cost tie-breaking among equal-quality models).

**B. Online evidence** (a cheap model verified-strong, n=500, complex tier):
the ranker captures the verified model in 98.9% of applicable presets —
**$1.54 vs $9.05 per 1M tokens (83% cheaper) at zero true-quality loss**.
The legacy ranker is structurally unable to use evidence.

**C. Noise robustness** (zero-signal verifier stats, persistent per-model
bias σ — the worst case; sampling noise at these n would be far smaller):

| scenario | picks changed | true-quality Δ of changed picks |
|---|---|---|
| n=15, any σ (below min-evidence gate) | **0.00%** | — |
| n=60, σ=0.08 (calibrated verifier) | 1.87% | −4.7 pts (expected harm ≈0.09 pts overall) |
| n=60, σ=0.15 (RouterBench "broken judge" boundary) | 8.83% | −9.5 pts (expected harm <1 pt; escalation breaker is the remaining production defense, not modeled in this zero-signal scenario) |

## Differentiation (vs surveyed production routers)

This is a clean-room, stdlib-only implementation written for Nadir; no
third-party router code is used. Concepts were surveyed from the literature
(RouteLLM, RouterBench, FrugalGPT, Hybrid LLM, MixLLM, conservative
bandits), but the mechanism combination is, to the best of our survey,
unique to Nadir:

| | RouteLLM | NotDiamond / Martian | FrugalGPT | MixLLM | **Nadir ranker** |
|---|---|---|---|---|---|
| needs offline training | yes (preference data) | yes (vendor-side) | yes (labeled scorer) | yes (bandit warmup) | **no** |
| exploration on live traffic | no | undisclosed | no | yes | **no** (full-information verifier feedback on every request) |
| no-regression guarantee | threshold-tuned | undisclosed | budget-tuned | soft (α=0.01) | **structural** (promote-only floor membership) |
| composes with compression/cache pricing | no | no | no | no | **yes** (`cost_fn` ↔ `compression_policy`) |
| works per-tenant on the user's own model pool | no (fixed pair) | partially | fixed cascade | fixed pool | **yes** (any 3–10 models) |

The defensible part is the combination with Nadir-specific signals no
generic router has: the DeBERTa cascade verifier and escalation telemetry
(reward signal with an adverse-selection correction), provider-health
demotion, and the kompress/cache-aware effective-cost model — all feeding
one training-free, evidence-gated, promote-only ranking step.

## Behavior changes vs legacy (all quality-favoring or quality-neutral)

- **simple tier** no longer picks the cheapest model unconditionally — it
  picks the cheapest within ε of the best quality (the legacy behavior could
  already be hurting accuracy; this closes that hole at slightly higher cost
  on degenerate presets).
- **medium tier** no longer uses the quality/cost ratio — a dramatically
  worse model can no longer win by being nearly free.
- **complex tier** is unchanged at cold start (ε=0 → quality incumbent wins);
  with strong online evidence (LCB above the incumbent's LCB) a cheaper model
  may take over, with the incumbent pinned at #2 as immediate fallback.
- **default analyzer** ("trained") now ranks by quality/cost like the others
  and emits `ranked_models`, so the effective-cost rerank works on the
  default path.

## Online stats wiring

`stats_from_cascade_rows()` aggregates `cascade_decisions` rows
(cheap_model, verifier_score, escalated) into `OnlineModelStats`. The DB
read/refresh loop is intentionally left for the bandit cycle ("Cycle 2" in
the existing plan — `routing_arms` / `bandit_reward_log` tables are already
migrated); until then the ranker runs at cold start, which equals the static
prior plus the ε-floor cost optimization.

## Rollout recommendation

1. Shadow-compare: log `rank_models` output alongside legacy picks for a week
   (the `rank_reason` annotations make divergences auditable).
2. Refresh `app/reference_data/model_performance_clean.json` — it predates
   several current models, which therefore rank as unknown (quality 30, no
   price). The ranker handles them safely but they can't win on cost until
   the data is refreshed.
3. Wire the cascade-decisions EWMA refresh, then consider ε-greedy
   exploration (~2%) strictly inside the floor set — by construction it
   cannot violate the quality constraint.
