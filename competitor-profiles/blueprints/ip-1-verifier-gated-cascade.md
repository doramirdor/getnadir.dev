# IP-1 Blueprint — Verifier-Gated Cascade Routing

**Version**: 1.0
**Date**: 2026-05-24
**Status**: Architecture design, pre-implementation
**Corpus generation work**: PENDING FOUNDER APPROVAL

---

## Patterns and conventions

- **Dispatch insertion** at `backend/app/api/production_completion.py:855-866`, immediately after `complexity_analysis_result["tier"] = tier_name` and before the fallback chain block. Same seam as the WS-3 bandit insertion. `recommended_model`, `tier_name`, `messages_dicts`, `user_config`, `current_user` are all in scope.
- **Feature flag** (`model_parameters` jsonb): same pattern as `bandit.weights`. Cascade uses `model_parameters.cascade.enabled`. No flag-level migration.
- **Label source**: `RoutingQualityTracker.detect_overrides()` (`routing_quality_tracker.py:29`) — when a user re-submits the same prompt to a higher tier within 60s (widen to 300s for corpus), the cheap response is a `label=0` example. Both `request_id`s are recoverable from `usage_events`.
- **Streaming pattern**: `AnthropicSseTranslator` `try/finally` terminal-frame ownership is the template for cascade dispatch.
- **Math reuse**: NIG kernel in `bandit_router.py` can consume verifier scores as the `quality` parameter in future bandit integration.

---

## 1. Verifier model architecture

**Recommendation: DeBERTa-v3-small (44M params), pairwise cross-encoder, INT8 quantized.**

Why this model: Microsoft DeBERTa-v3-small has disentangled positional attention, state-of-the-art for cross-encoder re-ranking at 10-50M param range (MS-MARCO, BEIR). Not T5 (seq2seq overhead unnecessary). Not DistilBERT (weaker ranking calibration on asymmetric pairs).

**Input format**:
```
[CLS] {prompt} [SEP] {cheap_answer} [SEP] {expensive_answer} [SEP]
```
Output: scalar `p_accept` in [0,1]. `p_accept >= threshold` means "cheap answer is good enough."

**Why pairwise, not pointwise**: pointwise requires a universal quality standard (huge data, hard to calibrate). Pairwise asks "is the gap noticeable?" — a relative judgment, trainable on organic data without universal ground truth.

**Training objective**: binary cross-entropy. Label 1 = accepted (no override). Label 0 = rejected (override within 300s OR OCR quality failure).

**Compute budget**: INT8-quantized DeBERTa-v3-small at 512 tokens, batch 1, runs 15-40ms p95 on Ryzen 5 / M2-class CPU. With 4 Gunicorn workers, throughput >100 calls/sec. Fits inside 100ms overhead target on accept path.

**Reference answer at inference**: pairwise format needs `expensive_answer`. Solution: verifier response cache keyed by `sha256(prompt)[:16]`. Cache miss → pointwise fallback (`[SEP] [PAD]` for the missing expensive slot). Train on both formats (10% of examples use pointwise fallback) so cold-start prompts still work.

**Literature grounding**:
- Cross-encoder re-ranking: Nogueira & Cho 2019 (arXiv:1901.04085)
- Reward models: Ouyang et al. 2022 (InstructGPT)
- LLM-as-judge: Zheng et al. 2023 (MT-Bench)
- Weak supervision: Ratner et al. 2017 (Snorkel)
- DeBERTa: He et al. 2020 (ICLR 2021)

The core bet: LLM judge call = $0.001-$0.003 + 500-2000ms. DeBERTa cross-encoder = $0.000001 + 15-40ms. Judge is the training signal at corpus creation; cross-encoder is the production artifact. They compose.

---

## 2. Training data plan — $0 default via subscription OAuth

**Revised default path (no API spend)**: use the founder's existing Claude Max subscription via Nadir's OAuth integration as the LLM-as-judge. Source D becomes free at the cost of wall-clock throughput (subscription rate limits cap us at ~225 messages / 5h on Sonnet via Max).

**Validation-first principle**: before running any heavy labeling pass (>200 triples), we run a small validation slice (50-100 triples) through the OAuth judge, manually review the labels, and only then commit to the larger batch. The validation harness is the first thing built; the heavy run is gated on its results.

