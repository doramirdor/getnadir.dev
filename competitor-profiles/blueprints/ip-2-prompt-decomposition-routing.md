# IP #2 Blueprint — Prompt Decomposition Routing (PDR)

**Generated**: 2026-05-24 (Cycle 3)
**Status**: Blueprint only. No LLM API calls speced. All corpus-generation work marked PENDING FOUNDER APPROVAL.

---

## 1. Core thesis

Existing routers (including Nadir's `wide_deep_asym`) make a single decision per request. Optimal for atomic prompts; structurally wasteful for agentic sessions. A 50-turn Claude Code session is roughly:

- 30-35% EXECUTE (run command, apply patch) — Haiku
- 20-25% READ (consume tool result, summarize file) — Haiku/Sonnet
- 15-20% WRITE_CODE — Sonnet
- 10-15% PLAN — Opus
- 5-10% INTERPRET_ERROR — Opus/Sonnet
- 5% REFLECT — Sonnet/Opus

Routing the whole session to Opus costs 3-4x what PDR-routed costs. PDR is the CPU instruction-level parallelism analogy: schedule at the instruction (sub-task) level, not the program (prompt) level.

---

## 2. Cognitive sub-task taxonomy

Eight canonical types. **Schema is public IP (open-source); classifier weights are proprietary.**

| Sub-Task | Description | Default Tier | Signal |
|---|---|---|---|
| PLAN | Multi-step planning, architecture | complex (Opus) | High structural_complexity, imperative future tense |
| INTERPRET_ERROR | Root-cause analysis, debugging | complex (Opus) | Stack frames, exception patterns, error text |
| WRITE_CODE | Code generation beyond trivial edits | medium (Sonnet) | Function/class targets, generation intent |
| REFLECT | Meta-cognition, approach validation | medium (Sonnet) | Evaluative language, reflexive framing |
| READ | Consume/summarize tool output | simple (Haiku) | Preceded by tool_result, summarization imperative |
| EXECUTE | Single deterministic instruction | simple (Haiku) | Imperative verb, explicit target |
| SUMMARIZE | Compression of existing content | simple (Haiku) | "summarize", "tldr", compression framing |
| TRANSLATE | Format conversion, no new reasoning | simple (Haiku) | Explicit source/target format |

```python
# backend/app/services/decomposer_taxonomy.py
class SubTaskType(Enum):
    PLAN, INTERPRET_ERROR, WRITE_CODE, REFLECT,
    READ, EXECUTE, SUMMARIZE, TRANSLATE

SUBTASK_DEFAULT_TIER: dict[SubTaskType, str] = { ... }

@dataclass
class DecomposerDecision:
    sub_task: SubTaskType
    confidence: float
    tier: str
    model: str
    turn_index: int
    latency_ms: int
    source: str  # 'classifier' | 'heuristic_fallback' | 'override'
```

---

## 3. Two modes

**Mode A — Turn-aware routing (Cycle 4, ship first)**: classify the last user turn in a multi-turn conversation. Override tier decision. Same client interface. Drop-in replacement for the current single-complexity-analysis call in `anthropic_messages.py:151-192`. No recomposition, no protocol changes, no latency budget beyond classifier inference.

**Mode B — Sub-turn decomposition (Cycle 5+, research-grade)**: decompose a single prompt into ordered sub-tasks. Route each piece. Recompose into one response. Opt-in via `model_parameters.pdr.mode_b`. ~200-400ms decompose+recompose overhead.

**Ship Mode A first. Do not block Mode A on Mode B.**

---

## 4. Decomposer model architecture

### Mode A classifier

- **Input**: conversation_history (last K=5 turns mean-pooled) + current_turn_text
- **Architecture**: reuse the existing BGE-base-en-v1.5 singleton from `wide_deep_asym_analyzer.py:_get_encoder()`. New head on top: Linear(1569 → 256) → ReLU → Dropout(0.2) → Linear(256, 8) → Softmax.
- **Input dim**: 768 turn + 768 history + 33 structural features = 1569
- **Output**: 8-class probability + argmax label
- **Latency**: <30ms p95 CPU (encoder already warm; new head adds <2ms)
- **Confidence threshold**: if max(softmax) < 0.55, fall back to existing analyzer (`source="heuristic_fallback"`). Never guess.

### Mode B decomposition model

- **Architecture**: T5-small (60M params), fine-tuned to output JSON: `[{"span":[0,124], "sub_task":"PLAN", "tier":"complex"}, ...]`
- **Latency**: <200ms p95 CPU (opt-in only; never default)
- **Grounding**: Skeleton-of-Thought (Ning et al. 2023), Tree-of-Thoughts (Yao et al. 2023), LLM Programs (Schuster et al. 2022), Language Model Cascades (Dohan et al. 2022)

---

## 5. Recomposition algorithm (Mode B)

**Hardest problem in Mode B**: making the recomposed response read as if one model wrote it.

**Three strategies, recommendation = B**:

- **A — Sequential concatenation with markers**: cheap, fails on coherence (voice drift between models). Reject.
- **B — Orchestrator-fills (recommended)**: planning-tier model (Opus) produces a structured scaffold with `{{FILL:N}}` markers; execution-tier models fill each marker; Opus assembles. Voice consistent because Opus owns the structure. Cost advantage comes from cheap fill-in models.
- **C — JSON-formatted multi-piece, client renders**: requires protocol changes and client awareness. Reject as a transparent drop-in.

**Implementation sketch (orchestrator-fills)**:
1. Decomposer outputs `[(span, sub_task, tier)]`
2. Opus receives original prompt + decomposition manifest, generates scaffold with `{{FILL:N}}` markers
3. Each marker → route sub-prompt to tier-appropriate model (asyncio.gather)
4. Substitute fills into scaffold
5. Return assembled string as single Anthropic response

**Coherence guard**: sentence-embedding cosine similarity between adjacent paragraphs. If < 0.4, fall back to single-model routing and log the failure mode for training data.

---

## 6. Training data plan

**PENDING FOUNDER APPROVAL for all LLM API calls in this section.**

### Mode A corpus

- **Source**: `usage_logs` table, filtered to agentic clients (Claude Code / Codex / opencode via user_agent).
- **Labels**: 4-strategy approach, OAuth-first
  1. **Human seed (500-1000 turns, no API cost)**: export diverse turns, PII-stripped via existing `_redact_for_privacy`, label manually. Canonical ground truth for eval.
  2. **OAuth-judge expansion (default path, $0)**: pipe seed-labeled + new turns through Claude Max subscription via existing OAuth integration. Same plumbing as IP-1 Source D-OAuth. Rate-limited to ~1K labels/day on Max tier. Validation-first: 50-100 sample turns reviewed before scaling.
  3. **LLM-as-judge API expansion (~$30 for 10K, ESCALATION ONLY)**: triggered only when OAuth throughput is the bottleneck and we need faster turnaround for retraining.
  4. **Active learning**: train on seed, queue low-confidence turns for review. Reduces labeling cost 60-70% (Settles 2009).
- **Target size**: 5K-10K labeled turns. Sufficient for 8-class head on frozen BGE embeddings (few-shot transfer regime).

**FOUNDER APPROVAL GATES** (same shape as IP-1):
1. Anthropic TOS confirmation for programmatic-batch labeling via subscription
2. Manual review of 50-100 validation-slice labels before full batch
3. API-spend escalation only when OAuth path shows limits

### Mode B corpus

- **Synthetic decomposition seeds**: 200-300 hand-crafted complex prompts with gold decomposition JSON. T5 fine-tuning seeds.
- **Augmentation**: paraphrase prompts, verify decomposition invariance.
- **PENDING FOUNDER APPROVAL** for any generative LLM augmentation.

**Trade secret**: both corpora. Taxonomy schema is released publicly; data and weights stay proprietary.

---

## 7. Integration

### Opt-in flags (additive, no migration)

```json
"pdr": {
  "enabled": false,
  "mode_b": false,
  "confidence_threshold": 0.55,
  "tier_overrides": {}
}
```

Defaults `false`. Same pattern as `layers.routing/fallback/optimize` at `production_completion.py:341`.

### Integration point

`_route_messages_model()` at `anthropic_messages.py:151`. One conditional block:

```python
pdr_cfg = model_params.get("pdr", {})
if pdr_cfg.get("enabled"):
    decision = await decomposer.classify_turn(body, user_config, threshold)
    if decision.source != "heuristic_fallback":
        return {"model": decision.model, "provider": ..., "analysis": {
            "strategy": "pdr_mode_a", "sub_task": decision.sub_task.value,
            "confidence": decision.confidence, "pdr_tier": decision.tier,
        }}
# fall through to existing pipeline
```

If decomposer raises for any reason, fallback to existing pipeline. **Zero regression risk on happy path.**

### New files

- `backend/app/services/decomposer_taxonomy.py` — 80 lines, pure stdlib
- `backend/app/services/decomposer.py` — Mode A classifier with heuristic fallback when model file missing
- `backend/app/services/decomposer_orchestrator.py` — Mode B (cycle 5+)
- `backend/migrations/decomposer_decisions.sql`:

```sql
CREATE TABLE IF NOT EXISTS decomposer_decisions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    api_key_id      uuid,
    request_id      text NOT NULL,
    turn_index      int  NOT NULL DEFAULT 0,
    sub_task        text NOT NULL,
    confidence      float8 NOT NULL,
    tier_assigned   text NOT NULL,
    model_assigned  text NOT NULL,
    source          text NOT NULL,
    latency_ms      int,
    pdr_mode        text NOT NULL DEFAULT 'mode_a',
    metadata        jsonb
);

CREATE INDEX IF NOT EXISTS decomposer_decisions_user_idx ON decomposer_decisions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS decomposer_decisions_request_idx ON decomposer_decisions (request_id);
```

---

## 8. Data flow (Mode A)

```
Client: POST /v1/messages {messages:[..., user turn], stream:true}
  → _route_messages_model(body, user, requested_model)
      → pdr_cfg = model_params["pdr"]
      → IF pdr.enabled:
           decomposer.classify_turn(body, user_config, threshold)
             → _extract_routing_text(body)  [existing helper]
             → encode turn via BGE singleton  [reused]
             → encode history (last 5 turns mean-pool)
             → concat [turn | hist | struct_feats] = 1569-d
             → PDR head forward pass
             → DecomposerDecision(sub_task=PLAN, tier=complex, model="claude-opus-4-6", confidence=0.87)
           → return {model:"claude-opus-4-6", strategy:"pdr_mode_a", sub_task:"plan"}
      → ELSE: get_intelligent_model_recommendation_with_analysis()  [existing]
  → forward_body["model"] = "claude-opus-4-6"
  → _proxy_stream_claude(...)  [existing byte passthrough]
  → StreamingResponse

Background:
  → _log_stream_analytics(...)  [add pdr fields]
  → supabase INSERT decomposer_decisions  [best-effort]
```

---

## 9. Public proof + paper

**Title**: "Prompt Decomposition Routing: Sub-Task-Aware Inference for LLM Pipelines"

**Target**: arXiv preprint first (priority), then NeurIPS 2026 Efficient NLP or EMNLP 2026 LLM Efficiency workshop.

**Outline (8-12 pages ACL format)**:
1. Intro: prompt-as-atomic-unit assumption + motivating example. Headline numbers.
2. Background: RouteLLM, Weave Router, FrugalGPT. Distinction: all prior work routes at prompt level.
3. Taxonomy: 8 types, tier mapping rationale, schema as contribution.
4. Mode A: BGE + head, training setup, methodology (raw prompts not published, only aggregate stats).
5. Mode B: T5-small decomposer, orchestrator-fills, coherence guard.
6. Experiments: SWE-bench Verified, comparison vs always-Opus / always-Sonnet / Weave Router.
7. Analysis: per-sub-task accuracy, failure modes, latency breakdown.
8. Conclusion + open schema announcement.

**Headline target**: "PDR reduces cost on SWE-bench Verified agentic sessions by 65-70% with no statistically significant regression in resolution rate."

**HN angle**: "We routed Claude Code at the sub-task level instead of the session level. Haiku handled tool reads, Sonnet wrote code, Opus planned. 70% cost reduction with no behavior change."

---

## 10. IP defense

**Patent candidates (file before arXiv)**:
1. **Method claim**: decomposer-router-recomposer pipeline (classify cognitive sub-task → select tier → route while maintaining conversation coherence).
2. **Recomposition claim**: orchestrator-fills with planning-model scaffold and typed placeholders filled by execution-model sub-calls.
3. **Coherence guard claim**: sentence-similarity gate on recomposed output as a quality control mechanism.

**Open-source**: the taxonomy schema (`decomposer_taxonomy.py` + JSON Schema). Establishes Nadir as the author. Like JSON Schema for prompts.

**Trade secrets**:
- Labeled turn corpus from `usage_logs`
- Synthetic decomposition seeds
- Classifier checkpoint (`decomposer_head_v1.pt`)
- Structural feature thresholds tuned from real agentic traffic

---

## 11. What we own

End of Cycles 4+5:
- The cognitive sub-task taxonomy as a public standard Nadir authored
- Decomposer model weights (proprietary)
- Labeled training corpus (proprietary, trade secret)
- Recomposition algorithm (patent candidate)
- Two arXiv papers establishing academic priority
- SWE-bench Verified benchmark results (public, reproducible)
- Brand association: PDR = Nadir

---

## 12. Files

**Create**: `backend/app/services/decomposer_taxonomy.py`, `decomposer.py`, `decomposer_orchestrator.py` (cycle 5), `backend/migrations/decomposer_decisions.sql`, `pdr/README.md`, `pdr/train_mode_a.py`, `pdr/eval_mode_a.py`, `pdr/taxonomy_spec/subtask_schema.json`, `pdr/train_mode_b.py` (cycle 5).

**Modify**: `backend/app/api/anthropic_messages.py` (PDR branch in `_route_messages_model`), `backend/app/api/production_completion.py` (`_resolve_layers` docs), `backend/app/complexity/wide_deep_asym_analyzer.py` (export `get_encoder()`).

---

## 13. Test plan

**`backend/tests/test_decomposer.py`**:
- `test_classify_turn_plan`: planning prompt → PLAN, tier=complex
- `test_classify_turn_read`: prompt after tool_result → READ, tier=simple
- `test_fallback_on_low_confidence`: max softmax < threshold → `source="heuristic_fallback"`
- `test_pdr_disabled_by_default`: without `pdr.enabled`, `classify_turn` never called (assert_not_called)
- `test_taxonomy_tier_mapping`: all 8 types have mapping

**`backend/tests/test_decomposer_taxonomy.py`**:
- 8 enum members, no duplicates
- tier_overrides resolution works

**`backend/tests/test_pdr_integration.py`**:
- POST `/v1/messages` with `pdr.enabled=true` → response header `x-nadir-strategy` contains `pdr_mode_a`
- POST `/v1/messages` with `pdr.enabled=false` → strategy is `smart_route` (existing behavior preserved)

**Shadow-mode logging**: row inserted in `decomposer_decisions` matches `request_id`, `sub_task`, `confidence`.

**Eval harness (`pdr/eval_mode_a.py`)**:
- Held-out labeled corpus with gold labels
- Metrics: per-class accuracy, macro-F1, catastrophic-misclassification rate (PLAN as EXECUTE/TRANSLATE)
- Production gate: macro-F1 ≥ 0.82, catastrophic rate ≤ 1%
- Cost comparison: sum(pdr_routed_cost) vs sum(baseline_cost)

---

## 14. Risk register

| Risk | Prob | Impact | Mitigation |
|---|---|---|---|
| Misclassify PLAN as EXECUTE → Haiku → wrong plan | Medium | High | Confidence threshold 0.55 fallback; shadow mode before prod; macro-F1 ≥ 0.82 gate |
| Recomposition incoherence (Mode B) | High v1 | Medium | Coherence guard; auto-fallback to single-model; Mode B opt-in only |
| Customer surprised by mixed-model responses | Low (opt-in) | Medium | `x-nadir-pdr-breakdown` header; dashboard panel showing per-session routing |
| Latency over 50-turn loop | Low (Mode A) / Medium (Mode B) | Medium | Mode A reuses encoder singleton; log `decomposer_decisions.latency_ms`; alert p95 > 50ms |
| Synthetic corpus too narrow for Mode B | High v1 | Medium | Active learning; Mode B fallback always available; paper claims Mode A on SWE-bench only |

---

## 15. Build sequence

**Mode A — Cycle 4 (6-8 weeks)**

1. **Week 1**: `decomposer_taxonomy.py` + `test_decomposer_taxonomy.py`. Apply migration. Export `get_encoder()`.
2. **Week 2**: `decomposer.py` skeleton with heuristic fallback (regex on structural features, no model). All tests pass without ML.
3. **Weeks 3-4**: Export labeled corpus from `usage_logs` (PENDING APPROVAL for LLM-as-judge labels). Train PDR head. Validate macro-F1 ≥ 0.82.
4. **Week 5**: Integrate behind `pdr.enabled` flag. Shadow-mode logging only.
5. **Week 6**: Compare shadow decisions vs production. Validate savings real. Fix regressions.
6. **Week 7**: Enable for internal test keys. Eval harness on real sessions.
7. **Week 8**: Opt-in rollout. Doc + changelog.

**Mode B — Cycle 5+ (12-16 weeks)**

1. **Weeks 1-2**: Decomposition data (PENDING APPROVAL). Fine-tune T5-small.
2. **Weeks 3-4**: `decomposer_orchestrator.py` orchestrator-fills + coherence guard.
3. **Weeks 5-8**: Integration + eval. Mode B opt-in.
4. **Weeks 9-12**: SWE-bench Verified eval. Paper writeup. arXiv.
5. **Weeks 13-16**: Workshop submission. Blog. HN launch.

---

## 16. Open questions for reviewer

1. **Taxonomy completeness**: coding-first 8 types, or broader for non-coding agentic (support, doc processing)? Narrower means cleaner training data, risks missing customers.
2. **History window K**: 5 turns. Ablation needed: longer = better PLAN detection but higher cost.
3. **Per-user adaptation**: feed `decomposer_decisions` into per-user fine-tune (bandit pattern)? Or start global, add personalization later?
4. **Mode B streaming**: orchestrator-fills requires Opus scaffold complete before fills stream. First-token latency higher than single-model. Acceptable for opt-in audience?
5. **Dashboard surface**: PDR breakdown view in cycle 4 or cycle 5? Trust-building feature + marketing artifact, but UI cost.
