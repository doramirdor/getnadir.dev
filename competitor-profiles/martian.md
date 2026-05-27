# Martian — Competitor Profile

*Profiled: 2026-05-27. Sources in `competitor-profiles/raw/martian/2026-05-27/`.*

## At a Glance

- **Company:** Martian (withmartian.com), San Francisco
- **Founded:** 2022 by Shriyash Kaustubh Upadhyay and Etan Ginsberg
- **Funding:** $9M seed disclosed. Investors include NEA, General Catalyst, Prosus Ventures, Carya Venture Partners, Accenture Ventures, Agi House. Reportedly nearing a $1.3B valuation per an April 2026 Medium post (not officially confirmed by Martian or a tier-1 outlet).
- **Team origin:** Researchers from Google DeepMind, Anthropic interpretability, Meta superintelligence commercialization. Academic ties to UC Berkeley (Kurt Keutzer lab, BAIR).
- **Product focus:** LLM model router + gateway. Commercial product is the Martian Router (drop-in, OpenAI-compatible). The withmartian.com homepage has been re-positioned as a research lab ("Understanding Intelligence"); the router lives on `route.withmartian.com`, `work.withmartian.com`, and `docs.withmartian.com`.
- **Strategic distribution:** Accenture partnership (September 2024). Martian's router is integrated into Accenture's "switchboard" services for enterprise customers.
- **Note on category:** Martian explicitly claims to have "invented the first LLM router." This puts them in the same direct-competitor lane as Nadir, OpenRouter, Not Diamond, Requesty, and Portkey.

## Positioning & Messaging

Two parallel brand layers:

1. **Research lab (withmartian.com root):** "Understanding Intelligence." Positions Martian as a research org studying machine intelligence, with three pillars: measurement, explanation, application. Lists research projects: ARES, Code Review Bench, K-Steering, an interpretability prize.

2. **Commercial router (route.withmartian.com, work.withmartian.com, docs.withmartian.com):** "Increase AI performance and reduce cost with the LLM router." Drop-in OpenAI-compatible endpoint, automatic failover, willingness-to-pay controls, 200+ models.

The split is unusual. Most gateway competitors lead with the product. Martian leads with the lab. The likely intent is to differentiate from commoditizing gateways (OpenRouter, Portkey, LiteLLM) by anchoring to research credibility — which they have, because they published RouterBench.

Marketing claim across press coverage: cost reduction of "20% to 97%" with "often beating GPT-4 performance on key benchmarks." Range is wide and not tied to a specific public eval; treat as marketing copy.

## Product & Features

**Martian Router (Model Router)**
- Drop-in, OpenAI-compatible endpoint: `https://api.withmartian.com/v1/chat/completions`
- Model field accepts namespaced models (e.g. `"openai/gpt-4.1-nano"`)
- Per-request controls: `max_cost` (USD cap), willingness-to-pay
- Automatic failover across providers on outage or high-latency events
- Auto-adds new models as they launch
- 200+ models in the catalog (OpenAI, Anthropic, Mistral, Llama, more)
- Dashboard with real-time metrics, request history, performance data
- Compliance: vet/approve which models are usable per application

**Integrations listed in docs:** HTTP client, OpenAI SDK, Anthropic SDK, Vercel AI SDK, LiteLLM, Cursor, Cline, Aider, Claude Code, Codex, OpenCode.

**Architectural read (important for the competitive section below):** Martian's router is a one-shot predictive router. The router selects a model from the catalog before generation, then ships that model's output. The RouterBench paper compares such predictive routers; it does not publish a post-generation verification step or a cascade architecture. Their commercial product does not appear to verify the cheap answer before shipping.

## Pricing

- **Free / Developer:** 2,500 requests included.
- **Developer (usage-based):** $20 per additional 5,000 requests beyond the free tier.
- **Enterprise:** Custom router tuned to customer data, SLA, VPC deployment, dedicated support, compliance vetting. Contact-sales.

Pricing was confirmed via third-party comparison sites (respan.ai, everydev.ai) and Martian's own search-indexed pricing snippets. `withmartian.com/pricing` returned 404 at fetch time; `route.withmartian.com/pricing` refused our connection. Pricing freshness should be verified before quoting publicly.

## Customers & Social Proof

- Marketing line: "Engineers at 300+ companies, from Amazon to Zapier, have used Martian." This is "have used," not "are paying customers." Likely counts free-tier signups.
- Accenture as a strategic distribution partner (Sept 2024). This is the strongest single piece of social proof Martian has — a Big Four consultancy embedding Martian into enterprise services.
- Press: TechCrunch (Nov 2023), VentureBeat (post-Accenture), BigDATAwire / HPCwire on the $9M raise.
- G2 listing exists; review volume not captured in this scan.

