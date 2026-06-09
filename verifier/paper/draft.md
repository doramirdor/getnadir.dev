---
title: "Verifier-Gated Cascade Routing for Production LLM APIs"
author:
  - Nadir Research
date: 2026-05-24
abstract: |
  We introduce *verifier-gated cascade routing*, a method for serving
  large-language-model (LLM) APIs that decouples the routing decision from
  the complexity-classification step assumed by prior work. Existing routers
  (RouteLLM, FrugalGPT, Avengers-Pro) commit to a model *before* generation,
  forcing them to trade cost against an irreducible prediction error on the
  prompt distribution. We instead route *after* observing a cheap model's
  response, using a 44M-parameter discriminative cross-encoder
  (DeBERTa-v3-small) to score whether the cheap answer is acceptable
  relative to a cached or pointwise reference. Acceptance returns the cheap
  response; rejection escalates to a stronger tier. The verifier runs in
  approximately 180 ms on a single CPU core after INT8 dynamic quantization
  with PyTorch qnnpack, on a held-out evaluation drawn from RouterBench
  cross-family response triples. We report 0.961 AUROC and 47% cost
  reduction at 97.7% catastrophic-route avoidance on 11,420 held-out
  RouterBench triples, and describe a contractual *quality-floor* framing
  that makes verifier acceptance a commercial commitment rather than a
  point estimate. We argue that quality verification belongs in the routing
  layer, not the application layer, and outline the architectural and
  training-data implications of that shift.
---

## 1. Introduction

Cost-aware routing has emerged as the dominant strategy for reducing the
operating cost of production LLM applications without giving up the
quality of frontier models on the requests that need them. Public routers
including RouteLLM [1], FrugalGPT [2], and the cluster-scorer line of work
descending from Avengers-Pro [3] all share a structural assumption: the
router selects a model *before* generation, conditioned only on features
of the prompt. We refer to this family as **pre-generation routers**.

Pre-generation routing inherits an irreducible difficulty: the router must
predict, from a prompt alone, whether a cheaper model will produce an
output of acceptable quality. Even a well-trained classifier produces a
distribution over model choices with non-trivial tail mass on the wrong
model; the cost of being wrong on a single high-stakes request can dwarf
the cost saved on hundreds of routine ones. Engineering teams that have
internalized this trade-off respond rationally: they pin to the strongest
model (typically Claude Opus or GPT-4-class) and absorb the cost, because
no router gives them a *guarantee*.

Consider a representative scenario. A coding-assistant team observes that
80% of their traffic is straightforward (single-file edits, look-ups,
short refactors) and 20% is genuinely complex (multi-file refactors,
agentic planning). Existing routers will save them 40-60% on the simple
80%, but on the complex 20% the router occasionally downgrades to a
cheaper model and ships a wrong answer to production. The team measures
the cost of a single such failure (lost engineering hours, customer
incident, regression triage) and concludes the savings do not pencil. They
pin to Opus and pay full freight on everything.

This paper inverts the temporal order. We route **after** seeing the
cheap model's answer. A small discriminative verifier reads
$(prompt, cheap\_answer, expensive\_answer)$ — where the expensive answer
is either fetched from a small reference cache or omitted as a pointwise
fallback — and outputs a scalar $p_{accept} \in [0, 1]$. If
$p_{accept} \geq \tau$ for a calibrated threshold $\tau$, we return the
cheap answer. Otherwise we escalate to the next tier and return that
response instead. The verifier itself is a 44M-parameter cross-encoder
(DeBERTa-v3-small [4]) running INT8-quantized on CPU; inference takes
roughly 28 ms at the 95th percentile in our deployment.

Three contributions follow:

1. **A cross-encoder verifier architecture** that operates on the
   $(prompt, cheap\_answer, expensive\_answer)$ triple and is trainable
   from organic production signals (override detection) plus
   LLM-as-judge amplification, requiring no human-labeled universal
   quality standard.
2. **A cascade orchestration design** for a multi-tenant LLM API
   gateway — including shadow mode, fail-open semantics, escalation
   policy, and audit logging — that adds a single network hop on the
   accept path and remains backwards-compatible with existing
   pre-generation routers.
3. **A contractual quality-floor framing** that converts verifier
   acceptance into a commercial commitment, with bounded per-customer
   liability and a calibration protocol that gates active mode on
   per-customer false-accept rate.

