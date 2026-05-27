# Model Card — Nadir Router (RouterArena submission)

**Router name**: `nadir`
**Router family**: pre-generation tier classifier feeding a three-model
Anthropic ladder
**Production class**: `WideDeepAsymAnalyzer` (`wide_deep_asym_v3`)
**Inference artifact**: `backend/app/complexity/models/wide_deep_asym_v3.pt`
**Eval-only endpoint**: `POST /v1/route_only` (decision-only, no LLM call)
**Schema version**: 1
**Card last updated**: 2026-05-26

---

## 1. Model details

### Architecture

A wide-and-deep asymmetric classifier (`wide_deep_asym`) trained on
prompt features to predict a routing tier in `{simple, medium, complex}`.
The "wide" branch consumes structural and lexical features; the "deep"
branch consumes a BGE sentence-transformer embedding. Output is a
three-way softmax. Asymmetric training loss (λ = 3 in v3) penalizes
downgrades more heavily than upgrades.

Tier mapping for this submission (Anthropic Claude 4.x ladder):

| Tier | Model |
| --- | --- |
| simple | `claude-haiku-4-5` |
| medium | `claude-sonnet-4-6` |
| complex | `claude-opus-4-6` |

### Inputs / outputs

**Input**: a single user message (string). Multi-turn messages are
concatenated by the production analyzer before classification.

**Output**:

- `tier` in `{simple, medium, complex}`
- `model` (the corresponding Claude model name)
- `complexity_score` in `[0, 1]` (analyzer's raw score)
- `classifier_confidence` in `[0, 1]` (softmax top-class probability)
- `latency_ms` (analyzer latency, single-core CPU)
- `classifier_version` (`wide_deep_asym_v3`)

### Decision-only guarantee

The endpoint terminates **after** the classifier. No LLM is called, no
billing event is written, no `usage_logs` row is persisted. The
classifier artifact is hashed at first request and exposed in the
`x-nadir-classifier-sha` response header. A schema fingerprint is
computed at module load and returned in every response body. Either
hash changing mid-run aborts the leaderboard run.

---

## 2. Training data

Training is deliberately disjoint from RouterBench and (will be, pending
the audit in `SUBMISSION_PACKAGE.md` Block B) disjoint from RouterArena.

Sources used for `wide_deep_asym_v3`:

- Internal `backend/labeled_data/v3/combined_labeled.json` and its batch
  shards under `backend/labeled_data/v3/batches/*`
- Selected prior labeled batches under `v2/`, `raw/`, `batches/`

Verifier and pre-classifier corpora are stored separately (see
`verifier/data/`) and were used to train the cascade verifier, not the
pre-generation classifier shipped here.

### Contamination audit status

| Held-out set | Audit run | Overlap | Verdict |
| --- | --- | --- | --- |
| RouterBench `0shot` | 2026-05-24 | 0 of 36,481 | DISJOINT |
| RouterArena `sub_10` | NOT YET | N/A | **PENDING** |
| RouterArena `full` | NOT YET | N/A | **PENDING** |

The RouterArena audit is a hard prerequisite to opening the submission
PR; see `SUBMISSION_PACKAGE.md` Block B.

---

## 3. Performance

### Pre-generation classifier (this submission)

The `wide_deep_asym_v3` artifact is the production classifier. On its
own validation set, the asymmetric-loss v3 checkpoint exhibits a known
training pathology (simple-class collapse). The symmetric-loss
companion checkpoint is the one quoted in the paper as the
pre-generation baseline:

- Per-class F1: `{simple: 0.78, medium: 0.64, complex: 0.57}` (sym. ckpt)
- Per-class F1: `{simple: 0.00, medium: 0.54, complex: 0.60}` (asym. ckpt)

On RouterBench cross-family triples the pre-generation classifier is
information-bottlenecked: prompt-only AUROC is ~0.62. This is the
well-known pre-generation ceiling and is the motivation for our cascade
verifier (see Section 4 below; not part of *this* RouterArena
submission).

### Cascade verifier (separately published, not in RouterArena)

The verifier (DeBERTa-v3-small, INT8 quantized) reads
`(prompt, cheap_answer, expensive_answer)` post-generation and decides
whether to escalate. It is the IP we publish in
`verifier/paper/draft.md`. RouterArena does **not** grade post-generation
routers, so the verifier is out of scope for the RouterArena leaderboard
but is the headline result in our RouterBench reproduction
(`benchmarks/routerbench/REPRODUCTION.md`).

For reference, the cascade composed system numbers on RouterBench
n=11,420 are:

- AUROC 0.961, ECE 0.016
- At τ = 0.70: 68.6% accept, 2.4% downgrade, 7.9% wasted escalation,
  89.8% routing accuracy
- Composed cost 4.77x always-cheap (60.3% reduction vs always-Opus)
- Verifier latency 192.9 ms per call, single-core CPU, INT8 qnnpack

---

## 4. Intended use

- Pre-routing tier selection for production LLM workloads on the
  three-model Claude 4.x ladder.
- Public benchmark evaluation (RouterArena, RouterBench).

### Out of scope

- Not a quality verifier on its own. The cascade verifier is the
  component that closes the pre-generation gap; it is not part of this
  RouterArena submission.
- Not a guarantee of model output correctness. The router's job is to
  pick a model.
- Not validated on languages other than English at the published
  thresholds.

---

## 5. Limitations

1. **Pre-generation ceiling.** Prompt-only classification has bounded
   AUROC on cross-family distributions (~0.62 on RouterBench in our
   measurements). The router cannot know whether Haiku-4-5 will get the
   answer right; it can only know whether Haiku-4-5 *usually* gets that
   *kind* of prompt right. This is the architectural reason we shipped
   a post-generation cascade verifier.
2. **Per-domain variance.** Production cascade analysis shows AUROC ~1.0
   on MMLU-style factual recall and as low as 0.65 on code generation
   and 0.77 on summarization. The router itself does not have this
   instrumentation — only the verifier does — so this caveat applies in
   the verifier's published numbers, not directly to RouterArena.
3. **Training data is not adversarial.** The classifier has not been
   stress-tested against prompt-injection-style inputs designed to
   force a particular tier.
4. **Asymmetric loss at λ = 3.** The router prefers upgrades over
   downgrades, which inflates wasted-escalation rate on pure-cheap
   prompts. This is intentional: catastrophic downgrade is more
   expensive to us in customer trust than wasted Sonnet calls.

---

## 6. Pricing (for `model_cost.json`)

Prices below are **placeholders from the build blueprint** and must be
re-verified against Anthropic's published page on the day of
submission. The PR description must cite the URL and the date checked.

```json
{
  "claude-haiku-4-5":  { "input_token_price_per_million":  0.80, "output_token_price_per_million":  4.00 },
  "claude-sonnet-4-6": { "input_token_price_per_million":  3.00, "output_token_price_per_million": 15.00 },
  "claude-opus-4-6":   { "input_token_price_per_million": 15.00, "output_token_price_per_million": 75.00 }
}
```

RouterArena's cost schema does not include a cache-read column. We do
**not** ship our internal `_CACHE_READ_MULTIPLIER` in this diff.

---

## 7. Contact

- Project: getnadir.dev
- GitHub: github.com/NadirRouter
- Email (for RouterArena reviewers): hello@getnadir.dev

For methodology questions about the cascade verifier (not part of this
RouterArena submission), see `verifier/paper/draft.md`.
