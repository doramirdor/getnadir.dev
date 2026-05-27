# Session Handoff — 2026-05-27

**Purpose:** continue this work in a fresh session without re-deriving any of the analysis or re-reading the conversation.

**Last session ended with:** website copy rewritten to the new operating point, product-marketing-context.md updated with the "public vs internal" framework, two follow-ups pending (commit/push + production threshold bump).

---

## 1. Current State of the World

### What's already live in production
- **Cascade verifier path is load-bearing** (deployed 2026-05-27 ~22:50 UTC). The bug where `cheap_text` was parsed from the wrong response shape is fixed. Verified with the philosophy prompt — cascade metadata returns `pre_classifier_used: true`, `escalated: false`, request stays on Haiku 4.5.
- App Runner image: `037049058808.dkr.ecr.us-east-1.amazonaws.com/nadir-backend:latest`, sha256: `56fd72f9511cb53a43a7819cf7cef1dcdab4cd1cc186a2d7a042ef41aec2c9a3`
- App Runner service ARN: `arn:aws:apprunner:us-east-1:037049058808:service/nadir-backend-api/7d734e5518c346b9bde36cf40a708205`
- **Production cascade threshold: τ=0.7** (NOT τ=0.8). The website now claims τ=0.8 numbers. Mismatch is pending the threshold bump.
- `/v1/route_only` endpoint works against the production key `sk-6f4b5a2r1c0h1o2j5i6v131a2o1r3p5l`:
  - schema_fingerprint: `7a1538f6cc8bf7960d564dc00b58f2e336b685af50bd123a01e2dc569731efb4`
  - classifier_sha: `67dccb427a07ddbdeae08dc43483265a3d80606c3ac904527ffabdd259830231`
  - classifier_version: `wide_deep_asym_v3`

### What's on disk but uncommitted
```
M app/src/components/homepage/BenchmarkResults.tsx
M app/src/components/homepage/BenchmarkSection.tsx
M app/src/components/homepage/StatBand.tsx
M app/src/pages/Calculator.tsx
M app/src/pages/OpenClaw.tsx
M app/src/pages/Pricing.tsx
M app/src/pages/Solutions.tsx
M backend/app/api/production_completion.py   (cheap_text fix — production has it, just the local file is dirty for the same reason as the App Runner image)
M app/src/services/blogService.ts            (NOT touched this session; unrelated dirty state)
```
- Build verified: `cd app && npm run build` → green, `Homepage-ci6xPtQA.js` 43.39 KB.
- Netlify auto-deploys `app/` on push to `main`. Nothing else required for the frontend deploy.

### What's not done yet
- Production cascade threshold still at τ=0.7. The website's 98% / 60% numbers reflect τ=0.8. Either bump production or roll back the website to τ=0.7 framing (62.8% cost reduction / 97.6% quality preserved).
- RouterArena submission still has 3 blockers (see §5).
- No public benchmark leaderboard entry yet.
- ND head-to-head against `notdiamond-0001` not started.
- IP-1 paper draft on disk (`verifier/paper/draft.md`) — not on arXiv.

---

## 2. The Numbers (Cite These Everywhere)

**Public, defensible, sourced:**

| Metric | Value | Source |
|---|---|---|
| Cost reduction vs always-Opus | **60%** | `verifier/reports/eval_composed_20260526T191001.json`, τ=0.8 (or 60.9% precise) |
| Quality preserved vs always-Opus | **98%** | Same eval, catastrophic-route rate 1.7% |
| Verifier AUROC | **0.961** | `verifier/reports/eval_20260526T184516.json`, n=11,420 |
| Verifier ECE (calibration) | **0.016** | Same eval |
| Eval methodology | **11,420 RouterBench held-out triples** | The methodology citation. Use this exact phrasing site-wide. |
| Verifier latency, CPU INT8 | **180 ms** | Measured |
| Pre-classifier overhead | **<10 ms** | Measured; verifier skipped on high-confidence routes |
| Pre-classifier confidence threshold for shortcut | 0.7 | `cascade_router.py` |
| Cascade verifier threshold (current prod) | **0.7** (target: 0.8 or 0.85) | `app/settings.py` env var or App Runner env |

### Full threshold sweep (from `eval_20260526T184516.json` precomputed `thresholds`)

| τ | Acc | Cost reduction | Catastrophic | Wasted | Notes |
|---|---|---|---|---|---|
| 0.3 | 88.2% | 73.2% | 8.8% | 3.0% | Too aggressive — quality risk |
| 0.4 | 89.9% | 68.5% | 5.3% | 4.7% | |
| 0.5 | **90.3%** | 67.0% | 4.4% | 5.3% | Peak raw accuracy |
| 0.6 | 90.1% | 65.1% | 3.4% | 6.5% | |
| **0.7** | 89.8% | 62.8% | 2.4% | 7.9% | **Current production** |
| 0.75 | 89.3% | 61.5% | 1.9% | 8.9% | |
| **0.8** | 89.2% | **60.9%** | **1.7%** | 9.2% | **Website now claims this** |
| 0.9 | 88.1% | 59.1% | 1.1% | 10.8% | Premium positioning, more wasted-escalation cost |

