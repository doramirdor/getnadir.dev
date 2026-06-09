# Figures

Placeholder directory. The four figures referenced in the main draft
will live here as PDF (for LaTeX) and PNG (for HTML preview / blog
re-use).

## Required Figures

### Figure 1 — Cascade Routing Flow Diagram

Block diagram of the dispatch path. Reads left-to-right:

```
   prompt
     │
     ▼
 ┌────────┐
 │ tier   │   (existing complexity classifier)
 │ select │
 └───┬────┘
     │ tier, cheap_model
     ▼
 ┌────────┐
 │ cheap  │   call cheap-tier LLM
 │ LLM    │
 └───┬────┘
     │ cheap_response
     ▼
 ┌──────────┐
 │ ref      │   sha256(prompt) → expensive_answer | PAD
 │ cache    │
 └───┬──────┘
     │ reference
     ▼
 ┌──────────┐
 │ verifier │   DeBERTa-v3-small (44M, INT8, CPU, ~28 ms)
 │  cross-  │
 │ encoder  │
 └───┬──────┘
     │ p_accept ∈ [0,1]
     ▼
 ┌──────────┐
 │ thresh   │   p_accept ≥ τ (default 0.75) ?
 └──┬────┬──┘
    │YES │NO
    │    └──► escalate to next tier LLM, cache result
    ▼
 return cheap_response
```

Source: TikZ. Use `tikz-cd` or plain `tikzpicture` with `node distance`
chains. Export to standalone PDF via `pdflatex --shell-escape`.

### Figure 2 — Cost-Quality Pareto Curve

x-axis: cost per 1K requests (USD).
y-axis: quality (LLM-judge agreement with strong baseline, 0-100%).

Four points/curves:

- Always-cheap (lowest cost, lowest quality)
- Always-expensive (highest cost, highest quality, baseline)
- Pre-generation router (RouteLLM-style baseline): single curve
  parameterized by routing aggressiveness
- Verifier-gated (ours): curve parameterized by threshold τ from 0.5 to
  0.9

Expected story: the verifier-gated curve sits strictly above and to the
left of the pre-generation router curve in the operationally interesting
regime.

Source: matplotlib. Use `.pdf` for paper, `.png` for blog. Stick to two
serif fonts and three line styles, no colour reliance.

### Figure 3 — AUROC by Domain

Bar chart. Domains across x-axis (coding, summarization, QA, agentic,
analysis, creative). y-axis: AUROC. Error bars from 5-fold CV on
domain-stratified splits.

Story: AUROC should be uniformly above 0.80; surface domains where it
underperforms as honest caveats for §7 (limitations).

### Figure 4 — Latency CDF

Cumulative distribution of accept-path verifier latency on a 10K-request
shadow trace. x-axis: latency (ms, log scale). y-axis: CDF.

Annotate p50, p95, p99 with vertical dashed lines. Target shape: tight
left-mass with a thin right tail under the 100 ms budget.

## File Naming Convention

- `fig1_cascade_flow.pdf` / `.png`
- `fig2_pareto.pdf` / `.png`
- `fig3_auroc_by_domain.pdf` / `.png`
- `fig4_latency_cdf.pdf` / `.png`

TikZ sources (if used) live alongside as `.tex`.

## To Do

- [ ] Render Figure 1 from TikZ source.
- [ ] Generate Figures 2-4 from `verifier/eval.py` output after training.
- [ ] Add `figures.tex` include block to the paper template once
      figures exist.
- [ ] Verify all figures meet NeurIPS workshop accessibility guidelines
      (no information conveyed by colour alone).
