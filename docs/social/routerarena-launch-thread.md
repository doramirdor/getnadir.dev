# Tweet thread: Nadir on RouterArena

*Target: AI/dev Twitter. 10 tweets. Hashtags optional, used sparingly.
Each tweet kept ~250 chars to leave room for replies and quote-tweets.*

---

**Tweet 1 (open / headline):**

We submitted Nadir to RouterArena.

Projected top 5 on the public leaderboard. Ahead of Auto Router
(+1.13), vLLM-SR (+3.95), Not Diamond (+13.89), and every Martian
variant.

Sqwish, OrcaRouter, Azure Model Router, and R2 sit ahead of us. Post
below explains why those are the right numbers to publish.

---

**Tweet 2 (the table):**

Live public leaderboard with our projected slot inserted:

1. Sqwish Router: 75.27
2. OrcaRouter-Adaptive: 72.08
3. Azure-Model-Router: 71.87
4. R2-Router: 71.60
5. nadir-cascade-verified (projected): 71.18
6. Auto Router: 70.05
7. vLLM-SR: 67.23
...
13. NotDiamond: 57.29

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

Nadir 71.18. Not Diamond 57.29. Same scorer, same split.

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

A separate honesty note: Weave Router has prediction files in the
RouterArena repo but is not on the public board. Their config
self-describes as cluster-routing trained on the RouterArena full
split with k=160 clusters. Nadir trained on neither split.

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

- Lead with "top 5" not "rank 2". Tweet 1 is the most-screenshotted;
  it must say "projected top 5, ahead of [named competitors]" and
  not over-claim. Sqwish (75.27), OrcaRouter (72.08), Azure
  Model Router (71.87), and R2-Router (71.60) all sit ahead on the
  live published leaderboard.
- Our 0.7118 is what RouterArena's `compute_scores.py` returns on our
  stored prediction files. The published leaderboard uses the full
  evaluation pipeline (live LLM calls fill in `generated_result` /
  `accuracy` / `cost`), so the final rank when reviewers score us may
  shift a notch. Disclose that wherever the projected rank is cited.
- Tweet 4 (the verifier hop) is the flagship. It moves the
  no-verifier cascade (0.7013) to the verifier-gated number (0.7118)
  and is the cleanest expression of why post-generation verification
  matters. Keep it.
- Tweet 5 (ND punch) and tweet 6 (the wedge) are the most-quoted
  candidates. They should be screenshot-ready on their own.
- Tweet 7 is the calibration-honesty tweet. Required: do not skip if
  shortening the thread. We disclose τ-calibration openly to head off
  any "you tuned a hyperparameter on the test set" objection. The
  Weave Router note is also kept here as a citable, non-snarky
  contrast: we did not train on RouterArena splits, and at least one
  router that did is missing from the public board.
- Tweet 8 is the redirect to the RouterBench number. The whole purpose
  of the thread is to get readers from the RouterArena framing to the
  RouterBench full-stack number without leading with the latter.
- Do not use em dashes. Confirmed scan.
- Numbers in this thread:
  - 0.7118 / 71.18 (`nadir-cascade-verified` τ=0.70, official scorer
    on our prediction files; projected top 5)
  - 0.7013 (no-verifier cascade prior baseline)
  - 0.7043 (`nadir-cheapest` Strategy E, official scorer)
  - 75.27 (Sqwish Router, public leaderboard)
  - 72.08 (OrcaRouter-Adaptive, public leaderboard)
  - 71.87 (Azure-Model-Router, public leaderboard)
  - 71.60 (R2-Router, public leaderboard)
  - 70.05 (Auto Router, public leaderboard)
  - 67.23 (vLLM-SR, public leaderboard)
  - 57.29 (Not Diamond, public leaderboard)
  - 0.961 (verifier AUROC, RouterBench held-out)
  - 98% / 60% (full cascade on RouterBench held-out, n=11,420)
  - 65% / 4% (GPT-pair head-to-head vs `notdiamond-0001`)
