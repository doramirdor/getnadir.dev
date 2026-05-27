# Head-to-Head: Nadir vs Not Diamond on RouterBench Held-Out

*Run: 2026-05-27. Author: Nadir competitive intelligence. Status: internal artifact, not yet sanitized for public publication. Reproducible: see "Reproducibility" section.*

## Headline

On 3,313 RouterBench held-out triples covering the `gpt-3.5-turbo-1106` vs `gpt-4-1106-preview` pair, Nadir's verifier-gated cascade hits **92.1% routing accuracy and 65.2% cost reduction vs always-GPT-4 while preserving 98.5% of always-GPT-4 quality**. `notdiamond-0001` on the same set hits **27.0% routing accuracy and 4.3% cost reduction** by routing 95.4% of traffic to GPT-4 (essentially behaving as always-GPT-4 with a thin GPT-3.5 escape hatch).

## Comparison Table

All metrics computed on the same 3,313-triple subset of RouterBench held-out (GPT-3.5/GPT-4 pair only). Labels follow the RouterBench loader convention: `label=1` means the cheap model's response was acceptable (cost-optimal route = cheap); `label=0` means the cheap model failed and the expensive model helped.

| Router | Routing accuracy | Cost reduction vs always-GPT-4 | Quality preservation | Catastrophic rate | Wasted escalation | Cheap-route rate |
|---|---:|---:|---:|---:|---:|---:|
| **Nadir verifier-gated cascade (τ=0.8)** | **92.1%** | **65.2%** | **98.5%** | 1.5% | 6.4% | 70.4% |
| `notdiamond-0001` | 27.0% | 4.3% | 98.9% | 1.1% | 71.8% | 4.6% |
| Martian (cited, Hu et al. 2024) | n/a | ~50% | ~95% | n/a | n/a | n/a |
| Baseline: always-cheap | 75.4% | 92.5% | 75.4% | 24.6% | 0% | 100% |
| Baseline: always-expensive | 24.6% | 0% | 100% | 0% | 75.4% | 0% |

**Key observation:** ND's catastrophic rate is marginally lower than Nadir's (1.1% vs 1.5%) but only because ND routes 95.4% of all traffic to GPT-4. The catastrophic-rate denominator on ND is heavily diluted by always-GPT-4 behavior; the *useful* metric for a router is whether it can find the cost-optimal route, and ND's 27% routing accuracy says it largely cannot.

## What Each Router Is Actually Doing

### Nadir verifier-gated cascade (τ=0.8)

- Sends 70.4% of prompts to cheap (GPT-3.5), 29.6% to expensive (GPT-4).
- On the 24.6% of prompts where the cheap answer would actually fail, Nadir escalates correctly enough to land catastrophic rate at 1.5%.
- On the 75.4% where cheap was sufficient, Nadir wasted-escalates only 6.4% of the time.
- Cost reduction lands at 65.2% because most prompts are correctly identified as cheap-sufficient.