## RouterBench (the dataset and the paper)

This is the most consequential fact in this profile. Martian, in collaboration with UC Berkeley (Kurt Keutzer lab + BAIR), published **RouterBench: A Benchmark for Multi-LLM Routing System** (Hu et al., arXiv:2403.12031, March 2024).

- 405k+ inference outcomes across 8 task domains
- 30k+ prompts on the HuggingFace release (`withmartian/routerbench`)
- Sourced from MBPP, GSM-8k, Winogrande, Hellaswag, MMLU, MT-Bench, and others
- Two versions: 5-shot and 0-shot
- Each record has prompt, model response, cost, performance score across 11 LLMs
- Cited in follow-on routing research (e.g. IRT-Router, arXiv:2506.01048)

RouterBench is the canonical academic benchmark for the LLM routing research area. Martian published it. Nadir trains and evaluates the verifier on it. This is the strategically awkward fact this profile has to address head-on.

## Strengths

- **Academic credibility.** Published the canonical routing benchmark with UC Berkeley. The paper is widely cited. Nobody else in the gateway space has comparable academic standing.
- **Brand association with RouterBench.** Anyone serious about LLM routing has read their paper. Cross-references and citations work in Martian's favor by default.
- **First-mover narrative.** "Invented the first LLM router" is a defensible positioning claim (TechCrunch coverage dates to Nov 2023).
- **Enterprise distribution.** Accenture integration gives them a path to large enterprise customers that bootstrapped gateway competitors cannot replicate without a similar channel partner.
- **Researcher-heavy team.** Ex-DeepMind, ex-Anthropic interpretability. Strong technical hiring signal.
- **Model catalog depth.** 200+ models, OpenAI + Anthropic SDK compatibility, broad IDE integration list.

## Weaknesses

- **Brand confusion.** The root domain now sells a research lab; the router lives on three different subdomains. A prospect Googling "Martian LLM router" lands on "Understanding Intelligence," not the product. This is friction.
- **Pricing opacity.** Pricing pages are flaky (404 on the canonical URL, ECONNREFUSED on the alternate). The $20 / 5,000 requests pattern is rough; no transparent enterprise floor.
- **Architectural ceiling.** The router is one-shot predictive. If the classifier picks wrong, the customer eats a low-quality response. No published verification step, no cascade, no recovery mechanism on a wrong route.
- **Marketing claims are loose.** "20% to 97% cost reduction" and "often beating GPT-4" are not tied to a specific public eval. Sophisticated engineering buyers will want a single number with a citation.
- **No public production-router number on RouterBench.** They built the benchmark; they have not published a current Martian Router score on the held-out split, or at least not a prominent one. This is a missed opportunity that creates an opening for competitors to publish those numbers first.
- **Customer-count framing.** "300+ companies have used" is signup language, not paying-logo language. The strongest verifiable logo is Accenture as a partner, not a customer.

## Competitive Implications for Nadir

### Where Martian is stronger than Nadir
- **Academic credibility.** They published RouterBench. We did not.
- **Paper citations.** Hu et al. 2024 is in every routing paper's reference list. We have a website and an eval JSON; that is not the same thing as a peer-reviewed publication, even if our methodology is sound.
- **Enterprise distribution channel.** Accenture is in the room with Fortune 500 buyers. We are not, yet.
- **Brand association with the canonical eval.** The dataset bears their org name (`withmartian/routerbench`). Every time we cite the benchmark, we are also implicitly citing them.
- **Investor signal.** $9M with NEA, General Catalyst, Prosus is a stronger fundraising story than ours today.

### Where Nadir is stronger than Martian
- **Verifier-gated cascade architecture.** The cheap model answers first; a calibrated verifier (AUROC 0.961, ECE 0.016 on RouterBench held-out) scores it; we only escalate when quality fails the bar. This is not in the RouterBench paper, and it is not what Martian's router does in production based on all available material. Their router is *predictive* (route once, ship). Ours is *verified* (route, score, decide to ship or escalate). When the router is wrong, their customer absorbs the mistake; ours doesn't.
- **Iterative refinement before escalation.** A second cheap-model pass on borderline cases before paying for an Opus escalation. Novel cost moat, not published anywhere else.
- **OCR closed loop.** Continuous retraining of thresholds from live response-quality signal. Not in the paper or the Martian product.
- **Specific, citable headline numbers.** "60% cost reduction, 98% of always-Opus quality preserved, n=11,420 RouterBench held-out triples." This is one number with one citation. Martian's marketing copy ("20% to 97%") is not.
- **Pricing transparency.** Flat $9/mo + savings fee, posted on the page. Their pricing page is hard to find and the URL was 404 at fetch time.
- **Open-source self-host (NadirClaw, MIT).** Reduces buying friction for teams with procurement constraints. Martian is closed.
- **BYOK on every tier including Free.** Martian's free tier uses Martian's keys (2,500 requests).

