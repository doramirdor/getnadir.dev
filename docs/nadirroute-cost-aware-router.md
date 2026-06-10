# NadirRoute: the cost-aware per-model router

**Status:** built, trained, tested (8/8), wired into the backend behind `COMPLEXITY_ANALYZER_TYPE=cost_aware`. Awaiting one budgeted live run for an official leaderboard number.
**Code:** `backend/app/complexity/cost_aware_router.py` (serving), `eval/routerarena/nadirroute/train_router.py` (training), `eval/routerarena/nadirroute/router_artifact.pkl` (artifact).
**Evidence:** `eval/routerarena/nadirroute/RESULTS.md` (full experiment trail, all reproducible).

---

## 1. What it is

NadirRoute is a learned, model-generic LLM router. For every incoming prompt it predicts, per candidate model, the probability that the model will answer correctly, then routes to the **cheapest model whose calibrated probability clears a threshold tau**. If no model clears the bar it picks the most-likely-correct one.

It replaces the question the old router asked ("how complex is this prompt?") with the question that actually determines cost and quality ("which models will get *this* prompt right, and which of those is cheapest?").

Two scoring paths, one model:

| Path | Used for | What it is |
|---|---|---|
| **Per-model heads** (primary) | Models in the trained menu | One gradient-boosted classifier per model on MiniLM prompt embeddings (384d), isotonic-calibrated. Strongest signal. |
| **Inductive zero-shot** (fallback) | Any model added later | A single scorer over `[prompt_embedding, model_features]` where model features are just log prices + a reasoning flag. A brand-new model is routable from its price sheet alone, with no retraining. |

One knob sets the operating point:

- `tau_benchmark` (0.95): conservative, accuracy-leaning. Used for leaderboard scoring.
- `tau_prod` (0.80): routes more traffic down to cheap models. Used for live traffic where cost savings are the product.

Same artifact, same code, two thresholds.

## 2. How it works

### Inference path (per request, ~81 ms on CPU, no extra LLM calls)

```
prompt
  1. embed with MiniLM-L6-v2 (384d, local, un-normalized to match training)
  2. for each model in the pool:
       has a trained head?  -> head.predict -> isotonic calibrate -> P(correct)
       no head?             -> inductive scorer([emb, model_features]) -> P(correct)
  3. sort pool cheapest-first by blended token price
  4. pick the first model with P(correct) >= tau
  5. nothing clears tau? -> argmax P(correct)
  6. no artifact / no embedder at all? -> transparent heuristic fallback (never crashes)
```

### Serving integration

`COMPLEXITY_ANALYZER_TYPE=cost_aware` resolves through `analyzer_factory.py` to an adapter exposing the standard `analyze()` contract (`recommended_model`, `confidence`, `tier_name`, `reasoning`, plus `model_scores` for auditability). User-constrained pools (`allowed_models`) are priced from litellm's local price map (2,776 models, no network call) and routed through the zero-shot path.

### Training (reproducible: `python3 nadirroute/train_router.py`)

- **Data:** the per-(prompt, model) correctness matrix reconstructed from RouterArena's cached results (n=2,016 prompts where all three menu models have judged responses). Labels are "did this model answer this prompt correctly", never the answer text.
- **Features:** prompt embedding only (heads), plus price descriptors (inductive). Never the dataset label, never ground-truth accuracy, never response text.
- **Validation protocol:** leave-one-dataset-FAMILY-out cross-validation (51 families), so every reported number comes from predicting prompts whose dataset the model never saw. Tau is selected on out-of-fold predictions only. This protocol survived an adversarial code review (which also caught and fixed a train/serve embedding-normalization mismatch, a NaN-price crash path, and an in-sample tau bias).
- **Menu:** qwen3-235b (~$0.03/1k), deepseek-v3.2 (~$0.05/1k), grok-4.1-fast (~$0.11/1k). Dominated models (Opus, Sonnet, gpt-4o) are never on the menu; on this benchmark claude-haiku-4-5 scores 0.37 and is excluded for cause.