The verifier-gated architecture's mechanism: cheap-model answer first, calibrated verifier scores the answer, escalate only when the verifier rejects. Verifier AUROC 0.961 on the full RouterBench held-out (n=11,420). The GPT-pair subset metrics in this comparison are computed from the verifier's existing per-prompt scores — no re-scoring was needed because the verifier is pair-agnostic by design (it scores the cheap_answer's correctness against the prompt, not which model produced it).

### notdiamond-0001

- Routes 95.4% of prompts to GPT-4 (3,159 / 3,313), 4.6% to GPT-3.5 (154 / 3,313).
- Of the 154 GPT-3.5 routes, only 23 are high-confidence (prob > 0.7).
- Catastrophic rate looks low (1.1%) but it's a near-trivial denominator: routing almost everything to GPT-4 means almost nothing can be catastrophic.
- Cost reduction is correspondingly tiny (4.3%) and the wasted-escalation rate is 71.8% — the cheap model would have been sufficient on 2,498 prompts that ND sent to GPT-4 anyway.

The pattern is consistent with ND's published "1.51x better than GPT-4 as a router" claim if you interpret "better" as quality-preserving rather than cost-reducing. `notdiamond-0001` is the open-source artifact, not the hosted product; ND's blog explicitly notes the hosted router supports more models, so this comparison reflects what's *publicly auditable*, not necessarily what their paid offering does.

### Martian (cited, not run)

Hu et al. 2024 ("RouterBench: A Benchmark for Multi-LLM Routing System," arXiv:2403.12031) report a Pareto curve, not a single binary accuracy. The closest comparable point on their GPT-3.5/GPT-4 pair (Table 3, Figure 4) is approximately 50% cost reduction at 95% performance recovery using their KNN router. Their evaluation surface is the full 11-model RouterBench, not the binary pair we use here, so the comparison is approximate.

## Honest Methodology and Caveats

**What we did:**
- Same RouterBench held-out test split as `verifier/reports/eval_20260526T184516.json` (`sha256(sample_id) mod 10 == 9`).
- Filtered to the 3,313 triples that use `gpt-3.5-turbo-1106` (cheap) and `gpt-4-1106-preview` (expensive). This is the only pair both routers can compare on directly because `notdiamond-0001` is a binary GPT-3.5/GPT-4 classifier per its config.
- Ran `notdiamond-0001` from HuggingFace (Apache 2.0) on CPU float32 with the prompt template verbatim from the model card. Decision = `logits.argmax()`.
- Re-used Nadir's existing per-prompt verifier scores (the verifier is pair-agnostic, see note above). Decision rule: cheap if `verifier_score >= 0.8`, else escalate.
- Per-triple labels come from RouterBench's published `model_responses` scores via the same `derive_label` rule used in `verifier/routerbench_loader.py`.
- Cost model: RouterBench / OpenAI public pricing ($1/$2 per 1M tokens for gpt-3.5-turbo-1106; $10/$30 per 1M for gpt-4-1106-preview). Cost ratio 13.33x.
- Determinism: `torch.manual_seed(0)`, `model.eval()`, no random sampling. Reproducible byte-for-byte.

**Subset caveat — important.** The comparison is restricted to 3,313 of the 11,420 RouterBench held-out triples. Nadir's headline 60%/98% marketing numbers are computed across the full 11,420 set covering all 4 model pairs. The 65.2%/98.5% figure here is on a different (smaller, GPT-only) subset. Both numbers are defensible on their own evals; do not mix them in copy.

**ND-specific caveats:**
- This is the open-source `notdiamond-0001` BERT classifier, not ND's hosted multi-model router. ND's hosted product likely performs differently. The artifact is what's publicly auditable; the hosted product is not.
- The model card explicitly says the hosted router supports many more models. The binary classifier was their early/public artifact.
- Some uncertainty on whether ND's blog claim of "1.51x better than GPT-4" refers to this specific classifier or the hosted one. The HF model card has no RouterBench evaluation published.

**Verifier-pair caveat:**
- Nadir's verifier was trained against multi-pair RouterBench labels including the Claude and Mistral pairs alongside GPT. The verifier learned a pair-agnostic "is this cheap_answer correct?" function, scored against the prompt. On this comparison, the verifier scores already in the eval JSON cover the GPT pair directly — we did not need to re-train or re-score for the head-to-head.
- We did NOT re-tune Nadir's verifier on a held-out-of-held-out set for this specific comparison. The verifier is the same one used in production at τ=0.8.

**What we could not do:**
- Compare against ND's *hosted* API. That would require either an API key, payment, or reverse engineering. Not done.
- Compare against Martian's hosted router. Not done.
- Run the eval at a different cost ratio. We use the RouterBench/OpenAI public ratio of 13.33x.

## Reproducibility

Files produced by this run:

- `verifier/reports/head_to_head/head_to_head_20260527T124812.json` — machine-readable summary, all metrics, methodology notes.
- `verifier/reports/head_to_head/notdiamond_decisions_20260527T124812.csv` — per-triple ND logits, probabilities, decision.
- `verifier/reports/head_to_head/nadir_decisions_20260527T124812.csv` — per-triple Nadir verifier score, decision.
- `verifier/head_to_head_nd.py` — the script.

To re-run:

```bash
cd /Users/ellabaror/Documents/code/Nadir/getnadir.dev

# One-time: download the ND model
python3 -c "from huggingface_hub import snapshot_download; \
  snapshot_download(repo_id='notdiamond/notdiamond-0001', cache_dir='/tmp/nd_cache')"

# Run head-to-head
python3 verifier/head_to_head_nd.py
```

Inputs locked in:
- `verifier/data/routerbench_triples.jsonl` (the 112,054-triple corpus, deterministic split via `sha256(sample_id) mod 10`)
- `verifier/reports/eval_20260526T184516.json` (verifier per-prompt scores, n=11,420)
- `verifier/weights/best/` (verifier weights, INT8 quantized)
- `notdiamond/notdiamond-0001` from HuggingFace (commit `d754679a...`)

## Per-Router Subsection: Strengths and Weaknesses Surfaced by the Data

### Nadir verifier-gated cascade — strengths

1. **Routing accuracy 3.4x higher than ND** (92.1% vs 27.0%). The verifier mechanism is doing real work: it's correctly identifying which cheap-model answers are good enough and which need escalation.
2. **Cost reduction 15x higher than ND** (65.2% vs 4.3%) on the same model pair, same data, same labels. This is the most defensible single claim from the artifact.
3. **Quality preservation comparable** (98.5% vs 98.9%). The 0.4pp gap is real but the trade-off is dramatic: Nadir gives up 0.4pp of quality preservation in exchange for 15x the cost savings.

### Nadir — weaknesses surfaced

1. Catastrophic rate is 1.5% on the GPT-pair subset, marginally worse than ND's 1.1%. We can argue this is a fair trade for the cost savings, but a buyer optimizing exclusively for quality will read 1.5% as "1 in 67 requests is below the always-expensive baseline."
2. Wasted-escalation rate is 6.4% — Nadir is over-cautious on a non-trivial slice. This is where the OCR closed loop should improve over time.

### notdiamond-0001 — strengths

1. **Lowest catastrophic rate** in the comparison (1.1%). If quality is the only metric, ND wins it (by routing 95% to GPT-4).
2. Loads and runs cleanly from HuggingFace, Apache 2.0. Open-source artifact is real and reproducible.
3. Determinism is comparable to ours.

### notdiamond-0001 — weaknesses surfaced

1. **Effectively an "always-GPT-4 with rare GPT-3.5 carve-outs" router** on this subset. 95.4% of decisions go to GPT-4. The classifier is biased so heavily toward the expensive model that calling it a "router" is generous.
2. **Cost reduction is 4.3%** — essentially no savings over always-GPT-4. Their public "50%+ cost savings" claim is unsupported by the open-source artifact on this benchmark. (It may hold for their hosted product; we did not test that.)
3. **No published RouterBench evaluation** on the HF model card or in their blog. We are the first to publish a direct RouterBench head-to-head against `notdiamond-0001` (as of 2026-05-27, per our literature search).

## What This Means for Marketing

**Public/internal framing per `.agents/product-marketing-context.md`:**

### Claims we can now make publicly that we couldn't yesterday

| New defensible claim | Source |
|---|---|
| "On the GPT-3.5/GPT-4 pair of RouterBench held-out, Nadir's verifier-gated cascade hits 92% routing accuracy and 65% cost reduction; `notdiamond-0001` hits 27% and 4% on the same set." | `verifier/reports/head_to_head/head_to_head_20260527T124812.json` |
| "ND's open-source classifier routes 95% of RouterBench held-out prompts to GPT-4 — it preserves quality by mostly defaulting to GPT-4." | Same JSON; `notdiamond_decisions_*.csv` confirms 3,159/3,313 GPT-4 routes |
| "Nadir is the first published direct RouterBench head-to-head against `notdiamond-0001`." | Literature search 2026-05-27 returned no other artifact |
| "Cost reduction per quality-preservation point: Nadir delivers 65% cost savings at 98.5% quality; ND's open artifact delivers 4% cost savings at 98.9% quality." | Same JSON |

### Claims we should NOT make publicly (yet)

| Claim | Why not |
|---|---|
| "Nadir beats Not Diamond's *hosted* router" | We only tested the open-source `notdiamond-0001`. The hosted product is closed and may behave differently. Frame everything as "vs the open-source classifier ND publishes." |
| "Not Diamond is fake" | Their hosted product has IBM as a customer + investor. The open-source artifact underperforming on RouterBench does not invalidate the hosted product. |
| "ND's published 50% savings claim is false" | ND's blog claim is unsourced; we can say "their open-source artifact does not show 50% savings on RouterBench" — that's defensible. Calling the full claim false is not. |

### Specific phrases to use

- "Verify before ship beats route once and pray" — the architectural wedge, now backed by 15x cost-reduction delta on the same data.
- "Nadir delivers 65% cost savings on RouterBench's GPT pair; the open-source `notdiamond-0001` delivers 4% on the same data" — concrete, specific, citable.
- "ND's open-source router defaults to GPT-4 on 95% of RouterBench held-out" — pointed, true, surfaces their architectural choice.

### Recommended public artifact format

A short blog post titled something like *"We ran Not Diamond's open-source router on RouterBench. Here's what we found."* with:

1. The headline table above.
2. The methodology section verbatim.
3. A link to the JSON and CSV files in the public repo (or a sanitized GitHub Gist).
4. The "what we could not do" caveats up top, not buried.

The reason to be over-honest is that ND will scrutinize this. Every caveat we surface ourselves is a caveat they can't surprise us with.

## Open Questions for Follow-Up

1. **Hosted-ND parity check.** Pay for the ND API for one month, route the same 3,313 prompts through their hosted router, compare. Cost: <$50 at their PAYG rate. High-leverage; do this next.
2. **Threshold-sweep table.** We ran at τ=0.8. The eval JSON has the full sweep — we could publish a "Nadir at multiple operating points vs ND" curve to show ND is dominated across the τ space, not just at 0.8.
3. **Re-run on the full 11,420 set with a multi-class ND substitute.** Not directly comparable, but interesting: if we had a way to ask ND's hosted API "GPT-3.5, GPT-4, or Claude-Haiku, or Claude-Sonnet, or Claude-Opus" per prompt, we could run the full set.
4. **Latency comparison.** ND's classifier is BERT (similar size to ours); both run on CPU under 200ms. We did not measure end-to-end latency in this run; should add for the public artifact.
5. **Per-domain breakdown.** Slice the 3,313 triples by `domain_hint` (MMLU subjects, GSM, etc.) and show where ND wins vs where Nadir wins. The full eval JSON has the data.

---

*Internal review checklist before publishing the public version:*

- [ ] Sanity-check by a second eng (re-run script, confirm CSVs reproduce)
- [ ] Pricing assumption sanity-check (does the $1/$2 / $10/$30 ratio still hold as of publish date?)
- [ ] Legal/comms review of any direct ND mention in public copy
- [ ] Decide whether to upload CSVs to the public repo or gate behind a "request access" form (the artifact is more credible if it's public)
- [ ] Add a footnote about ND's hosted product not being tested, with a "we'd love to see ND publish their numbers" line