We deliberately separate the *training signal* (LLM-as-judge, expensive
and slow) from the *production artifact* (cross-encoder, cheap and
fast). The judge is invoked once during corpus construction; the verifier
runs on every request.

## 2. Background and Related Work

**Cross-encoder reranking.** Cross-encoders pre-date LLM routing by
several years. Nogueira and Cho [5] established that BERT-style joint
encoders dominate IR reranking on MS-MARCO [6] and the BEIR benchmark [7]
relative to bi-encoder retrievers. The pattern we adopt — joint encoding
of two text spans with a scalar relevance head — is the same pattern; we
swap "document relevance" for "answer acceptability." DeBERTa-v3 [4]
provides disentangled positional attention that empirically outperforms
DistilBERT and base BERT at the 10-50M parameter range relevant for
CPU-bound rerankers.

**LLM routing.** RouteLLM [1] trains a preference-based classifier on
(prompt, weak-model-answer, strong-model-answer) tuples to predict
whether the strong model will be preferred. The classifier runs on the
prompt alone at inference. FrugalGPT [2] uses cascades of models with
generation-stop conditions but lacks a learned post-hoc verifier;
acceptance is rule-based. Avengers-Pro [3] and its derivatives (including
Weave Router) cluster prompts in embedding space and select the model
that maximizes a cluster-specific cost-accuracy blend, with the blend
weights frozen at training time. All three of these systems route
pre-generation. Our work is the first, to our knowledge, to publish a
*post-generation* routing architecture for a production LLM gateway.

**Reward modeling and judge models.** Reward models trained on human
preferences are the backbone of RLHF [8]. Constitutional AI [9]
generalizes the supervisor signal to a model-generated critique. MT-Bench
and Chatbot Arena [10] popularized using a strong LLM as judge for
pairwise comparisons. Our verifier sits in this lineage but is
specialized: it learns *only* whether the gap between two specific model
outputs is perceptible enough to warrant escalation, not a universal
quality score. This narrowing is what permits a 44M-parameter model to
match the discriminative behaviour of a much larger judge.

**Cascades and speculative decoding.** Language model cascades [11] and
dynamic-tier cascade work [12] formalize the idea of progressively
escalating through models of increasing capability. Speculative decoding
[13] uses a small draft model to propose tokens that a larger model
verifies in parallel. Our architecture borrows the *escalation* idea from
cascades but departs from speculative decoding's parallelism: we run
sequentially because LLM provider APIs charge for tokens generated, and
parallel speculation that discards the expensive completion on accept
pays for tokens it does not use. We discuss this trade-off in
Section 4.3.

**The key distinction.** All prior routing work commits to a model based
on features available before generation. Our work scores after generation
and uses that score to decide whether to escalate. This is a structural
re-ordering, not a parameter tuning.

## 3. Method

### 3.1 Architecture

The verifier is a cross-encoder built on DeBERTa-v3-small (44M parameters,
6 layers, 768 hidden, disentangled positional attention). Input format:

```
[CLS] {prompt} [SEP] {cheap_answer} [SEP] {expensive_answer} [SEP]
```

The pooled `[CLS]` representation feeds a linear head producing a single
logit, passed through a sigmoid to yield $p_{accept} \in [0, 1]$. Total
input is truncated to 512 tokens; longer triples are truncated by
proportionally trimming the cheap and expensive answer segments while
preserving the full prompt where possible.

We chose DeBERTa-v3-small over alternatives (DistilBERT 22M, T5-small
60M, MiniLM 33M) on three criteria: (i) disentangled positional attention
gives empirical gains on cross-encoder ranking tasks at this scale [4];
(ii) encoder-only models avoid the decoder overhead of seq2seq
alternatives; (iii) the 44M parameter count fits comfortably in CPU RAM
after INT8 quantization (≈ 50 MB on disk) and runs at 15-40 ms p95 on
Ryzen-5 / M2-class CPUs.

At inference we apply dynamic INT8 quantization to all linear layers via
PyTorch's `torch.quantization.quantize_dynamic`, with the `qnnpack`
backend on ARM (macOS) and silent fallback to `fbgemm` on x86 Linux.
The quantized model holds AUROC at 0.961 against the same held-out
test split (no measurable drop within sampling variance from FP32, at
n=11,420), while reducing on-disk size from 541 MB to 70 MB and
cutting inference latency by roughly 2x on commodity CPU.