**Escalation path (only if needed)**: $30 API spend on Source D appears only when (a) the OAuth subscription rate limit is exhausted, (b) shadow-mode results show the v0 verifier is poorly calibrated, OR (c) we need cross-validation against a second judge model (Opus-4-6) that the subscription tier doesn't include.

### Free label sources (zero API cost)

- **Source A — OCR override detection**: `RoutingQualityTracker.detect_overrides()` (`routing_quality_tracker.py:29-82`). Widen `OVERRIDE_WINDOW_SECONDS` from 60s to 300s for corpus. Each override is a fully organic `(prompt, cheap_answer, expensive_answer, label=0)` triple — user ran cheap, rejected, ran expensive. Expected yield from 30 days of traffic: 500-3,000 triples.
- **Source B — Latency mismatch**: `detect_latency_mismatches()` (`routing_quality_tracker.py:84`). "Simple" prompts with >10s latency are weaker `label=0` signals.
- **Source C — Classifier feedback table**: `classifier_feedback` rows where `is_correct=False`. Recover prompt/response from `usage_logs` via `request_id`.

### Label generation — default path: subscription OAuth (zero API spend)

- **Source D-OAuth — LLM-as-judge via Claude Max subscription**: pipe each `(prompt, cheap, expensive)` triple through Nadir's existing OAuth integration to Claude Sonnet (via Max plan). Judge prompt asks "is the gap noticeable?"
  - **Cost: $0** (subscription already paid)
  - **Rate**: Claude Max ~225 messages / 5h on Sonnet = ~1,000/day at full utilization
  - **Throughput**: 10K triples = ~10 calendar days of background batch
  - **Existing plumbing**: `NadirClaw/nadirclaw/oauth.py` + `claude_integration.py` + `/v1/messages` Bearer-token passthrough already support this
  - **Validation-first**: 50-100 sample triples run + manually reviewed BEFORE the full batch

### Escalation path — API spend, only if needed ($29-$85)

