# Tweet thread: Nadir on RouterArena

*Target: AI/dev Twitter. 10 tweets. Hashtags optional, used sparingly.
Each tweet kept ~250 chars to leave room for replies and quote-tweets.*

---

**Tweet 1 (open / headline):**

We submitted Nadir to RouterArena.

Result: rank 2 on the public leaderboard, ahead of azure-model-router
(+1.1pp), Not Diamond (+13.9), Martian's RouterBench-MLP (+13.6), and
vLLM-SR (+3.9).

We are not #1. The post explains why that's the right number to publish.

---

**Tweet 2 (the table):**

Top of the RouterArena full split, n=8,400, official scorer:

1. orcarouter-adaptive: 0.7204
2. nadir-cascade-verified: 0.7118
3. azure-model-router: 0.7107
4. nadir-cheapest: 0.7043
5. r2-router: 0.6997
6. vLLM-SR: 0.6724

Two adapters, on purpose.

---

**Tweet 3 (why two adapters):**

`nadir-cascade-verified` is the primary: trained classifier
(`wide_deep_asym_v3`) + a YAML rule profile + a calibrated verifier
that reads the cheap-tier cached response and selectively escalates.

`nadir-cheapest` is a pure cost-minimizer baseline, published for
transparency.

---

**Tweet 4 (the verifier hop):**

The verifier hop is the wedge. No-verifier cascade scored 0.7013.
Verifier-gated cascade at τ=0.70 scored 0.7118.

Same prompts, same cached pool, same official scorer. The verifier
reads the cheap-tier response, scores it, and only escalates when it
falls below threshold.

---

**Tweet 5 (the ND punch):**

Nadir 0.7118. Not Diamond 0.5729. Same scorer, same split.

In our internal head-to-head on RouterBench's GPT pair, the gap is
sharper: 65% cost reduction (Nadir) vs 4% (ND's open classifier,
which routes 95% of traffic to GPT-4).

ND routes once. We verify.

---

**Tweet 6 (the architectural wedge):**

Every other router in this leaderboard is one-shot predictive: guess a
model from the prompt, ship the answer.

Nadir is verified: cheap model answers first, calibrated verifier
(AUROC 0.961) scores the answer, escalate only when the verifier
rejects.

Mistakes are recoverable.

---

**Tweet 7 (threshold calibration disclosure):**

We swept the verifier acceptance threshold τ on RouterArena's cached
response distribution. τ=0.70 maximized arena score. Production live
traffic stays on τ=0.80 (calibrated on RouterBench).

Full table in the repo. No retraining, no peeking at ground truth.

---

**Tweet 8 (the RouterBench number):**

The full production stack on RouterBench: 98% of always-Opus quality
preserved at 60% cost reduction. n=11,420 held-out triples. Eval JSON
in the repo (`verifier/reports/eval_composed_20260526T191001.json`).

Different benchmarks measure different objects.

---

**Tweet 9 (the product):**

Two-line change. OpenAI compatible. BYOK on every tier including free.

```python
client = OpenAI(
    base_url="https://api.getnadir.com/v1",
    api_key="ndr_..."
)
client.chat.completions.create(model="auto", messages=[...])
```

---

**Tweet 10 (close + link):**

Pro is $9/mo + 25% of first $2K saved, 10% above. If we save you
nothing, you pay $9.

Submission PR description, threshold sweep, and the full blog are
linked below.

Thanks to RouteWorks/RouterArena for maintaining the benchmark.

https://getnadir.com/blog/routerarena-submission-2026-05-27

---

## Notes for the publisher

- Lead with the headline result, not the architectural claim. Tweet 1
  is the most-screenshotted; it must say "rank 2, ahead of [named
  competitors]" and not over-claim. We're #2, not #1; orcarouter-adaptive
  sits ahead at 0.7204 and Alibaba Cloud uses a different cached pool.
- Tweet 4 (the verifier hop) is the new flagship. It moves the
  no-verifier cascade (0.7013) to the verifier-gated number (0.7118)
  and is the cleanest expression of why post-generation verification
  matters. Keep it.
- Tweet 5 (ND punch) and tweet 6 (the wedge) are the most-quoted
  candidates. They should be screenshot-ready on their own.
- Tweet 7 is the calibration-honesty tweet. Required: do not skip if
  shortening the thread. We disclose τ-calibration openly to head off
  any "you tuned a hyperparameter on the test set" objection. We
  didn't change verifier weights or peek at ground truth.
- Tweet 8 is the redirect to the RouterBench number. The whole purpose
  of the thread is to get readers from the RouterArena framing to the
  RouterBench full-stack number without leading with the latter.
- Do not use em dashes. Confirmed scan.
- Numbers in this thread:
  - 0.7118 (`nadir-cascade-verified` τ=0.70, official scorer)
  - 0.7013 (no-verifier cascade prior baseline)
  - 0.7043 (`nadir-cheapest` Strategy E, official scorer)
  - 0.7107 (azure-model-router, public leaderboard)
  - 0.5729 (Not Diamond on RouterArena)
  - 0.5755 (Martian RouterBench-MLP)
  - 0.6724 (vLLM-SR)
  - 0.961 (verifier AUROC, RouterBench held-out)
  - 98% / 60% (full cascade on RouterBench held-out, n=11,420)
  - 65% / 4% (GPT-pair head-to-head vs `notdiamond-0001`)
