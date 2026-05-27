# Competitive Landscape — LLM Gateways & Routers (2026-05-27)

**Profiles synthesized:** Not Diamond, Portkey, OpenRouter, Martian, LiteLLM, Requesty.
**Excluded but worth tracking:** WeaveRouter (already profiled in `weaverouter.md`).
**Nadir's positioning context:** `.agents/product-marketing-context.md`.

---

## 1. The Landscape in One Paragraph

The LLM gateway market is fragmenting into three categories that look similar from the outside but compete on different axes. **Catalogues** (OpenRouter, soon LiteLLM Cloud) sell *access* to many models; their value is breadth and they take a per-token cut. **Gateways** (Portkey, Requesty, LiteLLM-Cloud) sell *infrastructure around* the model call — observability, guardrails, governance, compliance — and they price on logs or markup. **Routers** (Not Diamond, Martian, Nadir) sell a *decision*: which model to call, with what cost/quality trade-off. The routers are the smallest category by revenue and the most defensible by IP. Inside the router category, the entire field except Nadir uses one-shot predictive routing: pick a model from the prompt, ship the answer, never look back. Nadir's verifier-gated cascade is the only published architecture that scores the cheap response before shipping. That's the wedge, and as of this snapshot, no profiled competitor has matched it in product or paper.

---

## 2. Side-by-Side Comparison

| | **Nadir** | **Not Diamond** | **Martian** | **OpenRouter** | **Portkey** | **LiteLLM** | **Requesty** |
|---|---|---|---|---|---|---|---|
| **Category** | Router | Router | Router | Catalogue | Gateway | Gateway / OSS | Gateway |
| **Founded** | 2024 | 2024 | 2022 | 2023 | 2023 | 2023 (YC W23) | 2024 |
| **HQ** | (private) | SF | SF | SF | SF | SF | London |
| **Funding (public)** | Bootstrapped + early rev | $2.3M (Aug 2024) | $9M seed + reported $1.3B valuation talks | $113M Series B at $1.3B (CapitalG, May 2026) | $18M total, Series A Feb 2026 | YC W23 + undisclosed | $3M seed from 20VC (2024) |
| **Team** | < 10 | ~15 | (private) | (private) | 13–45 | (private) | (private) |
| **Notable backers** | — | IBM Ventures, Jeff Dean, Ion Stoica, Julien Chaumond | NEA, General Catalyst, Prosus, Accenture Ventures | CapitalG | Elevation, Lightspeed | YC, undisclosed | 20VC |
| **Customer logos (named publicly)** | None yet | IBM, Dropbox, DoorDash, AmEx | Accenture distribution | 8M+ devs, undisclosed enterprise | Snorkel, RVO Health, Haptik, F500 pharma | Netflix, Stripe, Adobe, Samsara, NASA | Shopify, Pfizer, Siemens |
| **Customer count claim** | — | — | — | 8M+ users | 3,000+ | (community: 48.4k stars, 21.4k dependents, 240M Docker pulls) | — |
| **Models supported** | Claude 4.5/4.6 family + extensible | OpenAI/Anthropic/Google | (via their menu) | 400+ models, 60+ providers | 1,600+ | 100+ providers | (multi-provider) |
| **Routing approach** | **Trained classifier + verifier-gated cascade + iterative refinement** | One-shot meta-classifier (`notdiamond-0001`, BERT) | One-shot predictive | Catalogue (no routing); `openrouter/auto` outsourced to Not Diamond | Rules-based ("custom conditions") | Load balancer + rules + new `auto_router` (embedding match) + rule-based `complexity_router` | Task-tagging rules; "Smart Routing" but no classifier described |
| **Verifier in the loop?** | **Yes (AUROC 0.961)** | No | No | No | No | No | No |
| **Published benchmark** | RouterBench held-out, n=11,420 (private eval, public on site) | "1.51x better than GPT-4 as router" (no methodology) | RouterBench paper (Hu et al. 2024) — they own the dataset | None | None | None | None |
| **Academic paper** | IP-1 draft on disk, not yet on arXiv | None | arXiv:2403.12031 (cited) | None | None | None | None |
| **Pricing model** | $9/mo + 25%/10% of savings (aligned) | $0 / 10K free, then $10 per 10K routing recs | $0 / 2,500 free, then $20 per 5K, enterprise contact-sales | 5.5% platform fee on every token | $0 OSS / $0 Dev / $49 Pro / Enterprise (metered on logs) | OSS free / $250 Enterprise Basic / $30K/yr Enterprise Premium | Flat 5% markup |
| **Skin-in-the-game on savings?** | **Yes — we eat $9 if we save nothing** | No (per-rec fee) | No (per-rec fee) | No (per-token cut regardless) | No (log-metered) | No (subscription) | No (flat markup) |
| **Compliance posture** | TBD | SOC 2, ISO 27001 | (enterprise sales) | (none stated) | SOC 2, HIPAA add-ons | SOC2/HIPAA on Enterprise Premium | SOC 2 Type II + EU residency + 99.99% SLA |
| **Open source** | NadirClaw (MIT) | No | No | No | (gateway is OSS) | **Yes (48.4k stars, the OSS standard)** | No |
| **Distribution** | None yet | Powers OpenRouter `auto` | Accenture partnership | 8M devs, viral | 3,000+ customers, content velocity | Embedded in Google ADK + OpenAI Agents SDK | Enterprise-led |