### The strategic awkwardness — RouterBench framing

This is the part to get right.

Martian created RouterBench. We use it as a third-party benchmark. Our headline numbers ("60% / 98% on 11,420 held-out triples") are computed on their dataset. We do not own it, we did not build it, and we should never imply otherwise.

**Framing rules (apply across the site, docs, and sales material):**
- Always cite the eval inline: "on 11,420 RouterBench held-out triples." Never just "60% cost reduction" without the source.
- Acknowledge RouterBench as the canonical routing benchmark when introducing it.
- Cite Hu et al. 2024 (arXiv:2403.12031) in any technical deep-dive or comparison page.
- Do not say "we beat Martian on RouterBench" until we have run their published router config on the same held-out split and have an artifact to point at.
- Never use language that implies we created the dataset.

**What would let us credibly claim "Nadir beats Martian on RouterBench":**
A head-to-head where we run the published Martian Router (or the closest reproducible analog from their `routerbench` package and `alt-routing-methods` repo) on the same 11,420-triple held-out split we evaluate Nadir on, and publish both numbers side by side. Until that artifact exists, the honest claim is "Nadir's verifier-gated cascade preserves 98% of always-Opus quality at 40% of the cost on RouterBench held-out (n=11,420). The verifier-gated cascade architecture is not present in the RouterBench paper or in publicly documented Martian Router behavior."

### The wedge is architectural, not academic

We will not out-paper Martian. They have a strong publication; we should respect it and cite it correctly. The wedge is the architecture:

- **Their paper benchmarks predictive routers.** Pick a model, ship the answer.
- **Our product runs a verified cascade.** Cheap model answers first; verifier scores; ship or escalate. This is a different algorithmic class. It is not what the paper compares.

Lead with this. In the public comparison page (when we write one):
- Respect the paper. Cite it. Use the dataset name correctly.
- Be specific that our architecture (verifier-gated cascade with calibrated AUROC 0.961, iterative refinement before escalation, OCR closed loop) is not in their paper and is not what their product does.
- Avoid leaderboard-style "we beat them" copy until we have the head-to-head artifact.

## Recommended Actions

1. **Build the head-to-head.** Run a Martian Router analog on our 11,420-triple held-out split. Publish a single table: predictive baseline vs verifier-gated cascade, cost vs quality preservation. This is the single highest-leverage artifact we can produce against Martian specifically.
2. **Write a `/compare/martian` page** with the framing above. Lead with respect for the paper, then the architectural diff.
3. **Never accidentally claim ownership of RouterBench.** Audit existing copy for any phrasing that could read as "our benchmark." It is their benchmark; we evaluate on it.
4. **Track the Martian valuation story.** If the $1.3B number gets confirmed by a tier-1 outlet, the competitive narrative shifts; we should be ready with a positioning response.
5. **Watch for Martian publishing their own RouterBench leaderboard.** They have the moral right to publish a current Martian Router number on the held-out split. If they do, our number needs to already be public.

## Raw Data Sources

- Homepage: `competitor-profiles/raw/martian/2026-05-27/scrapes/homepage.md`
- Pricing: `competitor-profiles/raw/martian/2026-05-27/scrapes/pricing.md`
- Products: `competitor-profiles/raw/martian/2026-05-27/scrapes/products.md`
- Docs: `competitor-profiles/raw/martian/2026-05-27/scrapes/docs.md`
- RouterBench HF dataset: `competitor-profiles/raw/martian/2026-05-27/scrapes/routerbench-hf.md`
- RouterBench paper: `competitor-profiles/raw/martian/2026-05-27/scrapes/paper-arxiv.md`
- Search notes (funding, customers, press): `competitor-profiles/raw/martian/2026-05-27/seo/search-notes.md`

### External links
- withmartian.com (research-lab homepage)
- docs.withmartian.com (router docs)
- route.withmartian.com (router product)
- work.withmartian.com (router product)
- huggingface.co/datasets/withmartian/routerbench
- arxiv.org/abs/2403.12031 (Hu et al., 2024)
- github.com/withmartian/routerbench
- github.com/withmartian/alt-routing-methods
- newsroom.accenture.com (Sept 2024 Accenture investment)
- techcrunch.com (Nov 2023 launch coverage)
- venturebeat.com (Accenture x Martian routing coverage)