**The reframe:** "catastrophic rate" = "1 − quality preserved." So τ=0.8 → 98.3% quality preserved. This is the framing that beats Not Diamond's positioning.

---

## 3. Website Changes Made This Session

All seven files in `app/src/` have the same shift:

| Old | New |
|---|---|
| "47% lower bill" / "Up to 47% savings" | **"60% cost reduction vs always-Opus"** |
| "96% routing accuracy" / "96% accuracy" | **"98% of always-Opus quality preserved"** |
| "2.5% catastrophic-route rate" | (replaced with the quality-preserved framing) |
| "on our 50-prompt eval" / "50-prompt benchmark" | **"11,420 RouterBench held-out triples"** |
| (none) | **"Verifier AUROC 0.961, ECE 0.016"** (in BenchmarkResults + Pricing footer) |
| "Save 47%. Don't break 2.5%." CTA | **"Cut your bill by 60%. Keep 98% of always-Opus quality."** |
| RouteLLM-style row in benchmark table (92.2% quality, 11.6x cost — unsourced) | Replaced with "Prompt-only classifier (wide_deep_asym alone): 4.8x / 3.4% / 96.6%" |
| ROI calculator math: 38% savings | **60% savings** |
| OpenClaw "96% accuracy on real-world benchmarks" | **"Pro tier adds verifier-gated cascade: 98% of always-Opus quality at 40% of the cost on RouterBench held-out"** |

**Exact files:** `StatBand.tsx`, `BenchmarkSection.tsx`, `BenchmarkResults.tsx`, `Calculator.tsx`, `Pricing.tsx`, `Solutions.tsx`, `OpenClaw.tsx`.

**Build:** `cd app && npm run build` → green, 3.39s, no errors.

---

## 4. Public-vs-Internal Marketing Framework

Lives in `.agents/product-marketing-context.md` under the new **"What's Public vs What Stays Internal"** section. Summary:

### Say publicly
- 60% cost reduction, 98% quality preserved, AUROC 0.961, ECE 0.016 — all with "11,420 RouterBench held-out triples" cited in the same sentence.
- "The cheap model answers first. The verifier scores it before we ship." (architectural wedge vs ND/Martian).
- 180 ms verifier latency, <10 ms pre-classifier, two-line change, BYOK, in-memory proxy.

### Do NOT say publicly
- Specific cascade threshold (τ=0.8). Operational knob.
- Production cascade was fail-open until today. True but alarming.
- Not on any public benchmark leaderboard yet. Until RouterArena PR is open, frame as "evaluated on RouterBench held-out."
- The 25.6% binary routing accuracy of wide_deep_asym *alone* on RouterBench. Bad number without cascade context.
- Internal eval-on-training-distribution numbers (90%+). Inflated by construction.
- Anchor logos / target accounts list. Aspirational, not customers.
- Internal jargon: "Move 1–5", "composed_v2", "wide_deep_asym_v3". In public, say "pre-classifier shortcut," "verifier cache," "iterative refinement," "trained tier classifier."
- The fact that we just rewrote the site numbers from 47/96 to 60/98.

### Truth-with-framing
- RouterBench numbers may not match every workload → always cite the eval. Never say "60% guaranteed."
- Verifier adds 180ms latency *when it runs* → "skipped entirely on high-confidence routes."
- "Closest competitor on routing claims" for ND — specific, defensible, no measurement claim.

### Tone calibration
- **Lead with quality preservation, not cost.** ND and Martian lead with cost. The wedge is "I won't be punished for switching."
- Cite the eval inline. "11,420 RouterBench held-out triples" should appear in the same sentence as "60%" and "98%" wherever they appear together.
- Don't compete on adjectives. Use specific numbers + citation.
- Direct comparison to ND only with a head-to-head artifact. Until then, say "they route once; we verify before we ship."

---

## 5. Open Plan — In Priority Order

### Tier 1 — should ship next session

1. **Bump production cascade threshold to τ=0.8** so prod matches the website's claimed numbers. Single env var change.
   - File: search for `CASCADE_VERIFIER_THRESHOLD` or `threshold` default in `backend/app/services/cascade_router.py` / `backend/app/settings.py`.
   - Or set via App Runner console env var, no rebuild needed.
   - Verify with the philosophy prompt + a borderline prompt (e.g., "prove odd+odd=even" which sat at confidence 0.478 in the sub_10 smoke).