---

## 3. Positioning Map — Two Axes

**Axis 1: Predictive (route once, ship answer) ↔ Verified (score answer, escalate if needed)**
**Axis 2: Catalogue (you pick the model) ↔ Router (we pick the model)**

```
            Catalogue (you pick)                      Router (we pick)

   OpenRouter ●━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━●  Not Diamond, Martian
   (also embeds ND for auto)        |                (one-shot predictive)
                                    |
                          Portkey ● |   ● LiteLLM (rules + new embed-match)
                          (rules)   |
                                    |
                          Requesty ●|
                          (task-tag)|
                                    |
                                    ●  ← Nadir (only point on this axis: verified cascade)
                                    |
                                    └── Verified (the empty quadrant)
```

**The map shows the wedge.** Six of the seven players (including Nadir) live in the "we pick the model" half. But Nadir is the only point that does *verified* routing. Everyone else routes once and ships the answer no matter what. That quadrant has no other tenant as of 2026-05-27.

---

## 4. Where Nadir Wins — by Competitor

| Competitor | Nadir's strongest claim against them |
|---|---|
| **Not Diamond** | Same category, both call themselves routers. ND routes once with a BERT classifier (`notdiamond-0001`, 15 HF downloads/mo). Nadir routes, then verifies, then refines, then escalates. ND's hero claim ("1.51x better than GPT-4") has no published methodology. Nadir's claim ("60% / 98% on 11,420 RouterBench triples") has an open eval JSON and AUROC 0.961. |
| **Martian** | They published the dataset and the paper. We use their dataset *as a third-party benchmark* to evaluate a different architecture than the one their paper describes. Verifier-gated cascade is not in Hu et al. 2024. Aligned pricing ($9 + savings fee vs. their $20 per 5K). |
| **OpenRouter** | Different category — they're a catalogue. But their `auto` mode is powered by Not Diamond, so the same wedge applies. We're aligned with the user on cost (savings fee, not a per-token cut). |
| **Portkey** | They are a *gateway*, we are a *router*. Their own copy says "route to providers as per custom conditions" — that's rules, not a classifier. They have no published routing benchmark. We have RouterBench. |
| **LiteLLM** | We use LiteLLM internally; we do not attack the library. Against LiteLLM Cloud/Enterprise specifically: their `auto_router` is embedding-similarity matching to a stored utterance bank; their `complexity_router` is rule-based. Neither is a trained classifier; neither verifies output. |
| **Requesty** | Their "Smart Routing" is task-tagging (e.g., "code goes to Sonnet"). No published classifier, no benchmark. Direct routing-IP fight is most winnable here. |

---

## 5. Where Nadir Loses — by Competitor (Honest)