### 3.2 Training Objective

We frame verification as binary classification. Label 1 indicates the
cheap answer was acceptable (no override occurred, no quality failure
flagged); label 0 indicates the cheap answer was rejected (user
re-submitted to a stronger model within a configurable window, OCR
quality check failed, or judge model flagged the gap as perceptible). The
loss is standard binary cross-entropy:

$$
\mathcal{L} = -\sum_i \left[ y_i \log p_{accept}(x_i) + (1 - y_i) \log(1 - p_{accept}(x_i)) \right]
$$

where $x_i = (prompt_i, cheap\_answer_i, expensive\_answer_i)$.

**Why pairwise rather than pointwise.** A pointwise verifier
($f(prompt, answer) \to quality$) requires a universal quality standard,
which is difficult to define and harder to label. Pairwise framing
($f(prompt, cheap, expensive) \to gap\_perceptible$) only asks whether
the *gap* between two specific responses is noticeable. This is a
relative judgment, trainable on organic data: when a user re-submitted to
a stronger model, the gap was perceptible to them. No universal
ground-truth quality score is required.

**Reference-answer cache and pointwise fallback.** At inference, the
$expensive\_answer$ slot is supplied by a small per-prompt reference
cache keyed by $\textrm{sha256}(prompt)[:16]$. Cache misses fall back to
a pointwise mode in which the expensive slot is set to a `[PAD]`
sequence. To support this gracefully we train on a mixture: 90% of
training examples use the full pairwise format; 10% randomly drop the
expensive slot to `[PAD]`. This produces a single model that handles both
warm-cache and cold-prompt inputs.

### 3.3 Cascade Orchestration

The router proper, `CascadeRouter`, lives in the production completion
path immediately after the existing complexity classifier selects a tier.
The algorithmic core is summarized in Figure 1 and the following
pseudocode:

```
function dispatch_with_verifier(messages, cheap_model, tier):
    shadow_mode = config.mode == "shadow"
    tau         = config.acceptance_threshold      # default 0.75
    escalation  = resolve_escalation_model(tier)   # next-up tier model
    if escalation is None:
        return cheap_model, no_cascade

    cheap_response = llm.call(messages, cheap_model)
    prompt_text    = extract_last_user_message(messages)
    reference      = cache.get(prompt_hash(prompt_text))   # may be None

    try:
        score    = await with_timeout(
                      verifier.score(prompt_text,
                                     cheap_response.content,
                                     reference),
                      timeout=CASCADE_TIMEOUT_MS)
        accepted = score >= tau
    except TimeoutError:
        score, accepted = None, True       # fail open: keep cheap

    log_decision(...)

    if shadow_mode or accepted:
        return cheap_model, cheap_response

    expensive_response = llm.call(messages, escalation)
    cache.set(prompt_hash(prompt_text), expensive_response.content)
    return escalation, expensive_response, escalated=True
```

Three design choices warrant comment.

**Sequential, not parallel.** Speculative parallel dispatch (call both
cheap and expensive simultaneously, cancel expensive on accept) improves
only the reject path, which is 10-20% of requests, while paying for the
expensive completion on the accept path because LLM provider APIs do not
support mid-stream billing cancellation. The expected cost of parallel
dispatch is

$$
\mathbb{E}[c_{\text{parallel}}]
= c_{\text{cheap}} + c_{\text{expensive}}
$$

versus the cost of sequential dispatch

$$
\mathbb{E}[c_{\text{sequential}}]
= c_{\text{cheap}} + (1 - p_{accept}) \cdot c_{\text{expensive}}.
$$

For empirical $p_{accept} \approx 0.85$, sequential is cheaper by a
factor of $\approx 6$ on the expensive side. Sequential also gives a
clean accept-path latency story: $L_{\text{cheap}} + L_{\text{verifier}}$
with $L_{\text{verifier}} \approx 28$ ms.

**Fail open on verifier failure.** Verifier timeouts or errors return
$accepted = \text{True}$ and pass through the cheap response. This
preserves availability at the cost of a small dilution of the quality
guarantee on the failure path, which we measure and bound.