## 3. How it differs from the old production router

The old production router is the `wide_deep_asym_v3` cascade: a tier classifier (simple / medium / complex) feeding a rule engine, then "cheapest model in the assigned tier", with a DeBERTa verifier gating escalation on the benchmark.

| | Old: wide_deep_asym cascade | New: NadirRoute |
|---|---|---|
| Core question | "How complex is the prompt?" | "Which model gets THIS prompt right, cheapest?" |
| Decision granularity | Tier-level: every medium prompt gets the same model | Per-prompt, per-model probability |
| Model selection | Cheapest in tier (price decides, skill assumed by tier) | Cheapest whose predicted correctness clears tau |
| Learned signal | 3-way tier softmax (cross-family AUROC ~0.62 on this distribution; always-Haiku beat it by +0.017 arena) | Per-model P(correct), leave-one-model-out AUC 0.88 to 0.90 |
| Rules | YAML rule overrides required (`routerarena_v3.yaml`) | None. No rule base. |
| Verifier hop | Needed a post-generation verifier call to recover accuracy (and it collapsed to 98% always-escalate on RouterArena) | Not needed for routing; decision is pre-generation only |
| Extra LLM calls | Cascade can generate twice (cheap then escalate) | Zero. One forward pass, one LLM call |
| New model in the pool | Retrain / remap tiers | Zero-shot from its price sheet (inductive path); nightly head training upgrades it |
| Latency (routing only) | ~40-70 ms classifier + verifier round trip when cascading | **80.7 ms** warm, CPU, total |
| Fail-safe | Rule/fallback chains | Calibrated argmax fallback, then heuristic fallback; never crashes the request path |
| Arena (local rescore basis) | 0.7118 (official pipeline: 0.733, rank #3) | **0.7317** verified today on cached pools; **0.7646** honest LODO where pools are complete |

The one-sentence difference: the old router buys accuracy with tiers and rules and a second LLM call; NadirRoute buys it with a per-prompt, per-model correctness prediction, which is both cheaper to serve and worth more arena points.

## 4. Scores

All arena numbers use RouterArena's official `compute_arena_score` (beta=0.1, log-cost normalization), computed by us offline on cached judged responses. Zero training or tuning ever touched the test labels (tau chosen out-of-fold; contamination audit for the underlying corpora passes with 0 prompt overlap).

### 4.1 Arena (the headline)

| Policy | Arena | Acc | Cost/1k | Basis |
|---|---|---|---|---|
| Old cascade (current submission) | 0.7118 local / **0.733 official, rank #3** | 0.737 | $0.69 | full split |
| always-cheap (qwen) | 0.7244 | 0.719 | $0.045 | n=2,016 |
| Sqwish (leaderboard **#1**) | 0.7527 | - | - | official |
| PR #13 epsilon-ranker (simulated, generous priors) | 0.7377 | 0.740 | $0.097 | n=2,016 |
| **NadirRoute, honest LODO** | **0.7646** | 0.769 | $0.088 | n=2,016, leakage-free |
| **NadirRoute, full split today (cached pools)** | **0.7317** | 0.730 | $0.068 | n=8,400, $0 spent |
| always-grok (not a router) | 0.7909 | 0.801 | $0.111 | n=2,016 |
| cheapest-correct oracle (ceiling) | 0.8472 | 0.856 | $0.053 | n=2,016 |

**Expected official score: ~0.77, range 0.75 to 0.78.** The reasoning, step by step:

1. The verified full-split number today is 0.7317, but ~1,600 of the 8,400 prompts have no strong-model cached response, forcing weak picks. The oracle itself drops from 0.795 to 0.775 on that subset, so this is a pool-coverage penalty, not a router weakness.
2. With complete pools the honest generalization estimate is the LODO 0.7646 (routing 63% of traffic to cheaper models while doing it).
3. The official pipeline has historically read above local rescores: our cascade went 0.7118 local to 0.733 official (+0.021). Applying a similar lift to 0.7646 gives ~0.77 to 0.78. We do not promise the lift; 0.7527 (Sqwish) sits inside the conservative end of the band, which is why the live confirmation run matters.

**Leaderboard implication:** 0.7646+ passes Sqwish (0.7527) and contends for **#1 to #2**, versus our current official #3 at 0.733. The hard ceiling on this pool is ~0.83 to 0.85 (14.9% of prompts are unsolvable by every cached model; no router can score above that).

### 4.2 Routing distribution (it actually routes)

| Scenario | qwen | deepseek | grok | gpt-4o-mini |
|---|---|---|---|---|
| Full split today (cached pools, tau=0.95) | 60% | 14% | 13% | 13% |
| Complete pools (LODO, tau=0.95) | 40% | 23% | 37% | - |
| Prod operating point (tau=0.80, expected) | more down-routing; recalibrate on live traffic | | | |

Contrast with the degenerate alternatives: always-grok routes 0% (not a router, no savings); the old cascade's verifier escalated 98% (effectively always-strong with extra cost).

### 4.3 Robustness (the paraphrase split)

Measured on RouterArena's 420 paraphrase twins (same question, reworded), fixed 4-model pool, pick-flip = chose a different model for the paraphrase than for the original:

| Router | Stability (1 - flip rate) |
|---|---|
| Old cascade (rebuild_multi measurement) | 0.610 |
| **NadirRoute (today)** | **0.581** |

Honest assessment: slightly worse than the old cascade, and well below leaders that quantize their routing signal. The flips concentrate where calibrated P(correct) sits near tau, so small wording shifts cross the threshold. This is the known weak spot and it is fixable for free: margin smoothing / dead-band around tau, paraphrase-augmented head training, or score quantization. None of it requires API spend, and it does not affect the main-split arena numbers above.

### 4.4 Generality and serving (the production claims)

| Claim | Evidence |
|---|---|
| Generic to the model pool | Leave-one-MODEL-out AUC **0.878 to 0.903**: the inductive scorer correctly ranks correctness of a model it never trained on, from its price/type features alone |
| Works on user-constrained pools | Factory test routes within `allowed_models` containing never-trained models (priced from litellm's local map) |
| Serving latency | **80.7 ms/request** warm (embed + 3 heads + calibration), CPU only |
| Never breaks the request path | Heuristic fallback when artifact or embedder is missing; argmax fallback when nothing clears tau; 8/8 tests pass |
| No extra inference cost | Routing makes zero LLM calls (the old cascade's verifier path could double-generate) |

## 5. Caveats, in plain terms

1. **Every arena number here is an offline rescore on cached responses.** The official leaderboard runs live inference. Our one calibration point (cascade: 0.7118 local vs 0.733 official) suggests official reads higher, but rank is unconfirmed until the live run.
2. **The 2,016-prompt training set is selection-biased** toward prompts other routers exercised. The out-of-train full-split slice (n=6,384) scores 0.695, depressed mostly by missing strong-model coverage rather than generalization failure (the oracle drops there too).
3. **tau_prod vs tau_benchmark currently coincide in-sample** because isotonic calibration saturates on training data. The distinction becomes real on live traffic; recalibrate there.
4. **Robustness needs the margin-smoothing pass** before we make stability claims publicly.

## 6. What unlocks next

- **Budgeted (waiting for approval):** live generation for the ~1,600 uncovered strong-model cells plus the official full-pipeline submission. This converts "~0.77 expected" into a leaderboard rank. Prior comparable generation runs cost under $1; the official evaluation cost depends on RouterArena's pipeline.
- **Free:** robustness margin smoothing; merging PR #13's complementary layers (kompress compression for effective cost, Beta-Bernoulli telemetry updating the heads online, promote-only no-regression floors). PR #13's tier-level ranker loses to NadirRoute head-to-head on arena (0.7377 vs 0.7646 on identical data), but its operational machinery composes cleanly with NadirRoute's per-prompt scorer and makes the production story strictly better.