| Competitor | What they have that we don't |
|---|---|
| **Not Diamond** | Distribution via OpenRouter's `auto`. Logo book (IBM, Dropbox, DoorDash, AmEx). Institutional backers (IBM Ventures, Jeff Dean, Ion Stoica). SOC 2 + ISO 27001. |
| **Martian** | Academic credibility (cited paper). RouterBench ownership. Accenture distribution. ~$1.3B reported valuation talks. Co-authored with UC Berkeley's Keutzer lab. |
| **OpenRouter** | Scale (8M devs, 100T tokens/mo). $113M Series B at $1.3B led by CapitalG (the canonical "winning the category" funding). 400+ models, 60+ providers. |
| **Portkey** | Customer count (3,000+). G2 reviews (4.8/5). Observability + guardrails + governance + prompt management depth. 1,600+ model integrations. $18M Series A. |
| **LiteLLM** | 48.4k GitHub stars. Embedded in Google ADK and OpenAI Agents SDK. Logos: Netflix, Stripe, Adobe, NASA. 240M Docker pulls. Community network effects. |
| **Requesty** | SOC 2 Type II + EU residency + 99.99% SLA. 5-layer policy engine. Enterprise compliance posture out of the box. Logos: Shopify, Pfizer, Siemens. |

---

## 6. Five Strategic Observations

### Observation 1 — The "verified routing" quadrant is empty
No other profiled competitor scores cheap-model output before shipping. The closest near-equivalent is LiteLLM's `auto_router`, which matches against a stored utterance bank — not output scoring. **This is Nadir's actual moat.** Defend it aggressively in copy: the wedge is "verify before ship," not "we route cheaper." Cheaper-routing claims are commoditized; quality-preservation claims under measurement are not.

### Observation 2 — Funding has bifurcated
OpenRouter just raised $113M at $1.3B. Martian is reportedly near $1.3B. Portkey raised $18M Series A. Not Diamond raised $2.3M. Requesty raised $3M. The market has separated into "category winners" and "everyone else." Nadir is in the latter group. **Do not try to outspend.** The only path against well-funded incumbents is the architectural moat plus an asymmetric distribution play (the savings-aligned pricing, the npm install, the open-source NadirClaw).

### Observation 3 — Everyone else takes a per-token or per-request fee
OpenRouter: 5.5% per token. Requesty: 5% markup. Portkey: per-log. Not Diamond: per-rec. Martian: per-rec. LiteLLM: subscription. **Nadir is the only profiled player whose pricing is aligned with customer outcome.** If we save nothing, we earn $9. That's not just a pricing line — it's an integrity claim. We should lead with this against every competitor whose pricing decouples from savings, which is all six of them.

### Observation 4 — Compliance is the missing leg
Requesty's SOC 2 Type II + EU residency + 99.99% SLA is the most-developed compliance posture in this comparison. Not Diamond has SOC 2 + ISO 27001. LiteLLM Enterprise Premium has SOC2/HIPAA support. Nadir's compliance posture is TBD. **Enterprise procurement will gate on this.** Until we have SOC 2 Type I in flight at minimum, every enterprise conversation hits this wall. This is the second-most-important gap to close after the head-to-head benchmark artifact.

### Observation 5 — Distribution beats IP at scale
LiteLLM is the OSS standard. OpenRouter is the catalogue standard. Portkey is the gateway standard for the AI-native SaaS crowd. Martian has Accenture. Not Diamond has OpenRouter `auto`. **Nadir has nothing comparable yet.** The wedge is real but invisible without distribution. Highest-leverage moves: (a) public RouterArena leaderboard entry, (b) direct head-to-head with `notdiamond-0001` on RouterBench, (c) listing on OpenRouter as a provider, (d) Claude Code / Cursor / Codex / Aider integration showcases.

---

## 7. The Asymmetric Bet — What "Best LLM Gateway" Actually Requires

The user's goal is for Nadir to be the best LLM gateway. "Best" against this field requires winning on **three** dimensions simultaneously, because any single one is contestable:

1. **Routing quality, measured publicly.** RouterArena leaderboard entry, ND head-to-head on RouterBench, IP-1 paper on arXiv. Without a number on a third-party leaderboard, "we have a verifier" is a feature claim, not a moat.
2. **Distribution, however asymmetric.** Plug-in for Claude Code / Cursor (mindshare in our target ICP). Listing on OpenRouter as a provider (uses their distribution to bypass their auto router). Open-source `NadirClaw` SEO. npm + brew install paths.
3. **Pricing integrity, productized.** The savings-aligned fee is the only such fee in the field. Build the dashboard that *visibly proves* this — the receipt is the marketing.

If we win on #1 alone, we're a paper. If we win on #2 alone, we're a thinner OpenRouter. If we win on #3 alone, we're a pricing gimmick. The combination is what no one else can claim.

---

## 8. Concrete Next Actions (Prioritized)

| # | Action | Why it matters | Estimated effort |
|---|---|---|---|
| 1 | **Head-to-head: Nadir vs `notdiamond-0001` on RouterBench held-out** | Single most reproducible "we beat ND" artifact. Direct attack on the closest IP competitor. | 1 day |
| 2 | **RouterArena dry-run against their actual dataset** | Tells us our rank before we submit. Gate for the submission PR. | 2 hours |
| 3 | **Open RouterArena PR + arXiv IP-1 paper** (sequenced) | Public benchmark + academic credibility, in that order. | 1 week, with Block B (contamination audit) and Block C (eval key) cleared first |
| 4 | **Bump production cascade threshold to τ=0.8** | Site already claims this; production needs to match. | 30 min |
| 5 | **Commit + push the website rewrite** | Netlify auto-deploys. Today's eval framing goes live. | 15 min |
| 6 | **Compliance roadmap: SOC 2 Type I in flight + EU residency planned** | Enterprise procurement gate. Requesty has this; we don't. | 6–12 weeks, but the *commitment* unblocks deals now |
| 7 | **Publish `wide_deep_asym_v3.pt` on HuggingFace** | Reproducibility artifact. Forces engagement, not dismissal. Same playbook as `notdiamond-0001`. | 2 hours |
| 8 | **OpenRouter provider listing** | Use their distribution. Get traffic from devs who default to OpenRouter. | Unknown — depends on OpenRouter approval |
| 9 | **Battle-card per competitor** (use the profiles in this directory) | Sales/AE-ready, one page each. Land in sales-enablement. | 2 hours total |
| 10 | **Blog: "Routing without verification is dead-reckoning"** | Public positioning piece. Names ND specifically. Frames the category. | 4 hours |

---

## 9. The Honest Verdict on "Are We the Best?"

Today, no. On three measurable dimensions, the answer is:

- **Routing IP and architecture:** Yes. Verifier-gated cascade + iterative refinement is unmatched in this field by any published artifact.
- **Measured benchmark position:** Unknown. Until RouterArena PR + ND head-to-head, we have a private eval and a claim.
- **Distribution and scale:** No, and not close. OpenRouter at 100T tokens/mo and LiteLLM at 48.4k stars are categorical scale gaps.

**The plan to flip "no" to "yes" runs through artifacts, not engineering.** The product is in good shape. What's missing is the *receipts* — public benchmark, head-to-head, paper, OpenRouter listing, SOC 2 commitment. Each of those is a project of days or weeks, not months. The competitive picture says: the moat exists, but it's only a moat once everyone else can see it.

---

## Raw Data Index

Per-competitor profiles:
- `competitor-profiles/not-diamond.md`
- `competitor-profiles/portkey.md`
- `competitor-profiles/openrouter.md`
- `competitor-profiles/martian.md`
- `competitor-profiles/litellm.md`
- `competitor-profiles/requesty.md`

Raw scrapes + search notes per competitor:
- `competitor-profiles/raw/<slug>/2026-05-27/scrapes/`
- `competitor-profiles/raw/<slug>/2026-05-27/seo/`

Previously profiled (out of scope of this run but in the same dir):
- `competitor-profiles/weaverouter.md`
- `competitor-profiles/_plan-beat-weaverouter.md`, `_why-we-win.md`, `_cycle1-synthesis.md`, `_cycle1-retro.md`, `_cycle2-retro.md`
