# Cycle 1 Synthesis — Three Researchers → One Program

**Generated**: 2026-05-23 (Session 2)
**Researchers**: A (next-level primitive), B (wedge sequence), C (proof artifacts)

---

## Convergent picture

The three briefs don't compete; they stack. The wedge work (B) is **necessary but commoditizing** — Weave can match each item in a sprint. The bandit (A) is the **durable structural moat** Weave physically cannot copy without rearchitecting their frozen-α planner. The proof artifacts (C) are what make either advantage **legible to the market**.

**Sequencing insight**: The bandit and the wedge touch disjoint code paths (routing service vs API surface). They can run in parallel with separate engineers. The single hard gate is **the contamination audit** from C/Artifact 1 — without it the whole RouterArena proof story is unverifiable, and without RouterArena half the comparison value evaporates.

---

## Workstreams selected for Cycle 1 architecture

Four chosen, three architected this cycle, one deferred to Cycle 2.

### WS-1 — Contamination audit + RouterArena adapter `BLOCKING GATE`
- Owner of decision: founders + classifier-pipeline owner
- Effort: ~2 eng-weeks
- From: Researcher C, Artifact 1 + Researcher B, Week 4
- Why first: a contamination finding kills the entire public-proof play; we must know before we invest in Artifacts 2-N.
- Public action: leaderboard PR is gated on founder + eng-lead sign-off.

### WS-2 — Agentic wedge build (SSE + tool blocks + cross-format + npx installer)
- Effort: ~3 eng-weeks
- From: Researcher B, Weeks 1-3
- Why now: `/v1/messages` exists but nothing real can talk to it without streaming + tools. Codex-first installer because Anthropic won't promote a competing router for Claude Code.

### WS-3 — Online contextual bandit on the OCR signal
- Effort: ~4-6 eng-weeks
- From: Researcher A
- Why now: it's the structural moat. Build in parallel with WS-2 (different engineer, different files).
- Risk dial: exploration capped at 5% above tier-2 for accounts >$1k/mo; daily cost-delta alarm.

### WS-4 — SWE-bench compound-savings benchmark `DEFER TO CYCLE 2`
- Effort: ~3-4 eng-weeks
- From: Researcher C, Artifact 2
- Why deferred: best run with the bandit either fully on or fully off to isolate cache + context-opt contributions. Also benefits from RouterArena baseline data WS-1 produces.
- Will architect in Cycle 2.

---

## Honest claims surgery (from Researcher C)

Stop using as standalone:
- "47% savings on 50-prompt eval" — n=50 is too small, no significance test
- "0% catastrophic routes" — 95% CI is roughly [0%, 7%] at n=50, statistically meaningless
- "OCR closed-loop" without an ablation showing OCR-on vs OCR-off accuracy drift

Replace with (after the artifacts ship):
- "X% on RouterArena Acc-Cost Arena (published log, classifier hash, contamination audit)"
- "Y% total spend reduction on SWE-bench Verified, of which Z pp is from semantic cache + context optimization (Weave-style routing alone gets only W%)"

---

## Cycle 2 expected workstreams (preview)

- WS-4 SWE-bench compound benchmark
- Native Gemini endpoint + OpenRouter passthrough (deferred from earlier plan)
- `/compare/weaverouter` marketing page
- Bandit ablation report (OCR on/off, bandit on/off, 4-arm matrix)

---

## What's locked vs open

**Locked by this synthesis:**
- Bandit beats speculative dispatch, ensemble, per-turn routing, cache-aware EV (for now)
- Codex installer ships before Claude Code installer
- RouterArena submission gated on contamination audit
- 50-prompt eval is dropped as primary evidence

**Open for architect input:**
- Bandit posterior choice (Beta-Bernoulli for quality vs Gaussian; Researcher A defaults to Beta+Gamma)
- Whether the cross-format SSE translator is its own package or inside `anthropic_translate.py`
- npm org name (`@nadir` vs `@getnadir` — depends on org availability)
- Whether WS-1 reuses the existing `eval/phase0_weave_baseline.py` plumbing or builds the RouterArena adapter from scratch