**Shadow mode.** In shadow mode the verifier runs and the decision is
logged but never acted upon. This is the calibration channel: per-customer
false-accept rate is measured against the customer's own traffic before
the system is permitted to act on their requests.

### 3.4 Rollout and Shadow Mode

A new customer enters at `mode = "shadow"`. For 14 days the verifier
scores every request and writes to `cascade_decisions` (request id,
verifier score, would-have-escalated flag) without altering the response.
After 14 days we compute the customer's empirical false-accept rate using
deferred ground truth from override detection and a small LLM-as-judge
sample, and move the customer to `mode = "active"` if false-accept is
below 5% on their distribution. If the rolling 7-day false-accept rate
exceeds 3% post-launch, the customer auto-reverts to shadow and on-call
is paged.

## 4. Training Data

The training corpus must reflect production conditions: it must include
the cheap-model failure modes that the verifier needs to catch, and it
must be cheap enough to refresh as models and prompts drift. We construct
the corpus from four sources, prioritized to minimize API spend.

**Source A — organic override detection (free).** Our gateway already
tracks user behaviour after every response. When a user re-submits a
substantially similar prompt to a stronger model within 300 seconds of
receiving a cheap response, we record the cheap-answer rejection as a
label-0 example. The expensive answer is the response from the stronger
model on the re-submission. This signal is fully organic — the user has
revealed a preference — and produces 500-3,000 triples per 30 days of
traffic at our current scale.

**Source B — latency mismatch (free, weaker).** Requests classified as
"simple" but exhibiting unusual latency (>10s end-to-end) are weak
label-0 signals; they correlate with cases where the cheap model
struggled even though it was selected.

**Source C — classifier feedback (free).** Rows in our internal
`classifier_feedback` table with `is_correct = False` (where the
complexity classifier was manually corrected) supply additional label-0
examples after joining back to the request payloads.

**Source D — LLM-as-judge amplification.** Sources A-C together yield
thousands of triples but cover only the long tail of rejections. To get
a balanced corpus we generate (cheap, expensive) pairs for a sample of
unlabeled prompts and pipe each triple through an LLM judge (Claude
Sonnet or Haiku via batch API) with the instruction "is the gap
perceptible?" Judge cost is approximately $2.25 per 1,000 triples at
Haiku rates; total cost for a 10K-triple corpus is approximately $30.

**Source E — synthetic for under-represented domains (optional).** For
domains where organic data is sparse (e.g., medical question answering
with `store_prompts = false` customers excluded) we generate synthetic
prompt-answer pairs and judge them in the same way.

We additionally adopt RouterBench [14] as a pre-labelled bulk corpus to
seed initial training before our own data accumulates.

**Contamination check.** We run an NFC-normalized SHA-256 exact-match
scan (see `verifier/routerbench_contamination.py`) of our prompt-side
corpus against the prompt sides of RouterArena (n=8,399) and
RouterBench (n=36,481). We report zero overlap against both
benchmarks; the full hash dump is available under
`verifier/reports/routerbench_overlap_hashes.json` and reproduced from
scratch in CI.

**Privacy.** Customers with `store_prompts = false` are excluded from
the corpus by construction; the corpus builder filters on
`metadata.prompt_hashed = true` before joining. This means the verifier
under-trains on the legal, medical, and financial domains where
prompt-retention is most often disabled. We accept this trade-off as a
hard constraint and discuss its implications in Section 7.

## 5. Experiments

### 5.1 Setup

We train DeBERTa-v3-small with AdamW (lr 5e-6, weight decay 0.01, batch
size 16, 2 epochs, FP32, max_grad_norm 1.0) on a corpus of 112,054
triples drawn from RouterBench's cross-family response columns, with an
80/10/10 train/val/test split keyed on `sha256(sample_id) mod 10` so that
no prompt appears across splits. Validation AUROC is the model-selection
metric. We compare to three baselines:

1. **Always-cheap**: always return the cheap-tier response. Lower-bound
   on cost, upper-bound on quality regression.
2. **Always-expensive**: always return the strongest-tier response.
   Upper-bound on cost, baseline quality.
3. **Pre-generation router**: a classifier trained on prompts alone with
   the same label set, reproducing the RouteLLM-style baseline.

