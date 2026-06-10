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
   honest behavioral signal). With `n=0` this is exactly the static
   `quality_index` — **cold start ≡ the legacy quality prior by construction**.
3. **Lower confidence bound.**
   `q_lcb = q_hat − 1.64·sqrt(q_hat(1−q_hat))·sqrt(n)/(k+n)` — zero at cold
   start, peaks while evidence is thin, decays ~1/√n. The conservative-bandit
   principle applied to admission: noise pushes toward the static ranking,
   never away from it.
4. **Quality floor.** `floor = max(q_lcb over healthy pool) − ε(tier)·confidence`
   with ε = 0.15 / 0.05 / **0.0** for simple / medium / complex. LCB-to-LCB
   comparison: a candidate displaces the incumbent only when its conservative
   estimate beats the incumbent's conservative estimate.
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
`RANKER_Z_SCORE`, `RANKER_MIN_HEALTH`, `RANKER_PROMOTE_CONFIDENCE`,
`RANKER_PIN_STATIC_TOP`).

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