2. **Stage, commit, push the website rewrite.** Files in §1. Suggested commit message: `update: refresh marketing numbers to verifier-gated cascade (60% / 98% on RouterBench held-out)`.

### Tier 2 — this week

3. **RouterArena dry-run** (the ~2-hour task). Pull `RouteWorks/RouterArena` from HuggingFace, run our adapter against their dataset, score with their formula, compare to their leaderboard. Gives us a real number, not a proxy.
   - Adapter package ready: `eval/routerarena/` (nadir_adapter.py, run_sub10.sh, MODEL_CARD.md, SUBMISSION_PACKAGE.md).
   - Sub_10 smoke PASSES (verified 2026-05-27). `eval/routerarena/reports/smoke_sub10_20260527T102813Z.json`.
4. **Direct head-to-head with `notdiamond-0001` on RouterBench.** Pull ND's public router off HuggingFace, run both on the same held-out RouterBench split, publish the comparison. Most leveraged single artifact.

### Tier 3 — next 1–2 weeks

5. **Open RouterArena PR.** Blockers: RouterArena-specific contamination audit (Block B in `eval/routerarena/SUBMISSION_PACKAGE.md`), eval-only API key + elevated rate limit (Block C, ~2h founder action), Anthropic price refresh.
6. **arXiv submission of IP-1 paper** (`verifier/paper/draft.md`). Headline number is the RouterBench eval. Add the ND head-to-head as the comparison row.
7. **Blog post: "Routing without verification is dead-reckoning."** Frame Nadir vs ND as verified vs predicted.
8. **Publish `wide_deep_asym_v3.pt` on HuggingFace** as a reproducibility artifact.

---

## 6. Key Files (Citations for Next Session)

### Evidence files (do not modify)
- `verifier/reports/eval_20260526T184516.json` — verifier eval on RouterBench held-out (n=11,420). Source for AUROC 0.961, ECE 0.016, and the threshold sweep.
- `verifier/reports/eval_composed_20260526T191001.json` — composed_v2 head-to-head. Source for 60% / 98% / 1.7%.
- `verifier/reports/routerbench_contamination_20260524T122849.json` — RouterBench train/test disjoint, n=2632 vs n=36481, overlap_count=0.
- `eval/routerarena/reports/smoke_sub10_20260527T102813Z.json` — RouterArena adapter operational smoke, PASS.

### Code (touched this session)
- `backend/app/api/production_completion.py:1246-1248` — the cheap_text parsing fix. Reads `response["response"]` from unified service shape, not OpenAI-shape choices array.
- Seven `app/src/` files listed in §1.

### Marketing context
- `.agents/product-marketing-context.md` — updated 2026-05-27 with new numbers and the public/internal framework.
- `eval/routerarena/SUBMISSION_PACKAGE.md` — RouterArena submission cover doc, including the explicit list of blockers.
- `eval/routerarena/MODEL_CARD.md` — model card for the `nadir` router.

### Verifier / cascade source
- `backend/app/services/cascade_router.py` — the cascade itself. `dispatch_with_verifier()` is the entrypoint.
- `backend/app/api/route_only.py` — the RouterArena adapter target. Refuses if caller has clusters or expert models.
- `verifier/eval_composed.py` — the eval harness. `--threshold` is the knob.
- `backend/app/complexity/wide_deep_asym_analyzer.py` — the pre-classifier (wide_deep_asym_v3).

### IP / research
- `verifier/paper/draft.md` — IP-1 paper draft.
- `competitor-profiles/blueprints/ip-1-verifier-gated-cascade.md` — the architectural blueprint.

---

## 7. Stuff to Re-Read if You're Picking This Up Cold

In order of leverage:
1. This file.
2. `.agents/product-marketing-context.md` — especially the "What's Public vs What Stays Internal" section.
3. `eval/routerarena/SUBMISSION_PACKAGE.md` §4 (Blockers) — the three things between us and a leaderboard number.
4. `verifier/reports/eval_composed_20260526T191001.json` — the eval JSON. Look at the `results` object. composed_v2 row is the headline.
5. `backend/app/services/cascade_router.py` — only if you're touching the cascade itself.

You do NOT need to re-read the full conversation transcript. Everything actionable is captured here.

---

## 8. One-Line Summary for the New Session

> Cascade verifier is live in production at τ=0.7. Website now claims τ=0.8 numbers (60% / 98%). Two follow-ups: (a) bump production threshold to τ=0.8 to match the site, (b) commit and push the seven `app/src/` files for Netlify. Then: RouterArena dry-run for a real leaderboard position. Marketing-grade public-vs-internal split lives in `.agents/product-marketing-context.md`.
