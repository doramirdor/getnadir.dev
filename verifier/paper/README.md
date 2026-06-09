# Verifier-Gated Cascade Routing — Paper

Draft of the arXiv paper accompanying Nadir's verifier-gated cascade
routing release.

## Files

- `draft.md` — main paper, LaTeX-compatible Markdown for pandoc
- `related_work.bib` — BibTeX bibliography
- `figures/` — placeholder for figure assets (TikZ / PDF / PNG)

## Build

The draft is plain Markdown with LaTeX math (`$...$`). It targets pandoc
with the `citeproc` filter.

### Prerequisites

- pandoc (>= 2.18)
- TeX Live or MacTeX (for `--pdf-engine=xelatex` or `pdflatex`)
- pandoc-citeproc is bundled with recent pandoc; older versions need
  `pandoc-citeproc` installed separately

macOS install:

```
brew install pandoc
brew install --cask mactex-no-gui
```

### Build PDF

```
cd verifier/paper
pandoc draft.md \
  --citeproc \
  --bibliography=related_work.bib \
  --pdf-engine=xelatex \
  -V geometry:margin=1in \
  -V fontsize=10pt \
  -o paper.pdf
```

For a NeurIPS-style two-column layout, swap in the NeurIPS LaTeX template
once available:

```
pandoc draft.md \
  --template=neurips_2025.tex \
  --citeproc \
  --bibliography=related_work.bib \
  --pdf-engine=xelatex \
  -o paper.pdf
```

### Build HTML (for review)

```
pandoc draft.md \
  --citeproc \
  --bibliography=related_work.bib \
  --standalone \
  --mathjax \
  -o paper.html
```

## Submission Targets

Two-stage release:

1. **arXiv** — primary categories `cs.AI` and `cs.LG`. Secondary: `cs.IR`
   (cross-encoder reranking lineage).
   - No deadline; submit when numbers land and founder approves.
   - License: arXiv non-exclusive (allows later workshop submission).

2. **NeurIPS 2026 Systems-track workshop** — typical deadlines fall in
   September. Confirm specific workshop call (e.g., MLSys, ENLSP,
   Efficient Natural Language and Speech Processing) closer to date.
   - Page limit usually 6-8 pages excluding references; the current
     draft fits.

Alternative venues if NeurIPS Systems is not available:
- ACL Industry Track (March deadline)
- EMNLP Industry Track (June deadline)
- MLSys (October deadline)

## Pre-submission Checklist

Before pushing to arXiv:

- [ ] All `[TODO: ...]` placeholders replaced with real numbers from
      `verifier/eval.py` output and shadow-mode production logs.
- [ ] Patent filings logged with counsel BEFORE arXiv upload (see
      `blueprints/ip-1-verifier-gated-cascade.md` §6 for claim list).
- [ ] Contamination scan re-run on final corpus and result inserted in
      §4 (RouterBench, MT-Bench, MMLU).
- [ ] All figures rendered to PDF/PNG and committed to `figures/`.
- [ ] BibTeX entries verified against arXiv canonical metadata
      (especially Avengers-Pro citation — DOI not yet stable as of 2025).
- [ ] Anthropic and OpenAI named only as platforms, never as endorsers;
      no quoted private communications.
- [ ] Customer data anonymized; no customer names in eval section.
- [ ] License notice: paper text under CC BY 4.0; code samples retain
      project licence.

NeurIPS workshop specific:

- [ ] Anonymize: remove "Nadir" affiliation from title page, replace
      with `Anonymous Submission` until camera-ready. NeurIPS workshops
      vary on double-blind; check the specific CFP.
- [ ] Conform to the workshop's LaTeX style file (this may require
      manual translation from pandoc output).
- [ ] Code release statement: link to a sanitized reproduction repo
      (architecture + eval harness; not weights or corpus).
- [ ] Ethics statement: include the privacy / `store_prompts=false`
      discussion from §4 and §7.

## Reproduction Repo (External-Facing)

The paper deliberately releases architecture and methodology, not
weights or training corpus. The companion reproduction repo at
`verifier/` in the main codebase contains:

- `train_local.py` — training script
- `eval.py` — evaluation harness (AUROC, cost reduction)
- `routerbench_loader.py` — RouterBench adapter
- Synthetic seed data for smoke tests
- NOT included: production training corpus, trained INT8 weights,
  per-customer calibration data

## Open Questions for Authors

Before submission, resolve:

1. Whether to publish the cascade orchestration code as a reference
   implementation alongside the paper.
2. Whether the "quality-floor contract" section is strong enough to
   anchor a separate position paper (currently §6 of the main draft).
3. Whether Mode B (sub-turn decomposition routing — see IP-2 blueprint)
   warrants a forward-reference in §7 or stays unmentioned until that
   paper is ready.