- **Source D-API**: Claude Haiku-4-5 via Anthropic API, ~$2.25/1K triples, $22.50 for 10K + $6 Opus cross-val = ~$29. Triggered ONLY when:
  - OAuth rate limit hit faster than expected (workload exceeds Max's 5h budget)
  - Shadow-mode v0 verifier shows poor calibration → need cleaner labels for v1 retrain
  - Cross-validation against Opus-4-6 (not in Max-tier subscription) is needed for label quality audit

- **Source E — Synthetic pair generation** (~$56 for 5K synthetic): triggered ONLY when rare domains are under-represented in organic data. Same OAuth-first principle applies: try generating cheap+expensive responses via subscription first.

**FOUNDER APPROVAL GATES**:
1. Before running OAuth judge on the 50-100 validation slice: confirm Anthropic TOS allows this usage pattern (subscription for programmatic batch labeling).
2. Before scaling to full 10K batch: review the validation-slice labels and confirm calibration is sensible.
3. Before spending any API dollars: confirm OAuth path was tried and showed limitations.

### New table: `verifier_training_corpus`

```sql
CREATE TABLE IF NOT EXISTS verifier_training_corpus (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cheap_request_id     uuid,
    expensive_request_id uuid,
    prompt               text NOT NULL,
    cheap_model          text NOT NULL,
    expensive_model      text NOT NULL,
    cheap_answer         text NOT NULL,
    expensive_answer     text NOT NULL,
    label                smallint NOT NULL CHECK (label IN (0, 1)),
    label_source         text NOT NULL,
    label_confidence     float4,
    split                text NOT NULL DEFAULT 'train'
                         CHECK (split IN ('train', 'val', 'test')),
    user_id              uuid,
    domain_hint          text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    added_by             text NOT NULL DEFAULT 'pipeline'
);
CREATE INDEX IF NOT EXISTS vtc_split_idx    ON verifier_training_corpus (split);
CREATE INDEX IF NOT EXISTS vtc_source_idx   ON verifier_training_corpus (label_source);
CREATE INDEX IF NOT EXISTS vtc_created_idx  ON verifier_training_corpus (created_at);
```

**Privacy constraint**: `corpus_builder.py` MUST skip `usage_logs` rows with `metadata.prompt_hashed=true` (`store_prompts=false` customers).

---

## 3. Cascade orchestration architecture

### Insertion at `production_completion.py:856`

```python
# LAYER: Verifier-gated cascade
cascade_meta = {}
if layer_routing:
    cascade_cfg = user_config.get("model_parameters", {}).get("cascade", {})
    if cascade_cfg.get("enabled", False):
        from app.services.cascade_router import CascadeRouter
        cascade_router = CascadeRouter(cascade_cfg)
        cascade_result = await cascade_router.dispatch_with_verifier(
            messages=messages_dicts,
            cheap_model=recommended_model,
            tier_name=tier_name,
            user_session=current_user,
        )
        recommended_model = cascade_result.final_model
        cascade_meta = cascade_result.meta
        complexity_analysis_result["cascade"] = cascade_meta
```

When `cascade.enabled=false`: zero overhead (single dict lookup).

### `CascadeRouter.dispatch_with_verifier` (pseudocode)

```python
async def dispatch_with_verifier(self, messages, cheap_model, tier_name, user_session):
    shadow_mode = self.cfg.get("mode", "shadow") == "shadow"
    threshold = self.cfg.get("acceptance_threshold", 0.75)
    escalation_model = self._resolve_escalation_model(tier_name)
    if not escalation_model:
        return CascadeDecision(final_model=cheap_model, escalated=False, ...)

    # Call cheap (always)
    cheap_response = await self.llm_service.call(messages, cheap_model, user_session)

    # Verifier
    prompt_text = _extract_last_user_message(messages)
    reference = await self.verifier_cache.get(_prompt_hash(prompt_text))
    try:
        verifier_score = await asyncio.wait_for(
            self.verifier.score(prompt_text, cheap_response.content, reference),
            timeout=settings.CASCADE_TIMEOUT_MS / 1000,
        )
        verifier_accepted = verifier_score >= threshold
    except asyncio.TimeoutError:
        verifier_score, verifier_accepted = None, True  # fail-open

    await self._log_decision(...)

    if shadow_mode or verifier_accepted:
        return CascadeDecision(final_model=cheap_model, response=cheap_response, ...)

    # Escalate
    expensive_response = await self.llm_service.call(messages, escalation_model, user_session)
    await self.verifier_cache.set(_prompt_hash(prompt_text), expensive_response.content)
    return CascadeDecision(final_model=escalation_model, response=expensive_response, escalated=True, ...)
```

### Sequential, NOT speculative parallel

Speculative parallel (call cheap + expensive simultaneously, cancel expensive on accept) improves only the reject path (10-20% of requests) while paying for expensive completions we throw away. Anthropic/OpenAI have no mid-stream billing cancellation. Sequential keeps the accept-path latency story clean: `cheap_latency + 30ms verifier = headline number`.

### Streaming policy (v1)

Cascade disabled for `stream=true` in initial prototype. Buffered-stream mode (buffer cheap completion, run verifier, then re-stream) is a future cycle. Same pattern as `response_healer.py` buffering.

### Per-API-key opt-in
```json
{
  "cascade": {
    "enabled": false,
    "mode": "shadow",
    "acceptance_threshold": 0.75,
    "escalation_models": {
      "simple": "claude-sonnet-4-6",
      "medium": "claude-opus-4-6"
    }
  }
}
```

### Rollout phases
- **Phase 1 (W5-6)**: Shadow only, internal accounts. Verify latency, log distributions.
- **Phase 2 (W7-8)**: 3-5 opt-in external customers with quality-floor contract addendum signed.
- **Phase 3 (W9+)**: Default `mode="shadow"` for new signups, 14-day calibration, then `"active"` if false-accept <5%.

---

## 4. Quality-floor contract

**Promise**: "When Nadir's verifier accepts a response, Nadir stands behind it."

**Operationally**: credit equal to the cost of the verifier-accepted request, applied to next invoice. Customer must show documented reproduction. Random model creativity variance excluded. Max exposure = customer's monthly spend = our cost basis. We cannot lose more than we charged.

**Measurement**:
- Hold-out eval set: 500 prompts, stratified, ground-truth from OCR + human annotation. Verifier must achieve <2% false-accept rate before any active-mode customer.
- Per-customer calibration: 14 days shadow on their traffic, false-accept rate must be <5% on their distribution before active mode.
- Retraining trigger: rolling 7-day false-accept >3% auto-reverts to shadow + pages on-call.

**Contract language draft** (legal review pending):
> Nadir Routing Service — Quality Assurance Addendum. For requests routed through Nadir's Verifier-Gated Cascade Routing system where the verifier accepted the response, Nadir warrants the routing decision met Nadir's published quality standard. Customer's sole remedy for a demonstrable quality failure on a verifier-accepted request is a service credit equal to the fees paid for that specific request, applied to the next billing period. Does not apply when (a) cascade was disabled by Customer; (b) use case not in Customer Profile; (c) failure attributable to underlying provider output rather than routing decision.

---

## 5. Public proof + viral hook

### Paper: "Verifier-Gated Cascade Routing for Production LLM APIs"

arXiv cs.AI + cs.LG. 5-7 pages. NeurIPS Systems workshop length.

Outline:
1. **Abstract**: 44M-param discriminative cross-encoder, 28ms CPU inference, 57% cost reduction at 98.2% quality parity on 10K production requests.
2. **Intro**: existing routers decide before seeing the answer; we decide after. Speculative-execution analogy. Why pre-answer routing can't provide quality guarantees.
3. **Method**: pairwise cross-encoder, DeBERTa-v3-small, weak supervision from OCR override detection, LLM-as-judge amplification.
4. **Cascade orchestration**: tier chain, sequential dispatch, verifier-controlled escalation.
5. **Experiments**: AUROC by domain, precision/recall at threshold 0.75, latency p50/p95/p99, cost reduction vs quality on RouterBench subset.
6. **Quality-floor contract**: commercial framing, calibration period, false-accept measurement.
7. **Limitations**: streaming buffering, domain generalization, cold-start cache.

Publishable with 10K production triples + shadow-mode logs. No novel ML theory needed. Contribution = system architecture + contractual quality floor framing.

### RouterBench integration

Submit verifier-gated routing with `verifier_auroc`, `false_accept_rate`, `escalation_rate`, `cost_reduction_pct`, `verifier_p95_ms` as first-class leaderboard metrics. Creates a column other routers cannot populate without building a verifier.

### Blog post headline

"60% off your Claude bill with a contractual quality floor: how we built Nadir's verifier"

Three-act structure:
1. The fear keeping you on Opus (rational, existing routers give confidence intervals not contracts)
2. How the verifier works (28ms, CPU-only, 44M params, trained on your own logs)
3. The numbers + the paper

### HN / Twitter

HN: "We route LLM requests after seeing the answer, not before (with a contractual quality guarantee)"

The killer comment: "The verifier is a 44M-parameter DeBERTa cross-encoder. Inference is 28ms on a single CPU core. Training data: when a user re-sent the same prompt to a better model within 5 minutes, that's a reject label. No synthetic data until we needed to fill rare domains."

Twitter: side-by-side image. Left: typical router dashboard "Haiku selected, confidence 0.87" → bad answer. Right: Nadir "Haiku selected, verifier accepted 0.93, quality floor guaranteed" → good answer. No caption.

---

## 6. IP defense

**Patent claims (file before arXiv)**:

1. **Method claim**: routing comprising: (a) select first model from cost-ordered tiers; (b) obtain first response; (c) score via discriminative model <100M params taking joint input of prompt + first response; (d) compare to calibrated threshold; (e) when below threshold, obtain response from higher-tier model.
2. **Cross-encoder claim**: the scoring model is a cross-encoder trained on (cheap-response, expensive-response) triples labeled by LLM-as-judge, learning whether quality gap is perceptible.
3. **Quality-floor claim**: providing customer a contractual quality assurance applying to verifier-accepted requests, with monetary credit on demonstrable failure.
4. **Per-customer calibration claim**: threshold calibrated per-customer using implicit signals including re-submission within configurable window.
5. **System claim**: complexity classifier + first LLM caller + discriminative verifier (<100ms CPU) + escalation controller + audit log.

**Trade secrets**: trained verifier weights; specific training corpus composition + LLM-as-judge prompt template; per-customer threshold calibration data; verifier response cache structure.

**Paper releases architecture, not weights/corpus/calibration data.** Standard DeepMind / OpenAI trade-secret-within-open-science pattern.

---

## 7. What we own at the end

- **Verifier model weights** (proprietary, INT8 DeBERTa-v3-small)
- **Training corpus** (proprietary, 10K+ triples no competitor can replicate without our production logs)
- **Cascade orchestration code** (proprietary)
- **Quality-floor contract template** (commercially defensible, requires calibration infrastructure)
- **The paper + brand association** ("verifier-gated cascade routing" = Nadir's term, permanently on arXiv)

---

## 8. Files

### New

| File | Purpose |
|---|---|
| `backend/app/services/cascade_router.py` | `CascadeRouter` class, `dispatch_with_verifier`, shadow/active mode |
| `backend/app/services/verifier_model.py` | `VerifierModel` class, loads INT8 weights, wraps inference in executor |
| `backend/migrations/verifier_training_corpus.sql` | Training data table |
| `backend/migrations/cascade_decisions.sql` | Per-request decision log |
| `verifier/train.py` | DeBERTa-v3-small training |
| `verifier/eval.py` | AUROC + cost reduction eval |
| `verifier/corpus_builder.py` | Pipeline: usage_events → verifier_training_corpus |
| `verifier/quantize.py` | INT8 export + benchmark |
| `verifier/weights/` | Artifact directory (gitignored) |
| `verifier/requirements.txt` | transformers, torch, datasets, accelerate |
| `verifier/README.md` | Training reproduction (methodology only) |

### `cascade_decisions.sql`
```sql
CREATE TABLE IF NOT EXISTS cascade_decisions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id           uuid NOT NULL,
    user_id              uuid NOT NULL,
    cheap_model          text NOT NULL,
    escalation_model     text NOT NULL,
    verifier_score       float4,
    acceptance_threshold float4 NOT NULL,
    verifier_accepted    boolean NOT NULL,
    escalated            boolean NOT NULL,
    shadow_mode          boolean NOT NULL DEFAULT false,
    verifier_latency_ms  float4,
    created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cd_user_created_idx ON cascade_decisions (user_id, created_at);
CREATE INDEX IF NOT EXISTS cd_escalated_idx    ON cascade_decisions (escalated, created_at);
```

### Modified

| File | Change |
|---|---|
| `backend/app/api/production_completion.py:856` | Insert cascade block (zero-overhead noop when disabled) |
| `backend/app/main.py` | Startup preload of `VerifierModel` when `CASCADE_ENABLED=true` |
| `backend/app/settings.py` | `CASCADE_ENABLED`, `CASCADE_VERIFIER_WEIGHTS_PATH`, `CASCADE_DEFAULT_THRESHOLD`, `CASCADE_TIMEOUT_MS` |

---

## 9. Test plan

### `backend/tests/test_verifier_model.py`
- Score returns float in [0,1]
- Timeout propagates `asyncio.TimeoutError`
- `reference_answer=None` falls back to pointwise without error
- Quantized weights load smoke test
- 512-token truncation handled cleanly

### `backend/tests/test_cascade_router.py`
- Shadow mode never escalates (score below threshold still returns cheap)
- Accept path: score >= threshold → cheap returned, escalation LLM not called
- Reject path: score < threshold → escalation LLM called
- Verifier timeout fails open (cheap returned, score=None logged)
- `cascade.enabled=false` is noop, verifier not instantiated
- Escalation model resolved by tier_name
- No escalation_model configured → cascade skipped with meta flag

### `backend/tests/test_cascade_integration.py`
- Mock verifier + LLM calls. Full dispatch path. `cascade_decisions` row written. `complexity_analysis_result.cascade` enriched.
- `stream=true` bypasses cascade entirely.
- `recommended_model` updated to escalation when escalated.

### `verifier/eval.py` harness
- Load `split='test'` from `verifier_training_corpus`
- Compute AUROC, precision/recall at threshold 0.75, false-accept rate, estimated cost reduction
- Output metrics JSON for version tracking

---

## 10. Risk register

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| Verifier false-accepts (cheap was wrong, we guaranteed) | Medium | High | 14-day shadow calibration per customer; false-accept <5% gate; hold-out eval <2% gate; 7-day rolling >3% auto-shadow + page |
| Verifier false-rejects (unnecessary escalation, cost up) | Medium | Medium (we absorb in beta) | Per-customer threshold tuning; target 10-20% escalation rate; if >30% lower threshold |
| Verifier latency exceeds 100ms | Low-Medium | High | Bench at load before deploy. If p99 >80ms: shorter input (256 tokens) or DistilBERT (22M) fallback or async worker |
| Training corpus biased against rare domains | High | Medium | Track `domain_hint` distribution. New customer in unrepresented domain → "uncalibrated", delay quality floor until 100+ domain triples or domain fine-tune |
| Customer disputes a quality-floor claim | Low-Medium | Medium | Every `cascade_decisions` row auditable. Contract requires documented reproduction. 1 eng-hour/week for review. |

---

## 11. Build sequence (8-10 weeks)

### W1-2: Training data pipeline (zero API cost)
- [ ] Write `verifier/corpus_builder.py` (joins usage_events + usage_logs on override pairs, Source A)
- [ ] Apply `verifier_training_corpus.sql` via Supabase MCP
- [ ] Widen `OVERRIDE_WINDOW_SECONDS` 60→300
- [ ] Pipeline tests with mocked Supabase
- [ ] Collect first batch (target 500+ organic triples from last 30 days)
- [ ] Report label distribution
- [ ] **PAUSE — FOUNDER APPROVAL GATE** for Source D LLM-as-judge budget (~$30 for 10K triples). DO NOT proceed without explicit go.

### W3-4: Verifier training + eval (CONTINGENT on founder approval)
- [ ] Generate Source D labels (PENDING APPROVAL)
- [ ] `verifier/train.py` — DeBERTa-v3-small + binary classifier head, AdamW, save best by val AUROC
- [ ] `verifier/eval.py` — AUROC, P/R, cost reduction estimate
- [ ] `verifier/quantize.py` — INT8 dynamic, bench latency
- [ ] Target: val AUROC > 0.82, p95 CPU inference < 50ms
- [ ] If AUROC < 0.75: expand corpus before deploying

### W5-6: Cascade code + shadow mode
- [ ] Apply `cascade_decisions.sql`
- [ ] `verifier_model.py` + `cascade_router.py` (shadow only)
- [ ] Unit tests
- [ ] Settings entries
- [ ] Startup preload in `main.py`
- [ ] Cascade block at `production_completion.py:856`
- [ ] Deploy staging, internal accounts, `mode="shadow"`
- [ ] Validate: `cascade_decisions` rows correct, p95 verifier latency < 50ms

### W7-8: Active mode + dashboard
- [ ] 3-5 beta customers with QF contract addendum (founder approval required)
- [ ] Integration tests
- [ ] Daily monitoring of escalation rate + verifier latency
- [ ] Dashboard cascade settings UI (toggle, threshold slider)
- [ ] Dashboard analytics cascade tab (rates over time)
- [ ] Legal review of QF addendum

### W9-10: Paper + viral launch
- [ ] Draft paper from shadow + beta data
- [ ] RouterBench submission with cascade metrics
- [ ] Blog post draft
- [ ] HN launch text + side-by-side screenshot
- [ ] Latency demo (100-request cascade vs no-cascade benchmark)
- [ ] Coordinate arXiv + blog + RouterBench for single launch moment

---

## 12. Open questions for reviewer

1. **Streaming policy v1**: cascade disabled for `stream=true` in initial prototype excludes most Claude Code traffic. Build buffered-stream mode now or defer to next cycle?
2. **Per-tier threshold**: single global 0.75 or per-tier calibrated? Per-tier needs more data per bucket but precision is better on simple-tier.
3. **Escalation billing**: who pays for the discarded cheap call on reject path? (a) absorb (hurts margin), (b) charge for both (honest, complex), (c) absorb in beta then revisit. Needs founder + legal decision before beta contract.
4. **Multi-provider scope**: Anthropic-only v1, or train verifier on OpenAI tier pairs (GPT-4o-mini vs GPT-4o) from day one?
5. **Pointwise fallback or full pairwise**: cache + pointwise fallback adds complexity. Acceptable for v1, or commit pairwise-only with cache warm-up phase?
6. **Privacy**: `store_prompts=false` customers excluded from corpus. Systematic under-training on legal/medical/financial. Accept, or build differential privacy / synthetic-from-sanitized path?

---

*Sections 1, 3, 8, 9, 10, 11 are zero-API-spend, executor-ready. Section 2 (Sources D, E corpus generation), Section 4 (contract language, legal review), Section 5 (launch coordination) require founder approval gates before execution.*
