# WATERLINE — Baseline-Anchored Adequacy Routing with a Per-Candidate Capability Floor

**Status:** Design (approved for prototyping)
**Codename:** WATERLINE (internal project label: "Nadir V2")
**Owner:** Router architecture
**Composes with:** FLIGHTPLAN / Router V3 (plan-space knobs, `docs/ROUTER_V3_DESIGN.md`), NadirRoute (per-model heads), cascade verifier (`backend/app/services/verifier_model.py`)
**Suggested filename:** `getnadir.dev/docs/ROUTER_WATERLINE_DESIGN.md`
**Zero-spend constraint:** trainable and evaluable offline from licensed local data. Paid inference is *bounded and itemized* (§5.3 / §6.5), not "one $0.5–10 probe." The line items: per-hosted-model probe batteries, and a baseline-B output-relabeling run for open-ended traffic. Local Ollama probes are compute-only (free).

---

## 0. TL;DR

Today Nadir classifies a request into an absolute `simple/medium/complex` bucket and looks up the model the tenant mapped to that bucket. That primitive is wrong in two ways: (1) "difficulty" has no absolute meaning — it is only meaningful **relative to a declared baseline model B**; and (2) "cheaper than B" is not the same as "capable enough for this request," so a tenant who maps the `simple` tier to a tiny local model lets that model silently fail on requests that are *easy for Fable 5 but objectively hard*.

WATERLINE replaces classify-then-lookup with a **per-(request, candidate, baseline) adequacy** decision and adds a second, baseline-free **absolute capability floor**:

- The tenant declares **only their baseline B** (e.g. `claude-fable-5`). Nadir derives the cheaper ladder itself and reroutes underneath.
- A request is routed **down** to candidate M only if (a) M's own variance-aware absolute capability clears a difficulty-scaled floor (the **capability floor** — the *waterline*; this is the verifier's native strength) **AND** (b) M is predicted to **match B** on this request (the relative bar — the genuinely-new, must-retrain signal).
- The capability floor references **neither price nor B**. It is the structural fix for the tiny-Ollama failure mode and is **not a tenant-overridable knob**.
- If no candidate clears both gates, Nadir **fails UP to B** — never down.

It is built largely from components that already exist (`select_plan`, the cascade verifier reused for the **absolute** term, NadirRoute per-model heads, the Mondrian conformal floor), plus one new low-rank relative-scoring head, one new difficulty signal, and the variance-aware capability-floor path (`p_LCB`/`Σ_M`/probe battery) that is **designed but not yet built**. It routes **down** (one cheaper call) — the opposite economic bet from OpenRouter Fusion, which routes **up** (3–5 model panel + judge + synthesizer at ~4–5× a single call).

> **Important framing.** The canonical Nadir eval (60% cheaper / ~98% quality / n=11,420 held-out RouterBench triples / verifier AUROC 0.961, ECE 0.016, catastrophic ~1.7% at τ=0.8 / 2.4% at τ=0.7) was measured under **baseline = always-Opus** and **task = absolute correctness**. WATERLINE changes *both* the baseline (tenant-declared B) and, for the relative bar, the *task* (match-vs-B). Those numbers are therefore **not** automatic pass-criteria for WATERLINE; they must be re-measured freshly under B (§6.4).

---

## 1. Problem statement

### 1.1 Absolute difficulty buckets are meaningless

The production stack (`wide_deep_asym`, NadirRoute, and FLIGHTPLAN Stage A) all assign requests to fixed `simple/medium/complex` categories. Those labels are absolute — they describe the request, not its relationship to any model. But "complex" only means something **relative to a reference**: a request that is trivial for a frontier model and a request that is hard for a frontier model can sit in the same absolute bucket, and the right cheaper substitute is completely different in each case.

The company's actual quality contract is **"preserve quality relative to an always-frontier baseline"** (today: always-Opus / always-Fable-5). So difficulty should be defined the same way the contract is: **relative to the declared baseline B**. "Simple relative to B" = *B handles this easily, so a cheaper model probably can too*. "Complex relative to B" = *only B reliably gets this right*.

### 1.2 The failure mode WATERLINE exists to prevent

> **"Simple relative to Fable 5" is NOT the same as "easy enough for a tiny model."**

Concretely: a tenant configures `simple → llama-tiny (Ollama)`, `medium → sonnet`, `complex → fable`. A request arrives that is *simple relative to Fable 5* — Fable solves it without effort — but is **objectively hard** (long context, multi-step reasoning, a niche domain). The bucket says `simple`, the lookup says `llama-tiny`, and the tiny model **silently produces a confidently wrong answer**.

Two subtle traps make this hard to catch with a naive relative signal:

1. **The "B-also-fails" leak.** When a request is *objectively* hard, **both** the tiny model and the baseline B may fail. A pure relative-adequacy score `P(M matches B)` is then **deceptively high** — the tiny model "matches" B's bad answer — and would pass a relative-only gate. Eligibility therefore cannot rest on the relative signal alone; an **absolute** capability term is mandatory.
2. **Within-cluster hard tails.** Capability averaged over a domain cluster hides the hard tail inside that cluster (UniRoute's per-cluster error vectors capture the cluster mean, not the per-prompt tail). A tiny model can look adequate on a cluster's *average* while failing the specific hard request in that cluster.

The academic backing, stated correctly: Jitkrittum et al., *"When Does Confidence-Based Cascade Deferral Suffice?"* (NeurIPS 2023, arXiv:2307.02764) prove that confidence-based deferral is **suboptimal / incomplete** — not "invalid" — and they attribute the failure to the **downstream (expensive) model being a specialist** that the cheap model is *not* uniformly dominated by. The Bayes-optimal deferral rule compares **both** models' error profiles (the `η_h2 − η_h1` gap), so a cheap model's *own confidence* is an **insufficient** eligibility signal: it ignores the relationship to the model being deferred to. A tiny Ollama vs Fable-5 is exactly this regime. So **eligibility must be a trained, variance-aware absolute-capability estimate**, never "cheaper than B" and never the model's own confidence.

Every commercial router we surveyed (OpenRouter Auto/`:floor`, NotDiamond, Unify, Requesty, Martian) trades a *relative* quality score against price and **carries no absolute capability floor** — so this exact failure mode is structurally unaddressed across the field. That gap is WATERLINE's wedge.

---

## 2. The decision-primitive shift

| | Today (classify-then-lookup) | WATERLINE (per-candidate adequacy) |
|---|---|---|
| Question asked | "Which difficulty bucket is R in?" → look up the tenant's model for that bucket | "Given baseline B, is candidate M good enough to stand in for B on R?" — for every candidate |
| Difficulty | Absolute, model-independent | Relative to declared B, *plus* a separate absolute item-difficulty signal |
| Decision granularity | Per-bucket | Per-(request, candidate, baseline) |
| Selection | Tenant's fixed mapping | Cheapest candidate clearing **both** gates |
| Safety net | Tier mapping (no capability check) | Absolute capability floor + fail-UP to B |
| Tenant input | Three tier→model mappings | **One model: the baseline B** (+ one aggressiveness dial) |

This operationalizes the **cost-aware-routing** result of CARROT (Somerstep et al., ICLR 2025): CARROT proves that the **scalarized** plug-in rule `argmin_m [ μ_err · errorₘ(x) + μ_cost · costₘ(x) ]` is **minimax-rate-optimal** ("minimax-optimal cost-aware plug-in routing"). The threshold / "cheapest model clearing a quality bar" form WATERLINE uses is the **Lagrangian dual** of that scalarization — it traces the *same* cost-quality frontier — but it is **not** the form the CARROT theorem states, so we cite CARROT for the scalarized result and treat the threshold form as the dual we operationalize, not as something CARROT proves optimal. WATERLINE makes the bar conditional on the declared baseline B and adds a hard absolute floor on top.

---

## 3. Architecture

WATERLINE is a **policy/constraint layer** that wraps the existing plan-space selector. It produces two signals per (request, candidate) — an **absolute capability** term and a **baseline-relative** term — and combines them into an eligibility test, then selects on cost. The backbone is a single coherent low-rank scoring head (so the relative and absolute signals cannot pathologically disagree), grafted with a multidimensional difficulty signal and a full-rank hedge.

### 3.1 Shared representation (unchanged)

`φ(R)` = `all-MiniLM-L6-v2` 384-d embedding ‖ 33-d `StructuralFeatureExtractor` → ℝ⁴¹⁷, exactly as in `planspace_router._features()` (lines 199–214; the 384-d embed is concatenated with the structural vector on line 214). This encoder is already shared with the semantic cache and clustering; WATERLINE adds **no new encoder**.

### 3.2 The WATERLINE head — one low-rank Bradley-Terry space

A frozen projection `ψ: ℝ⁴¹⁷ → ℝᵈ` (d ≈ 32) into a latent **skill space**, plus a per-model ability vector `v_M ∈ ℝᵈ` and bias `b_M`, gives every model (including B) a **per-prompt Bradley-Terry coefficient**:

```
s_M(R) = ψ(R) · v_M + b_M          # per-prompt latent ability of model M on request R
```

This is the P2L per-prompt-leaderboard idea (P2L: per-prompt Bradley-Terry coefficients) realized as a swappable matrix-factorization head (RouteLLM's model-identity-as-embedding). From this one space we read **both** signals — crucially with **no unidimensional-difficulty assumption** (difficulty enters through the multidimensional `ψ(R)`, not a scalar):

**(a) Absolute capability** (the floor input), calibrated to **ground-truth correctness**, not to B — this is the term the design most depends on, and the one the cascade verifier natively serves (§3.4):
```
p_abs(M, R)  = (1−λ_c)·g_M( σ(s_M(R)) ) + λ_c·g_M( σ(z_M(R)) )      # isotonic-calibrated P(correct)
p_LCB(M, R)  = σ( s_M(R) − z·sqrt( d(R)ᵀ Σ_M d(R) ) )                # variance-aware lower bound
```
- `g_M` is the per-model cross-fitted isotonic calibrator (the exact `per_model_heads[...]["calibrator"]` pattern in `cost_aware_router.py`, lines ~184–246).
- `z_M(R)` is the **full-rank per-model GBT head** already trained in NadirRoute. The mixing weight `λ_c` is **raised for niche/high-stakes clusters** so the absolute estimate is not purely 32-d low-rank where a niche skill decides adequacy. This hedges the low-rank underfit risk.
- `Σ_M` is the Laplace covariance of M's ability vector; the LCB makes a **thin-evidence model conservative** — a freshly probed Ollama has a wide `Σ_M`, so its LCB is pushed low until production rows accrue.

**(b) Baseline-anchored relative adequacy** (the relative bar) — the **genuinely-new, must-retrain target** (§3.4, §6.2):
```
w(M, B, R) = g_B( σ( s_M(R) − s_B(R) ) ) = P(M matches/beats B on R)
```
B enters purely by **subtraction**, so it cancels out of the representation — swapping B is a one-row swap (§4). `g_B` is a small per-baseline isotonic correction curve that hedges narrow-gap baseline transfer without a head refit.

**(c) Baseline-free item difficulty** `β(R)`: a small head over `ψ(R)` predicting the request's absolute demand, fit on the same correctness matrix, as a *multidimensional residual* (not a scalar Rasch β). `β(R)` gives "objectively hard" a **first-class, monitorable number** so the capability floor can be **per-request** rather than per-cluster, catching the within-cluster hard tail. Because it is a residual on top of the rank-d factorization, it avoids a unidimensionality single-point-of-failure. `β(R)` is a **new estimand with no direct labels** — its fidelity and its uncertainty are both validated before it is allowed to move the floor (§3.3, §6.4 item 9).

### 3.3 Eligibility + selection (the two-gate rule)

Implemented as a `<200` LoC extension of `select_plan` in `planspace_router.py` (today lines 47–74; the feasibility test is the single predicate on line 61, and the fail-up branch is lines 68–69). The change replaces the scalar `q` with the two WATERLINE terms:

```python
# extends select_plan(); B = tenant baseline read from config, never hardcoded
for M in ladder(B):
    abs_ok(M) = p_LCB(M, R) >= kappa(beta(R))                       # ABSOLUTE floor (B-free) — gate 1
    rel_bar   = tau_alpha(tenant_tier, cluster, B) + eta*1[M != session_M]
    # slack t relaxes ONLY the relative bar, and ONLY for candidates that already clear the absolute floor:
    rel_ok(M) = w(M, B, R) >= rel_bar - (t if abs_ok(M) else 0.0)   # RELATIVE bar — gate 2

feasible = { M in ladder(B) : abs_ok(M) AND rel_ok(M) }
M_star   = argmin_{M in feasible} C_hat(M, R)        # cheapest clearing BOTH (CARROT dual frontier)
if feasible == {}:  M_star = B ; fail_up = True      # fail UP to baseline, never fail-down
```

- **Absolute floor first, B-free.** `kappa(β(R))` rises with request difficulty: the harder the request (higher `β`), the higher the absolute capability a candidate must demonstrably clear.
- **Non-circular β fallback (P1 fix).** When `β(R)`'s **uncertainty is high** (the residual-difficulty fit is unreliable on that cluster), the floor does **not** fall back to a per-cluster correctness quantile — per-cluster averaging is precisely what misses the within-cluster hard tail (§1.2), so that fallback would be circular. Instead, high β-uncertainty triggers the **conservative** path: exclude on the **LCB alone** at a fixed high threshold (`p_LCB ≥ κ_max`), and if no candidate clears it, **force fail-UP to B**. Uncertainty resolves toward safety (route up), never toward the cheap model.
- **Slack `t` (Hybrid-LLM "transformed" knob), corrected.** The per-tenant dead-band slack `t` (`P[q(M) ≥ q(B) − t]`) relaxes **only the relative bar**, and **only once the absolute floor is already cleared**. It can never green-light a cheap model on a high-`β` ("B-also-fails") request — on those requests `abs_ok(M)` is false for cheap models, so the slack is not applied to them. This closes the leak in §1.2 trap 1.
- `tau_alpha` is the existing Mondrian conformal floor, keyed by `(tenant_tier × cluster × baseline B)` (§3.5).
- `C_hat` is the existing per-model `p50` cost regressor (`route()` lines 254–260); `eta = 0.03` is the existing dead-band; the **fail-up-to-B** branch reuses the line 68–69 logic with `benchmark_plan` set to B.

**The "B is wrong" case (P1 fix).** The feasible set is **never empty for lack of a safe option** — B is always in `ladder(B)` and trivially matches itself, so fail-UP always has a target. The genuinely dangerous case is when **even B is likely to fail**: `high β(R) ∧ low p_abs(B, R)`. That condition — not an empty feasible set — is what triggers the optional premium/fuse escalation tier (§8). On such requests routing down is hopeless and routing to B alone may not help, so escalation beyond B (an opt-in multi-model fuse) is the only quality lever.

`select_plan` keeps its exact shape — it gains aligned `caps[]`/`adq[]` arguments and the two-gate predicate. The eval trainer and harness already import this exact function, so the calibrated object is the production rule, never a reimplementation.

### 3.4 The verifier: reassigned to the ABSOLUTE term, not a baseline-match engine

**This is the correction that most changes the design.** `verifier_model.py` exposes `score(prompt, cheap_answer, reference_answer=None)` (lines 85–119) and tokenizes a `CHEAP:/EXPENSIVE:` pair (line 195), returning the softmax probability of class 1 (line 208). What that probability **means** is fixed by how the weights were trained:

- Per `verifier/routerbench_loader.py` lines 96–98, the training **label is `1` iff `cheap_score ≥ 0.5`** — i.e. the *absolute correctness of the cheap answer*. **The expensive/reference answer is irrelevant to the label** (the loader's own comment: "cheap is acceptable; expensive irrelevant").
- The pairs were **2023-era within-family** pairs (`gpt-3.5-turbo-1106 / gpt-4-1106-preview`, `claude-instant-v1 / claude-v2`, `claude-v1 / claude-v2`, `mistral-7b / mixtral-8x7b`; loader lines 50–55).

Two consequences:

1. **It is NOT a baseline-MATCH engine.** Feeding `reference = B's output` into the EXPENSIVE slot is **out-of-distribution**: the verifier never learned a relationship to that slot (the label ignored it), and it never saw 2026 frontier baselines. The **AUROC 0.961 / ECE 0.016** numbers characterize the *absolute-correctness* task and do **not** transfer to a match-vs-B task. The earlier draft's claim that "the weights are unchanged, only the semantics flip" is **false**.
2. **Its native strength is exactly the absolute capability-floor signal.** The verifier already predicts **P(M correct on R)** at AUROC 0.961 **with no baseline output at all**. So WATERLINE **reassigns the verifier to the absolute-correctness / capability-floor term** (§3.2a): it is the runtime instantiation of `p_abs` as a *post-generation* safety net — score `(prompt, cheap_answer = M's actual output)` → P(M correct), and if it falls below `κ(β)`, fail up.

**The match-vs-B (relative) label is the new, must-retrain target.** `w(M,B,R)` is trained from match labels (§6.2), **not** from the existing verifier weights. **Contingency:** if a fresh, retrained match head's **match-AUROC collapses below the absolute floor on most domains**, we do **not** ship a general baseline-match claim. Instead we fall back to (a) **large-gap baselines only** at GA (where match is easy and demonstrated), and/or (b) **per-baseline calibration** of `g_B` on a labeled slice per declared baseline. This is the same product contingency as the narrow-gap transfer risk (§4).

**Hot-path vs offline — resolving the contradiction.** The verifier has **two distinct roles**, and they are not both off the hot path:
- **Offline labeler (off hot path):** generate absolute-correctness labels for training `s_M`/`g_M`/`β`/`κ` on traffic with no native gold. No latency cost.
- **Post-generation downstream safety net (ON the hot path):** verifying the cheap model's *actual* answer happens after generation, so it **is** on the request hot path. It is 1× cost (one small-DeBERTa forward pass, **not** an extra LLM call — Fusion's "judge" value at 1×, never the 4–5× fan-out), but it **does** add latency that must be budgeted (§8 / §10.3). This corrects the draft's "verifier stays off the hot path" claim.

> **Launch-blocking gate:** re-measure per-domain reliability of (a) the retrained MATCH-vs-B head and (b) the verifier-as-absolute-floor on **current** (2026) models, and blocklist any domain below the existing 80% reliability floor before any baseline-anchored claim ships. The 0.961 number is not evidence for either current-model task.

### 3.5 The conformal floor: reused, relabeled, per-baseline — and the validity caveat

The Mondrian (group-conditional) conformal floor from FLIGHTPLAN §3.6 is reused wholesale. The partition key becomes `(tenant_tier × cluster × baseline B)` and the nonconformity score becomes **baseline-anchored regret** ("down-routed AND B would have been materially better"). It targets `E[regret] ≤ α` via Conformal Risk Control / Learn-then-Test, adapts online under drift via Adaptive Conformal Inference (Gibbs–Candès), and pools hierarchically (+0.02 buffer, effective-n surfaced) for thin cells.

**Conformal-validity correction (P2).** Stacking a **separate, non-conformal** hard gate `p_LCB ≥ κ(β)` *on top of* FLIGHTPLAN's conformal `τ_α` **breaks the α-coverage proof** — the composed accept region is no longer the one the conformal calibration was computed over. Two honest options; WATERLINE takes the first:

1. **(Primary) Fold the absolute floor INTO the conformity score.** Define a single nonconformity score that fires on **either** baseline-regret **or** an absolute-floor breach, and run one Conformal Risk Control calibration over the *composed* accept rule. Then a single guarantee covers **both** gates and the α statement is valid.
2. **(Fallback)** If κ is kept as a separate hard gate outside the conformal score, **drop the claim** that the combined rule reproduces the α guarantee; report the *measured* combined coverage instead and treat α as applying to the relative bar only.

The absolute floor κ is still **calibrated on verifier-vs-ground-truth correctness labels**, kept label-type-distinct from the match labels that drive the relative bar — but its calibration is folded into the same conformal accounting, not bolted on after.

### 3.6 Where each piece lives

| Component | Status | Location |
|---|---|---|
| Shared encoder `φ(R)` | reuse | `planspace_router._features()` (199–214) |
| WATERLINE head `s_M(R)`, `ψ`, `v_M`, `Σ_M` | **new** | new artifact keys in `planspace_artifact.pkl` (bump `planspace_v1` → `planspace_v2`) |
| Full-rank GBT mixing term `z_M(R)` | reuse | `cost_aware_router.per_model_heads` (~153–246) |
| Per-baseline isotonic `g_B`, per-model `g_M` | reuse pattern / **new curves** | isotonic machinery from `cost_aware_router` |
| Item-difficulty `β(R)` | **new (small head)** | new artifact key |
| Two-gate decision rule | **extend** | `select_plan` (47–74, predicate 61, fail-up 68–69), `route()` (232–274) |
| **Absolute** capability term (offline labels + post-gen safety net) | **reuse weights as-is** | `verifier_model.score(prompt, cheap_answer)` (85–119) — absolute-correctness task only |
| **Relative** match head `w(M,B,R)` | **NEW — must retrain** | new artifact key (NOT the existing verifier weights) |
| Conformal floor `tau_alpha` (folded with κ) | reuse, relabel | `artifact["conformal"]`, FLIGHTPLAN §3.6 |
| Variance-aware `p_LCB`, `Σ_M`, D-optimal probe battery | **DESIGN-DOC-ONLY — must build** | ROUTER_V3 §3.2/§8.1 describe it; impl is new `eval/planspace/probe_kit.py` (V3 Phase 1) |
| Tier-remap short-circuit | reuse | `production_completion.py` 850–869 (`analyzer_type.startswith("planspace")`, line 857–866) |

> **Honest scope note:** the variance-aware `p_LCB` / `Σ_M` / D-optimal probe-battery path that the capability floor depends on is **specified in ROUTER_V3 §3.2 and §8.1 but not yet implemented** (the file `eval/planspace/probe_kit.py` is V3 Phase 1, not yet written). It is a **prerequisite milestone** (Phase 0 below), not part of the shipping stack.

---

## 4. Changing the baseline without full retraining

Because adequacy is `σ(s_M − s_B)` — a **difference of abilities** — the baseline enters as a single subtracted term. Declaring a new baseline (Fable-5 → GPT-5.5) requires:

1. **Swap one latent row** `v_B`/`b_B` read at scoring time (the base heads `v_M`, `Σ_M`, `ψ` never retrain). Precedent: RouteLLM's matrix-factorization model-identity embedding and its demonstrated cross-pair transfer; UniRoute's add-a-model-with-no-router-retrain (per-cluster error vectors for the new column).
2. **Recalibrate the one Mondrian column** `(· × · × B)` on the dual-arm audit slice, and select/fit the small per-baseline isotonic `g_B`.
3. **No probe re-run per baseline.** Because the relative signal is an ability *difference*, **one probe battery per model serves all declared baselines** — versus a per-(model, baseline) probe.

**Narrow-gap caveat made explicit (P3).** RouteLLM's cross-pair transfer is demonstrated only for **large-gap** pairs (e.g. on MT-Bench). **Narrow-gap** transfer (Sonnet-as-B vs Fable-as-B, or a qualitatively different tiny local model) is **unproven**, yet the "declare only your baseline, one-row swap, no retrain" UX **depends on it**. It must pass the offline baseline-swap test (§6.4 item 8) before we promise "no retrain on baseline change." **Product contingency if that test fails:** ship **large-gap-only at GA** (only baselines far above the ladder get the one-row-swap promise), and require **per-baseline calibration** (fit `g_B` on a per-baseline labeled slice) for narrow-gap baselines. `g_B` is the cheap hedge if transfer is merely imperfect rather than broken.

**Baseline version-bump detection (P2 fix).** A baseline **version bump** (Fable-5 v1 → v2) invalidates `v_B` *and* the match labels generated against the old B. Critically, **PSI on the input embedding distribution will NOT detect it** — a silent v1→v2 swap shifts B's **outputs**, not the input prompts, so the input-side drift monitors stay flat. WATERLINE adds an **output-side canary**: periodically re-probe B on a fixed held-out probe set and **diff the responses against stored B fingerprints** (response-hash / verifier-score deltas). A fingerprint drift beyond threshold flags a version bump and schedules reprobe + relabel as maintenance. Treat baseline version bumps as scheduled maintenance, not one-time setup.

---

## 5. Capability profiling

A candidate's place on the ladder and its absolute capability come from two sources, used for **different jobs**:

### 5.1 Public leaderboards — coarse ordering only

Artificial Analysis Intelligence Index, Epoch Capabilities Index (ECI), and Chatbot Arena Bradley-Terry Elo give a **global** capability ordering. Use them **only** to (a) derive the coarse ladder ordering and the metadata-hypernetwork prior on `v_M` for a cold model, and (b) flag how far below B a candidate sits. **Never** use a global Elo/index as the per-request floor — Epoch itself states "absolute ECI values are meaningless by themselves," and Arena Elo is human *preference*, not per-request correctness. Using them as the floor would reintroduce exactly the failure WATERLINE prevents.

### 5.2 The per-new-model probe battery

When a model is added: select **256 D-optimal / k-center medoid prompts** over the production embedding space (biased toward **discriminative** "only a few models can solve" items, per ICL-Router, so the battery actually separates a 7B Ollama from a strong cheap hosted model), run at effort `{off, high}` (~512 calls), verifier-score them, and fit `(v_M, b_M, Σ_M)` by L2-regularized logistic/IRT MLE with `ψ` frozen, shrunk toward the hypernetwork prior. Gate with the LCB: `AUC ≥ 0.70` probes-only, `≥ 0.80` after ~500 production rows. This is the UniRoute "characterize an unseen model from a small validation set, no router retrain" recipe, made baseline-shared by §4.

### 5.3 Probe cost is per-model, and the ladder is 8–15 models (zero-spend reconciliation)

A single ~512-call hosted-model battery is **~$0.5–10**. But the ladder is **~8–15 models**, and each hosted model needs a battery, plus reprobes on version bumps. **Local Ollama models are compute-only (free)** — which is favorable, because the *dangerous* tiny local models can be **probed densely** (well beyond 512) to tighten their `Σ_M`/LCB at no API cost. The honest envelope is summed in §6.5, not hidden behind "one $0.5–10 probe."

---

## 6. Offline training and eval (bounded-spend)

### 6.1 Datasets (named correctly)

- **RouterBench** — the real correctness matrix lives at **`getnadir.dev/verifier/data/routerbench_triples.jsonl` (112,054 triples)**; the **11,420** held-out **test** split (sha256-bucketed in `routerbench_loader.py`) **is the canonical eval set**. This supplies **ground-truth absolute-correctness labels** for `s_M`, `g_M`, `β`, `κ` from native gold scores in `{0, 0.25, 0.5, 0.75, 1.0}`.
- **RouterArena — NOT RouterBench, and evaluation-only.** `eval/routerarena/nadirroute/matrix.pkl` is the **RouterArena** matrix (Apache-2.0), built by `build_matrix.py` from `upstream/RouterArena/router_inference/predictions`. It is a **sparse union of router picks** (~49,995 entries / ~8,400 prompts / ~30 models) with **wildly uneven coverage** — e.g. `claude-haiku-4-5 ≈ 7,071` rows while `gpt-5 = 1` and `gpt-5-mini = 3`. It is therefore **evaluation-only**: you **cannot** fit per-model absolute-correctness heads for frontier columns off 1–3 examples, and it can never be a training-label source. (The earlier "$0 / ~405k outcomes / MIT matrix" framing was wrong on dataset identity, license, count, and usability — dropped.)
- **Arena** (arena-55k Apache-2.0; lmarena leaderboard CC-BY-4.0 incl. fable-5), **PPE**, **HelpSteer2/3**, **UltraFeedback** (MIT) — augmentation and paraphrase twins.
- **P2L-7B** (Apache-2.0, roster frozen ~Feb 2025) — local frozen teacher for the open/older ladder only.

### 6.2 Labels (the cross-cutting rigor rule)

- **Absolute correctness** (trains `s_M`, `g_M`, `β`, `κ`): use **RouterBench native gold** cells directly. The verifier is **not** the oracle on a dataset that already has ground truth.
- **Baseline-match** (trains the new `w` head): where native gold exists, derive the match label **from gold** (`correct(M)` on cells where both M and B have ground truth, or `correct(M) ≥ correct(B)`) at **$0**. **Where no gold exists** (open-ended / production traffic), the match label requires **B's actual output** for comparison — which is **paid inference on baseline B** (the verifier-as-relative-judge is itself OOD per §3.4 and only an approximate fallback). This is the **baseline-B relabeling run**, named as a budget line item in §6.5, not hidden.

### 6.3 Targets and objective

Joint loss in the shared low-rank space:
```
L = BCE( σ(s_M)  ,  correct(M) )                       # absolute-correctness head + isotonic
  + λ_BT · BradleyTerry( σ(s_M − s_B)  ,  match(M,B) )   # antisymmetric relative bar
  + λ_cons · || s_M(R) − s_M(R') ||²                     # paraphrase-twin consistency (RouteLLM augmentation)
```
`ψ` trained jointly then **frozen**; `v_M, b_M, Σ_M` per model. Distill **P2L-7B** Bradley-Terry coefficient gaps as a soft match target for the **open/older** ladder models only, **re-anchored to verifier-correctness** so P2L's human-preference/style bias is stripped. 2026 frontier models (Fable 5, Mythos 5, GPT-5.5) are outside P2L's frozen roster → probe battery only. RouterArena data **never** trains a submitted artifact (SHA-256 contamination audit binds the split). The Hybrid-LLM query-only signal `P[q(M) ≥ q(B) − t]` (small model's quality vs large model's, from the query alone) is the per-tenant dead-band knob — applied per §3.3, i.e. **only after the absolute floor is cleared**, so it does **not** green-light the "B-also-fails" case (correcting the earlier draft, which said it "correctly green-lights" that case — it must not).

### 6.4 Eval protocol — measured FRESHLY under baseline B (not graded against always-Opus)

Offline on RouterBench, reusing the harness that imports the exact production `select_plan`. **The canonical 60% / 98% / 1.7% / 2.4% / AUROC-0.961 numbers were measured under baseline=always-Opus and task=absolute-correctness; they are NOT pass-criteria here.** WATERLINE is measured against **baseline B**:

1. **Fix the baseline column = B** in the held-out test split; derive each (prompt, M) match-vs-B label from native gold.
2. **Nested leave-one-dataset-family-out + leave-one-model-out CV.** `g_B`, `tau_alpha`, `κ`, `β` fit on train-fold OOF only, applied unseen to the test fold. τ/κ never see test labels.
3. **Primary metrics (under B, fresh):** cost saved vs **always-B** at the contracted quality fraction of B; the full **cost-quality convex hull / AIQ area** (not one operating point); and **RouteLLM's PGR (Performance-Gap-Recovered vs B) + CPT (Call-Performance-Threshold)** as the falsifiable public claim that pre-empts the "which baseline?" objection. **Report the measured savings/quality under B — do not assert they reproduce the always-Opus 60%/98%.**
4. **Catastrophic-route accounting:** report the down-route-failure rate **as measured under B** and verify it **tracks α monotonically**. **Never claim 0% catastrophic** (false). Do **not** assert it must equal the always-Opus 1.7%/2.4% figures — those were a different baseline+task.
5. **Headroom question (load-bearing, tie-in):** explicitly test whether the assumed **2026 SKU prices** leave any real room to route **down** from a Fable-5 anchor. If the ladder beneath B has a small cost spread (cf. ROUTER_V3 Protocol 1, where qwen/deepseek/grok had little to save), WATERLINE's *measured* savings under B may be modest regardless of mechanism. This is an open question, not an assumed win.
6. **WITH-vs-WITHOUT capability-gate ablation (standing CI gate):** inject a deliberately weak, low-ability RouterBench column priced **below** the ladder. Without the floor (relative bar only — today's logic), the weak model wins cheap slots and the catastrophic rate **spikes**; with the floor it is excluded where `p_LCB < κ(β)` and the rate stays at α. Quantifies the gate's effect; **wired into CI as a standing regression gate**.
7. **Validity cross-check:** verify `σ(s_M − s_B)` actually **tracks** the native-gold match label on held-out triples — the proxy-label assumption that most needs validation.
8. **Baseline-swap test:** train under B₁, evaluate under B₂ by swapping only `v_B` (no retrain); report PGR retained. Gate "no retrain on baseline change" on passing this for the relevant (narrow-gap) ladders; on failure, invoke the §4 contingency (large-gap-only GA / per-baseline calibration).
9. **`β(R)` validation plan:** measure `β`'s correlation with held-out per-prompt difficulty (1 − mean correctness across models), its calibration, and the **reliability of its uncertainty estimate** (does high predicted β-uncertainty actually coincide with high difficulty-prediction error?). The high-β-uncertainty → LCB-only / fail-UP fallback (§3.3) is only sound if that uncertainty is itself trustworthy.
10. **Calibration:** AUROC / ECE / Brier for both the absolute-correctness and the new match head; paraphrase-twin pick-flip stability ≥ 0.75; cold-start LOMO AUC ≥ 0.70 before any probe-only model is trusted.

### 6.5 Bounded paid-spend budget (honest sum)

| Line item | Trigger | Est. cost |
|---|---|---|
| Per-hosted-model probe battery (~512 calls) | each hosted ladder/baseline model added | ~$0.5–10 each |
| Probe batteries, full ladder | initial build, ~8–15 models (≈ half hosted) | ~$5–100 total |
| Local Ollama probe batteries | each local model; can over-sample | **$0 (compute-only)** |
| **Baseline-B output-relabeling run** | match labels on open-ended/production traffic (no gold) | scoped to the ~1–1.5% dual-arm audit slice; sized & capped before each run |
| Version-bump reprobe + relabel | each detected B or ladder-model version bump (§4 canary) | recurring; same per-model rates |

The sanctioned envelope is therefore **"itemized probe + relabel runs, budgeted and capped per run,"** not a single $0.5–10 probe. Everything else (RouterBench native-gold training/eval) is **$0**.

---

## 7. UX — declare the anchor, derive the ladder

The tenant declares **one thing**: `profiles.model_parameters.baseline_model` (jsonb, additive — no migration), plus a single **aggressiveness dial α** (`α = 0` ⇒ always-B). Nadir derives the ladder = menu models cheaper than B that hold an ability vector, and reroutes underneath with the quality contract anchored to B.

- **Black-box variant (default):** substitutes are hidden. The tenant sees only "we matched your baseline X% of the time and recovered Y% of the gap" (PGR/CPT). This replaces OpenRouter/NotDiamond's abstract `cost_quality_tradeoff = 7` slider (a single 0–10 knob) with a **concrete, legible anchor** ("match Fable 5").
- **White-box variant:** Nadir exposes the derived ladder as a P2L-style cost-quality Pareto curve, with each candidate's `w` (match-prob) and `p_abs` (absolute correctness). The tenant can re-sort by price/throughput/latency (OpenRouter `:floor`/`:nitro` vocabulary) and set a `max_price`-style cap — **but can never override the capability floor κ** (a Nadir-owned safety invariant) and can never disable fail-up.
- **`max_price`, and the fail-up tension (P2 fix).** OpenRouter's `max_price` is a **hard cap** that **fails the request** when nothing is cheap enough. WATERLINE's fail-UP does the **opposite of a cost cap**: a hard request routes to **B, the most expensive model on the ladder** — so **fail-up can exceed any user-set `max_price`**. We flag this explicitly to the tenant rather than pretend the cap is honored: either (a) surface that the control is a *routing-preference* cap, not a spend ceiling, and rename it accordingly (e.g. `prefer_max_price`), or (b) offer a strict mode where exceeding the cap on fail-up **fails the request** OpenRouter-style — at the cost of the quality guarantee. The default is (a); the rename avoids implying a guarantee WATERLINE does not make.
- **Honesty clause:** the contract states plainly that **"match B" inherits B's mistakes** — quality is defined *relative to your declared baseline, not to ground truth*. The capability floor is what makes this honest claim safe. Day-1 floors on a freshly declared baseline are **pooled/wide**, and the dashboard surfaces effective-n per cell so a tenant sees when a guarantee is still thin.

### 7.1 Multi-turn / conversation handling (dominant traffic shape)

Conversations — not single prompts — are the dominant traffic shape, and naive per-turn re-routing is actively harmful:

- **Model + provider pinning across a thread.** Re-routing mid-thread to a different model/provider **breaks the prompt cache** (the cached prefix lives per-model, per-provider), so a re-route silently pays full input-token cost on the whole accumulated history. WATERLINE therefore **pins** the chosen `(model, provider)` for the life of a conversation by default, matching OpenRouter Auto Router's conversation-pinning behavior, so cache reads are preserved.
- **Mid-thread difficulty escalation.** Difficulty can rise within a thread (a follow-up turn is harder than the opener). The capability floor is re-evaluated **per turn** on the *accumulated* context; if a later turn's `β`/`p_LCB` no longer clears the floor for the pinned model, WATERLINE **escalates up** (to B, or to the premium fuse tier if even B is at risk) — escalation up is always allowed even while pinned.
- **Re-route-breaks-cache cost.** A re-route's decision must net the **lost-cache penalty** (re-paying input tokens for the history) into `C_hat`, so the router only switches models mid-thread when the expected savings exceed the cache-rebuild cost. De-escalation (routing *down* mid-thread) is gated harder than escalation, precisely because it forfeits the cache.

---

## 8. Competitive positioning — route down vs spend up

| | OpenRouter Fusion | Nadir WATERLINE |
|---|---|---|
| Economic bet | **Spend UP**: 3–5 model panel + judge + synthesizer, ~4–5× a single call, 2–3× latency | **Route DOWN**: one cheaper call; pre-generation eligibility + optional 1× post-gen verifier; no extra LLM call |
| Quality story | Approximate a frontier model by ensembling | Match *your declared* frontier baseline, cheaper |
| Capability floor | None (relative panel quality) | Hard, B-free, per-request, non-overridable |
| Claim | "Fable-level at half the price" (vendor benchmark; still multiples of one mid-call) | "We match your baseline X% / recover Y% of the gap" (PGR/CPT, **measured under B** on RouterBench) |

Fusion's only genuinely borrowable kernel is the **judge** step (consensus / contradiction / blind-spot), which WATERLINE already gets at **1× cost** by reusing the cascade verifier as a single-call **absolute-correctness** judge (§3.4). Fusion's full synthesis is kept **only as an opt-in premium tier** for the `high β ∧ low p_abs(B)` case (§3.3) — a "fail-up to a 2-model fuse" when even B is likely to fail — never the default, because it inverts the route-down economics. Against the slider-based field (Auto/NotDiamond/Unify/Requesty/Martian), the differentiator is the **absolute capability floor** none of them carry, plus a **concrete model anchor** instead of an abstract 0–10 knob.

---

## 9. Relationship and naming vs FLIGHTPLAN / V3 / NadirRoute

WATERLINE is **not** a replacement for, or a "version above," FLIGHTPLAN. The three layers compose:

- **NadirRoute** — the predictor: per-model heads + inductive path, `f(prompt, model) → P(correct)`. WATERLINE re-reads these as the absolute-capability term and the full-rank mixing hedge.
- **FLIGHTPLAN / Router V3** — the optimizer: *given knobs (model, effort, compression, cache), pick the cheapest plan clearing a conformal floor.*
- **WATERLINE** — the constraint policy: *given a declared baseline B, which knobs/models are safe to use?* It **filters the plan grid** (eligibility) before FLIGHTPLAN's cost optimization runs. The effort/compression/cache deltas apply only to candidates that already clear the adequacy bar and the capability floor.

If WATERLINE lands first, V3 retrofits by enumerating the plan grid before the same feasibility predicate. If V3 lands first, WATERLINE wraps `select_plan` and the plan-grid filter. WATERLINE **composes with** V3 — it does not duplicate V3's conformal layer, probe protocol, or knob-delta machinery; it reuses them.

### Naming recommendation

**Do not ship this as "V2."** Calling a layer that composes *on top of* "Router V3" by the name "V2" is actively confusing (V2 < V3, but WATERLINE depends on V3's machinery and ships alongside/after it).

- **Feature codename:** **WATERLINE** (the absolute capability floor is the waterline a candidate must clear; the baseline is the declared anchor). Supersedes the candidate codenames KEYSTONE / PLUMBLINE / ANCHOR used during design.
- **Doc filename:** `getnadir.dev/docs/ROUTER_WATERLINE_DESIGN.md` (no version number).
- **Analyzer:** keep `analyzer_type` starting with `planspace` (so the `production_completion.py` lines 850–869 tier-remap short-circuit keeps firing) and add a policy flag, e.g. `analyzer_type = "planspace+waterline"` or `baseline_anchored=True` on `PlanspaceAnalyzer`. Reserve "V2" as the **internal project label** only.

The tier-remap short-circuit is critical: `PlanspaceAnalyzer` already returns a **concrete model** and marks its `tier_*` fields as **observability-only** (`planspace_router.py` lines 310–313 docstring). WATERLINE's derived tier labels must likewise **never** be remapped back to a tenant's stale `tier_models` config — that would re-open the Ollama hole.

---

## 10. Phased rollout, risks, open questions

### 10.1 Phases

- **Phase 0 — Prerequisites (offline, $0 + itemized probes).** Build the unbuilt `p_LCB` / `Σ_M` / D-optimal `probe_kit.py` path (ROUTER_V3 §3.2/§8.1, Phase 1). **Retrain** the match head `w` (do not reuse verifier weights). Re-measure verifier reliability for **both** the absolute-floor (current models) and the new MATCH-vs-B head; blocklist sub-80% domains. **Launch blockers.**
- **Phase 1 — Offline model + eval (mostly $0).** Train on RouterBench native gold with B = strongest covered column; **measure savings/quality freshly under B** (do not target the always-Opus numbers); pass the capability-gate ablation, validity cross-check, baseline-swap test, and β-validation; land the CI regression gate.
- **Phase 2 — Shadow.** Run in shadow with B = always-frontier; accrue the **dual-arm random audit slice (1–1.5%, including baseline routes)** for exchangeable conformal calibration; run the baseline-B relabeling run within budget; compare shadow decisions vs the champion router.
- **Phase 3 — Black-box GA.** Tenant declares baseline; Nadir derives the ladder; expose the α dial and PGR/CPT with effective-n surfacing. Conversation pinning on by default.
- **Phase 4 — White-box.** Expose the derived ladder, `max_price`/`:floor` overrides (under the floor, with the fail-up-can-exceed-cap disclosure), and the optional Fusion-style premium fail-up tier.

### 10.2 Risks

1. **Low-rank underfit on niche skills** — mitigated by the full-rank `z_M` mixing term with `λ_c` raised for niche/high-stakes clusters.
2. **`β(R)` is a new estimand with no direct labels** — mitigated by the §6.4-item-9 validation plan and the conservative high-β-uncertainty fallback (LCB-only / fail-UP, **not** per-cluster quantile).
3. **Match head must be retrained from scratch** (the verifier weights do not transfer to match-vs-B) and may collapse on narrow-gap baselines — gated behind §3.4's per-domain reliability check and the §4 contingency.
4. **Narrow-gap baseline transfer unproven** — gated behind the offline baseline-swap test; `g_B` correction curve + per-baseline calibration as fallbacks.
5. **Two label types + two gates** double the calibration surface — kept label-type-separate (match vs ground-truth-correctness); the absolute floor is folded into the conformal score (§3.5) so the α guarantee stays valid; a mis-set κ is caught by the standing CI ablation.
6. **Conformal exchangeability** breaks under drift / baseline switch / silent B version bump — mitigated (not eliminated) by the dual-arm audit slice, ACI, the output-side B canary (§4), and the absolute floor folded into the score; never presented as a static lifetime guarantee.
7. **Proxy labels** (verifier-as-relative-judge, P2L preference) carry style/length bias and are OOD for match-vs-B — validated against native gold, re-anchored to correctness, never quoted as ground truth.
8. **Probe noise on fresh models** makes the LCB conservative — safe but leaves savings on the table until production rows accrue; local Ollama models can be over-probed for free to tighten the LCB.
9. **Latency unestablished** — see §10.3.

### 10.3 Latency (TBD — must be measured, not asserted)

The earlier draft's "~15–20 ms decision" figure is **unsupported and removed.** The pre-generation decision evaluates, per candidate, `s_M` + the full-rank GBT `z_M` + the quadratic form `d(R)ᵀΣ_M d(R)` + isotonic + `β`, **× ladder size (8–15)**. The **post-generation** verifier safety net (§3.4) is **on the hot path** and adds a DeBERTa forward pass: in-repo figures are ~28 ms typical / 15–40 ms p95 INT8, **but those were measured on Ryzen-5/M2-class CPUs, not App Runner 1 vCPU under concurrency** (per ROUTER_V3 §2.4 / the cascade limitation note). **Action:** measure the full WATERLINE decision against the **current `planspace_router`** baseline on production hardware; the latency budget is **unestablished** until then. The contradiction in the draft (verifier "offline-only" vs "downstream safety net") is resolved in §3.4: offline labeling is off the hot path, the post-generation safety net is on it.

### 10.4 Honest open questions

Carried in the structured `open_questions` field:

1. **SKU headroom** — do assumed 2026 prices leave any real room to route **down** from a Fable-5 anchor, or is the ladder cost-spread too small (cf. V3 Protocol 1)? This gates whether WATERLINE delivers meaningful savings *at all* under a frontier baseline.
2. **Match-head feasibility** — can a *retrained* match-vs-B head clear the 80% per-domain reliability floor on enough domains, or do we ship large-gap-only?
3. **Narrow-gap baseline transfer** — does one-row `v_B` swap hold for Sonnet-vs-Fable-class gaps, or is per-baseline calibration mandatory?
4. **`β(R)` fidelity and uncertainty** — does the difficulty residual track per-prompt hardness, and is its uncertainty trustworthy enough to drive the conservative fallback?
5. **Conformal fold** — does folding the absolute floor into the nonconformity score preserve α-coverage empirically, or must we drop to the "report measured coverage" fallback?
6. **Latency budget** — what does the full ladder-sized decision + optional post-gen verifier actually cost on App Runner, vs the current planspace_router?
7. **Match-label quality on open-ended generation** — how good are gold-free match labels, and what is the true cost/cadence of the baseline-B relabeling run?
8. **Effective baseline-change / version-bump frequency** — how often do tenants swap or vendors bump B, and does the output-side canary catch silent bumps in time?