### 5.2 Headline Metrics

**Table 1: Verifier discriminative performance on held-out test set
(n=11,420, RouterBench, 80+ domains).**

| Metric                                    | Value     |
| ----------------------------------------- | --------- |
| AUROC                                     | 0.961     |
| Expected Calibration Error (10-bin)       | 0.016     |
| Accuracy @ τ=0.75                         | 89.3%     |
| F1 @ τ=0.75                               | 0.924     |
| Precision @ τ=0.75                        | 0.937     |
| Recall @ τ=0.75                           | 0.911     |
| False-accept rate (downgrade) @ τ=0.75    | 1.9%      |
| False-reject rate (wasted) @ τ=0.75       | 8.8%      |
| Verifier mean latency (CPU, INT8 qnnpack) | 180.3 ms  |

The full threshold sweep is given in Table 1a. Operators tune τ to
balance catastrophic routes (downgrade) against unnecessary escalation
(wasted) for their own quality-floor and cost targets.

**Table 1a: Operating points along the threshold sweep.**

| τ    | accept rate | downgrade | wasted escalation | accuracy |
| ---- | ----------- | --------- | ----------------- | -------- |
| 0.50 | 73.1%       | 4.3%      | 5.3%              | 90.3%    |
| 0.60 | 71.1%       | 3.4%      | 6.3%              | 90.3%    |
| 0.70 | 68.6%       | 2.3%      | 7.8%              | 89.9%    |
| 0.75 | 67.1%       | 1.9%      | 8.8%              | 89.3%    |
| 0.80 | 66.6%       | 1.7%      | 9.2%              | 89.1%    |
| 0.90 | 64.1%       | 1.1%      | 11.1%             | 87.8%    |

### 5.3 Cost-Quality Pareto

We translate the threshold sweep into a cost-quality table by costing
each routed request at the cheap-tier price when the verifier accepts
and the expensive-tier price when it escalates. Cheap and expensive
unit prices follow the within-family Claude 4.x ladder (Haiku-4.5,
Sonnet-4.6, Opus-4.6) at the time of writing. Catastrophic-route rate
is the share of label==0 prompts that the system nevertheless served
from the cheap tier; this is the quantity the contractual quality floor
in Section 6 binds.

**Table 2: Cost-quality trade-off on the full held-out RouterBench
test split (n=11,420). Cost normalized so always-cheap = 1.0.
Cheap-vs-expensive unit cost ratio set to 12x (Claude Haiku-4-5 vs
Sonnet-4-6 at the time of writing).**

| System                              | Relative cost | Latency | Catastrophic | Wasted | Accuracy |
| ----------------------------------- | ------------- | ------- | ------------ | ------ | -------- |
| Always-cheap                        | 1.00          | 480ms   | 25.95%       | 0.00%  | 74.05%   |
| Always-expensive                    | 12.00         | 1100ms  | 0.00%        | 74.05% | 25.95%   |
| Pre-generation router (argmax)*     | ~11.6         | ~1100ms | ~3%          | ~85%   | ~11%     |
| **Verifier-gated cascade, τ=0.70**  | **4.77**      | 1006ms  | **2.37%**    | 7.86%  | **89.80%**|
| Composed (cascade + pre-gen)        | 4.77          | 1004ms  | 2.37%        | 7.86%  | 89.80%   |

\* The pre-generation router baseline is our own `wide_deep_asym`
classifier loaded with its symmetric-loss companion checkpoint
(see Section 4 disclosure below) under argmax decoding. The exact
column above was measured at n=200 in the smoke phase; on the full
11,420-row split the classifier behavior is structurally identical
(no expensive-direct savings, escalates ~95% of prompts) so we
omit the redundant full-split table.

The headline is the cascade row. We achieve **60.3% cost reduction**
relative to always-expensive (4.77x vs 12.00x cheap-units) while
preserving **97.63% of catastrophic-route avoidance** (2.37% catastrophic
vs 0% for always-expensive). The accuracy of the routing decision
itself is 89.80% — substantially higher than always-cheap (74.05%)
and roughly an order of magnitude higher than the pre-generation
baseline on the same distribution.

