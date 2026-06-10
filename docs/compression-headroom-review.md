# Compression Headroom Review & Kompress-Aware Routing

**Date:** 2026-06-10 · **Scope:** model router algorithm, context-optimize layer, and the
headroom-ai/Kompress package as a new compression stage.

## 1. Where the router stood

The smart-routing path is: complexity analyzer (heuristic → DistilBERT → wide-deep, per
config) → tier (simple/medium/complex) → per-tier model ranking by `cost` and
`quality_index` → optional cascade with verifier gating. The optimize layer
(`off | safe | aggressive`) runs after model selection and before cache-control
injection, applying deterministic transforms (system-prompt dedup, tool-schema dedup,
JSON minification, whitespace normalization, history trimming) plus semantic dedup via
MiniLM embeddings in aggressive mode.

Two cost levers were left on the table:

1. **Bulky tool/assistant context.** The deterministic transforms compact formatting but
   never summarize repetitive payloads (search results, logs, API dumps). On agentic
   traffic these dominate input tokens.
2. **Naive cost ranking.** Candidate models were compared on a 1:1 input/output blend of
   list prices. Routed traffic is input-heavy (~3:1), and the effective input price is
   further shaped by compression and provider cache-read discounts (Anthropic ~10% of
   list, OpenAI ~50%, Gemini ~25%) — none of which informed model choice.

## 2. The "kompress" package question

Three unrelated things carry the name:

| Candidate | What it is | Verdict |
|---|---|---|
| `kompress` (PyPI, karlicoss) | pathlib adapters for zip/gz archives | Irrelevant — file bytes, not tokens |
| NyunAI Kompress (`nyuntam`) | model-weight pruning/quantization, AGPL | Wrong layer for an API router; license risk |
| **`headroom-ai`** (Kompress transforms) | context-compression pipeline for LLM apps: SmartCrusher for structured tool output, cache-aligned transforms, `compress(messages, model=...)` API | **Adopted** — Apache-2.0, actively maintained (v0.24.0), deps already in our tree (litellm, tiktoken), CPU-fast |

Measured locally on a representative agentic conversation (minified search JSON + worker
logs): **28% additional input reduction on top of our safe transforms**, ~170 ms cold /
sub-ms-per-token warm on CPU, with message count, role order, and system/user content
byte-identical.

Key interaction found during research: **lossy compression must never touch the
cache-stable prefix.** A rewritten system prompt forfeits a ~90% cache-read discount to
gain a ~50% lossy reduction — strictly worse. The integration therefore hard-pins
`compress_system_messages=False`, never rewrites user messages, protects the most recent
turns, and verifies byte-stability before accepting a compressed result.

## 3. What changed

### New optimize mode: `kompress`
`layers.optimize: "off" | "safe" | "aggressive" | "kompress"`. Kompress mode runs every
aggressive transform, then `app/services/kompress_compressor.py` compresses bulky
tool/assistant context via headroom. Guards:

- skips prompts under ~1K estimated tokens (latency not worth it)
- accepts the result only if tokens shrink AND structure + protected content are intact
- degrades silently to `aggressive` when headroom-ai is missing or errors

### Compression-aware effective-cost rerank (`app/services/compression_policy.py`)
After the analyzer picks a model, `rerank_equal_quality()` may swap to a candidate whose
`quality_index` is within 1 point (i.e. equal quality) but whose **effective** cost is
lower, where effective cost = 3:1 input-weighted blend with the input share discounted by
the active optimize mode's expected compression and the provider's cache-read price
(litellm's `cache_read_input_token_cost` when available). Quality ordering is never
changed — this is a cost tie-break only, active only when the optimize layer is on, and
the decision is surfaced in `nadir_metadata` as `effective_cost_rerank`.

## 4. Why accuracy is unaffected

- Tier classification and quality ranking are untouched; the rerank only chooses among
  quality-equivalent candidates.
- Kompress never alters the system prompt, any user message, or the last 4 messages, and
  is rejected outright if it tries — so instructions and the live question always reach
  the model verbatim.
- Every stage is fail-open: any error returns the uncompressed messages and the
  analyzer's original pick.
- Validation: 17 new tests pin the byte-stability, structure, fallback, and rerank
  invariants; existing cache-control-flow tests pass unchanged. Recommended next step:
  a `benchmark_6way.py` run with mode `kompress` + LLM-as-judge before enabling beyond
  opt-in presets.

## 5. Expected impact

Stacked on existing layers for an agentic/RAG-heavy preset: safe transforms (~30%+ input
reduction) → kompress (+~20-30% of the remainder on tool-heavy traffic) → cache-aware
model choice within tier. Output tokens and routing quality are unchanged; all gains are
on billable input and provider selection.
