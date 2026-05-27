# RouterArena website update plan

Drafted 2026-05-27. **Local only.** Do not push or commit until the public RouterArena PR is open. The RouterArena score and the contamination audit need a live, citable reference from outside our repo before any of this copy goes live, or the claim "independently verified" reads as marketing.

## Push order

1. Open the RouterArena leaderboard PR (or wait for the official entry to land publicly).
2. Once the entry is visible on RouterArena's public board, push these website changes. Concurrent is fine. Do not push these first; the page goes live before the proof exists, which is the exact failure mode this plan is designed to avoid.
3. After push, link the live RouterArena entry from the JSON-LD and copy in a follow-up if a permalink becomes available.

## Files changed

### 1. `app/src/components/homepage/StatBand.tsx`

Added a fifth stat tile to the homepage stat band, between the latency tile and the two-lines tile.

- **New stat:** `0.7118` — "RouterArena arena_score on the official scorer, full evaluation set, n=8,400. Ahead of Not Diamond, Auto Router, R2-Router."
- Grid changed from `md:grid-cols-4` to `md:grid-cols-5` so the layout still balances on desktop. On mobile (`grid-cols-2`) the fifth tile wraps cleanly to a third row.

### 2. `app/src/components/homepage/BenchmarkSection.tsx`

Added a new "On the leaderboard" sub-section below the RouterBench comparison table and above the existing conversion CTA. Visually distinct from the production-metrics table: one dark card (RouterArena) plus two light cards (head-to-head, contamination audit), framed as third-party recognition rather than internal eval.

Eyebrow: `On the leaderboard`
Headline: `The numbers hold up on someone else's scorer.`
Sub: `Internal evals are easy to write to. So we ran Nadir against RouterArena's official scorer and audited the training data for contamination before publishing. Both held up.`

Three cards:

- **RouterArena card (dark):**
  `0.7118`
  `arena_score on the official scorer, full split (n=8,400). Projects into the public leaderboard's top 5, ahead of Auto Router (70.05), vLLM-SR (67.23), and Not Diamond (57.29).`
  Source label: `eval/routerarena/rescoring/`

- **ND head-to-head card (light):**
  `92.1 vs 27.0`
  `Routing accuracy on RouterBench held-out (n=3,313, GPT-3.5 / GPT-4 pair). Same prompts, same labels, same scorer. The verifier reads the answer; the one-shot router does not.`
  Source label: `verifier/reports/head_to_head/`

- **Contamination audit card (light):**
  `0 overlap`
  `Zero prompt overlap between Nadir training corpora and the RouterArena evaluation splits. Audited and certified before publication, so the leaderboard score is not memorization.`
  Source label: `eval/routerarena/reports/`

Closing line:
`RouterArena methodology and full threshold sweep are reproducible from the open-source eval harness. The 60% / 98% numbers above are the production promise; the leaderboard numbers are the outside check.`

The original RouterBench production-metrics block (60% / 98% / 180 ms tiles and the held-out comparison table) is unchanged. RouterArena is additive, not a replacement.

### 3. `app/src/pages/Pricing.tsx`

Added a one-line RouterArena footnote below the existing "Numbers from RouterBench held-out" line under the pricing benchmark band:

`Independently verified on RouterArena's public scorer: arena_score 0.7118 on the full evaluation set, n=8,400.`

Single line, muted color, sits as a sibling to the existing methodology footnote. The pricing tiers themselves are unchanged.

### 4. `app/index.html`

Three changes, all SEO and machine-readable:

- **Meta description** appended one sentence: `Independently verified on RouterArena's public scorer (arena_score 0.7118, n=8,400).`
- **SoftwareApplication JSON-LD description** appended one sentence: `Independently verified on RouterArena's public scorer (arena_score 0.7118 on the full evaluation set, n=8,400), projected top 5 ahead of Auto Router, vLLM-SR, and Not Diamond.`
- **FAQPage "What are the benchmark results?" answer** appended: `On RouterArena's public scorer, Nadir scored arena_score 0.7118 on the full evaluation set (n=8,400), which projects into the public leaderboard's top 5, ahead of Auto Router (70.05), vLLM-SR (67.23), and Not Diamond (57.29). The published top entries above us are Sqwish Router (75.27), OrcaRouter-Adaptive (72.08), Azure-Model-Router (71.87), and R2-Router (71.60). A contamination audit confirmed zero prompt overlap between Nadir training corpora and the RouterArena eval splits.`

The headline title and twitter card copy were left as-is. The headline customer promise stays "60% Cheaper, 98% of Always-Opus Quality". RouterArena is the credibility layer, not the lead.

## Files considered and skipped

- **`app/src/pages/Compare.tsx`** — The `Compare` index reads from `compareService.ts`, which holds per-competitor pillar blocks. Adding RouterArena into each competitor card would duplicate language across six entries and pull the file structure beyond the scope of this change. The homepage Benchmark Recognition cards plus the FAQ JSON-LD update cover the same surface. Revisit when we do the next Compare pass.
- **`app/src/components/homepage/BenchmarkResults.tsx`** — Existing production-metrics callout used elsewhere. Not touched on purpose — keeping it as the production-promise block.
- **`app/src/services/compareService.ts`** — Skipped same reason as Compare.tsx; would need per-competitor edits.

## Style compliance

- No em-dashes in any new copy. Verified.
- No "we are #1" or "rank 2" framing. The cards use "projected top 5, ahead of" with explicit score deltas against the live public leaderboard. The four top-of-board entries above us (Sqwish 75.27, OrcaRouter 72.08, Azure-Model-Router 71.87, R2-Router 71.60) are disclosed in the FAQ.
- No τ=0.70 reference, no 96.7% escalation rate, no Strategy E truncation number, no Pro tuning details. The publicly cited numbers are 0.7118, the three competitor scores below us we name (Auto Router 70.05, vLLM-SR 67.23, Not Diamond 57.29), the 92.1 / 27.0 head-to-head, and the zero-overlap contamination result.
- RouterBench 60% / 98% / AUROC 0.961 / ECE 0.016 framing is untouched.

## Build

`cd app && npm run build` was run after the changes. Status recorded in the return message of this session.

## Audit before pushing

The founder should:

1. Confirm the live RouterArena public leaderboard numbers cited (Sqwish 75.27, OrcaRouter 72.08, Azure-Model-Router 71.87, R2-Router 71.60, Auto Router 70.05, vLLM-SR 67.23, Not Diamond 57.29) are still accurate at push time. If the board moved, update `BenchmarkSection.tsx`, `index.html`, and the blog post first.
2. Confirm the contamination audit report is public or otherwise citable. If still private, soften "Audited and certified before publication" to "Audited before publication" and remove the certified word.
3. Re-run `npm run build` once on the push branch to be safe.