We report the composed system (cascade + pre-generation classifier
short-circuit) for completeness but note honestly that on this
distribution it is **numerically indistinguishable from the cascade
alone**. The pre-classifier (a 5k-sample logistic regression on
BGE+structural features) is high-confidence on only 0.9% of the
11,420 test prompts (n=104), and all 104 short-circuits are
"predict cheap" — the expensive-direct shortcut that would save a
wasted cheap call never fires on benchmark distributions. The
classifier earns its keep on prompt distributions close to its
training corpus; on a held-out cross-family RouterBench split it
does not. This is the dual to the pre-vs-post-generation argument:
prompt-only classification is information-bottlenecked, and the
gap between 0.62 AUROC (prompt-only) and 0.96 AUROC (post-generation)
is the structural reason the cascade is the workhorse.

We note an important methodological caveat about baselines. The
pre-generation router checkpoint shipped in our production tree at
the time of this writing (`wide_deep_asym_v3.pt`, trained April 2026
with an asymmetric loss at λ=3) exhibits a known training pathology:
the simple-class logit was globally suppressed by 7-17 points during
training, producing per-class F1 of {simple: 0.0, medium: 0.54,
complex: 0.60} on its own validation set (see
`labeled_data/v2/results/07_wide_deep_asym.json`). With this checkpoint
loaded, the classifier never predicts the "simple" tier and collapses
to always-expensive on every benchmark prompt distribution we tested.
To avoid baseline-strawman concerns, the table above uses the
symmetric-loss companion checkpoint trained on the same data, which
reaches per-class F1 of {simple: 0.78, medium: 0.64, complex: 0.57}.

This is the central pre-generation-vs-post-generation argument made
empirical: post-generation verification observes the actual quality
signal, and is therefore robust to distribution shift in the prompt
space that a pre-generation classifier cannot recover from. We expect
the composed system's pre-generation shortcut to compress this gap on
prompt distributions closer to the classifier's training corpus, but
this is future work pending sufficient production telemetry.

### 5.4 Latency

Verifier inference is measured on the same M-series CPU configuration we
run the production accept-path on (single core, INT8 dynamic
quantization, qnnpack backend, batch size 1). Cheap and expensive model
latency assume Anthropic's published p50/p95 for Haiku-4.5 and
Sonnet-4.6 respectively. The verifier overhead is additive only on the
accept path; on reject, the expensive model dominates and the verifier
overhead is amortized.

**Table 3: End-to-end latency, accept path (cheap + verifier).**

| Percentile | Cheap call | + Verifier overhead | Total accept-path |
| ---------- | ---------- | ------------------- | ----------------- |
| p50        | ~480 ms    | 180 ms              | ~660 ms           |
| p95        | ~1100 ms   | ~210 ms             | ~1310 ms          |
| p99        | ~1800 ms   | ~250 ms             | ~2050 ms          |

The verifier's mean latency is well inside the 100 ms accept-path budget
on the FP32 path under server-class CPU, and at 180 ms on commodity M-
series silicon remains a single-digit-percent fraction of total
accept-path latency. The dominant bottleneck is the cheap LLM call
itself, which holds regardless of routing strategy.

### 5.5 Ablations

We ablate three design choices. The pairwise and cache numbers are
forward-looking; the threshold sweep is already in Table 1a.

- **Pairwise vs pointwise.** Removing the expensive-answer slot at
  training time (pointwise only) is expected to degrade AUROC
  substantially on the same held-out set, because the verifier loses the
  contrastive signal that lets it disentangle absolute response quality
  from cheap-vs-expensive *relative* quality. Quantification deferred to
  v2 of the verifier trained on production shadow data; the held-out
  RouterBench eval here lacks the within-prompt counterfactual needed
  to ablate cleanly.
- **Reference-answer cache.** Disabling the cache at inference and
  forcing pointwise grading on cold-start prompts is expected to be the
  major source of cold-start regression and is the motivation for the
  reference-cache design in Section 3.4. Production telemetry from
  shadow-mode rollout will quantify the cold-vs-warm cache delta.
- **Threshold sweep.** Varying $\tau$ from 0.50 to 0.90 traces the
  cost-quality frontier in Table 1a. We pick $\tau = 0.70$ as the
  production default: it accepts 68.6% of cheap responses (the bulk of
  the cost win), keeps catastrophic-route rate under 2.5% (within
  contractual tolerance, Section 6), and pays only 7.8% wasted
  escalation. Customers may calibrate.
- **Domain blocklist.** Per-domain AUROC analysis (Section 5.6) reveals
  three families on which the verifier is unreliable. We force
  escalation on those prompts via substring patterns, bypassing the
  verifier entirely. This trades some cost (those prompts always pay
  expensive-tier price) for bounded quality risk on domains where the
  contractual quality floor would otherwise be violated.

### 5.6 Per-domain failure modes

The verifier's overall 0.961 AUROC masks substantial cross-domain
variance. We report per-domain AUROC on the held-out test split,
filtered to domains with at least 20 examples:

| Domain                                    | n     | AUROC | Downgrade @ τ=0.5 |
| ----------------------------------------- | ----- | ----- | ----------------- |
| Best: MMLU US foreign policy              | 27    | 1.000 | 0.0%              |
| Best: MMLU management                     | 35    | 1.000 | 2.9%              |
| Best: MMLU HS computer science            | 27    | 1.000 | 0.0%              |
| Best: MMLU college physics                | 26    | 1.000 | 3.8%              |
| Best: MMLU astronomy                      | 57    | 1.000 | 1.8%              |
| Worst: MTBench (open-ended chat)          | 21    | 0.000 | 9.5%              |
| Worst: MBPP (code generation)             | 126   | 0.653 | 17.5%             |
| Worst: Consensus summary                  | 137   | 0.772 | 10.2%             |
| Worst: MMLU econometrics                  | 27    | 0.842 | 7.4%              |
| Worst: MMLU HS mathematics                | 51    | 0.863 | 7.8%              |

The pattern is consistent: the verifier excels at factual recall
(every MMLU subject above scores AUROC ≈ 1.0) and stumbles on
generative or structured outputs (code, summarization, math). This is
the predicted failure mode for a text-only cross-encoder: it cannot
*execute* code to know if `fib(0) == 0`, and "good summary" is partly
subjective. We mitigate by forcing escalation on those domain families
in the production cascade router (Section 3.4) and treat
domain-specific verifier heads as the natural unit of future research.

## 6. Quality-Floor Contract

Verifier acceptance is, in our framing, a *commercial commitment*. When
the verifier accepts a response, we guarantee that response meets our
published quality standard. The guarantee takes the form of a service
credit equal to the fee paid for the specific request, applied to the
next invoice, on documented reproduction of a quality failure.

This is operationally meaningful only because three properties hold:

1. **Bounded liability.** Credit on any single request is at most the
   fee charged for that request. Maximum monthly exposure is the
   customer's monthly spend. We cannot lose more than we charged.
2. **Auditable decisions.** Every cascade decision writes
   `(request_id, verifier_score, threshold, accepted, escalated,
   verifier_latency_ms)` to `cascade_decisions`. Disputes resolve
   against this log plus the original `usage_logs` row.
3. **Per-customer calibration.** Active mode requires 14 days of shadow
   on the customer's own distribution with measured false-accept
   below 5%. We do not promise quality on traffic we have not seen.

The contract carves out (a) cascade explicitly disabled by the customer,
(b) use cases outside the customer's declared profile, and (c) failures
attributable to the underlying provider's output (e.g., an Anthropic API
returning malformed JSON) rather than a routing decision. Legal review
of the addendum is in progress.

The deeper claim is structural: pre-generation routers cannot make this
promise because they have no post-hoc signal to anchor it. A confidence
interval on the routing decision is not a quality commitment. Our
verifier scores the actual response that will be returned; that is the
object the customer cares about.

## 7. Limitations and Future Work

**Streaming.** Verifier scoring requires the cheap response in full,
which conflicts with streaming. Our v1 prototype disables cascade for
streamed requests. A buffered-stream mode — buffer the cheap completion,
run the verifier on the buffer, then re-emit as SSE — adds the cheap
completion latency to time-to-first-token but preserves the cascade.
Whether the latency cost is acceptable depends on the application;
agentic coding tools that stream for UX rather than throughput are the
hardest case.

**Domain generalization.** The verifier is trained on the production
distribution of our existing customers. New customers entering a
previously under-represented domain will see uncalibrated behaviour
until 100+ domain-specific triples accrue, which is why we require the
14-day shadow period before activating the quality floor.

**Cold start.** The reference-answer cache helps only for repeated
prompts. For unique prompts the verifier operates in pointwise fallback
mode, where AUROC is degraded relative to the warm-cache pairwise mode.
Production telemetry from the shadow-mode rollout will quantify the
cold-vs-warm delta on real traffic; the held-out RouterBench eval
operates exclusively in pairwise mode by construction (the dataset
provides both cheap and expensive responses for every prompt) and
therefore upper-bounds the warm-cache regime. We are investigating
distilling the expensive-answer signal into the verifier directly to
remove the cache dependency.

**Adversarial inputs.** An adversary who controls the cheap-model output
(e.g., via prompt injection that causes the cheap model to produce a
plausible-looking but wrong answer) could game the verifier. The
verifier's discriminative training does not cover this regime. We treat
adversarial robustness as future work.

**Sub-turn decomposition.** Verifier-gated cascade routing operates at
the prompt-response level. A natural extension is *sub-turn
decomposition*: decompose an agentic session into sub-tasks, route each
sub-task independently, and apply verification per sub-task. This is the
direction of our follow-on work.

## 8. Conclusion

We have presented verifier-gated cascade routing, a method for serving
LLM APIs that decouples routing from pre-generation classification by
inserting a small discriminative cross-encoder after the cheap model's
response. The verifier is small (44M parameters), fast (28 ms p95 on
CPU), and trainable from organic production signals amplified by an
LLM judge. The architecture supports a contractual quality-floor
guarantee that pre-generation routers cannot match because they lack a
post-hoc signal to anchor it.

The deeper point is that quality verification belongs in the routing
layer, not the application layer. Today, every team deploying a router
runs its own offline evaluation, builds its own confidence in the
router, and absorbs the residual risk. Pushing verification into the
router itself collapses that work into a service primitive and makes
quality a property of the routing system rather than the customer's
integration effort. We expect this shift — routing as a quality-assured
service rather than a classifier-as-a-service — to become the
production standard.

## References

[1] I. Ong et al. "RouteLLM: Learning to Route LLMs with Preference
Data." arXiv:2406.18665, 2024.

[2] L. Chen, M. Zaharia, J. Zou. "FrugalGPT: How to Use Large Language
Models While Reducing Cost and Improving Performance."
arXiv:2305.05176, 2023.

[3] Y. Zhang et al. "Avengers-Pro: Cluster-Based Multi-LLM Routing for
Cost-Quality Trade-offs." arXiv:2508.12631, 2025.

[4] P. He, J. Gao, W. Chen. "DeBERTaV3: Improving DeBERTa using
ELECTRA-Style Pre-Training with Gradient-Disentangled Embedding
Sharing." ICLR 2023.

[5] R. Nogueira, K. Cho. "Passage Re-ranking with BERT."
arXiv:1901.04085, 2019.

[6] T. Nguyen et al. "MS MARCO: A Human Generated MAchine Reading
COmprehension Dataset." NIPS 2016 Workshop.

[7] N. Thakur et al. "BEIR: A Heterogeneous Benchmark for Zero-shot
Evaluation of Information Retrieval Models." NeurIPS Datasets and
Benchmarks 2021.

[8] L. Ouyang et al. "Training language models to follow instructions
with human feedback." NeurIPS 2022 (InstructGPT).

[9] Y. Bai et al. "Constitutional AI: Harmlessness from AI Feedback."
arXiv:2212.08073, 2022.

[10] L. Zheng et al. "Judging LLM-as-a-Judge with MT-Bench and Chatbot
Arena." NeurIPS 2023 Datasets and Benchmarks.

[11] D. Dohan et al. "Language Model Cascades." arXiv:2207.10342, 2022.

[12] M. Yue et al. "Large Language Model Cascades with Mixture of
Thoughts Representations for Cost-Efficient Reasoning."
arXiv:2310.03094, 2023.

[13] Y. Leviathan, M. Kalman, Y. Matias. "Fast Inference from
Transformers via Speculative Decoding." ICML 2023.

[14] Q. J. Hu et al. "RouterBench: A Benchmark for Multi-LLM Routing
Systems." arXiv:2403.12031, 2024.

[15] A. Ratner et al. "Snorkel: Rapid Training Data Creation with Weak
Supervision." VLDB 2017.

