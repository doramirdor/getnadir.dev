# Not Diamond — Competitor Profile

*Profiled: 2026-05-27. Quick-scan depth. Author: Nadir competitive intelligence.*

## At a Glance

| | |
|---|---|
| **URL** | https://www.notdiamond.ai |
| **Tagline** | "The world's most powerful intelligent model router." |
| **Founded** | 2024 (one source says 2023; founders/Crunchbase converge on 2024) |
| **HQ** | San Francisco (NYC office also mentioned in third-party listings) |
| **Founders** | Tomás Hernando Kofman (CEO), Tze-Yang Tung (CTO), Jeffrey Akiki (COO) |
| **Team size** | ~15 visible on About page |
| **Funding** | NT$75.4M (~US$2.3M) reported Aug 2024 (Taiwan News). IBM Ventures invested (date/size not disclosed publicly). Angels include Jeff Dean, Julien Chaumond, Ion Stoica. VCs include Inovia, Defy. No public Series A announcement found as of 2026-05-27. |
| **Domain authority signal** | Strong. IBM published a dedicated investment thesis post. OpenRouter's `openrouter/auto` is powered by Not Diamond (per OpenRouter's own docs, surfaced via comparison sites). VentureBeat launch coverage. |
| **HuggingFace presence** | `notdiamond-0001` model card. Apache 2.0. 15 downloads last month as of 2026-05-27. |
| **Compliance** | SOC-2, ISO 27001, custom ZDR policies |

## Positioning & Messaging

**Value prop:** "We integrate with your existing AI gateway and coding agents to automatically recommend the best model for each prompt, reducing costs at scale while improving accuracy."

**Hero positioning angle:** Routing as a *recommendation layer* that sits on top of an existing stack, not a gateway replacement. This is reinforced by third-party comparisons: "Not Diamond should not be treated as a direct gateway replacement... it's a routing and optimization layer that can sit on top of your existing stack" (Slashdot). They explicitly position against OpenRouter as complementary, not competitive.

**Target audience:** "Developers at the frontier" (homepage wording), teams building autonomous coding agents, organizations seeking cost optimization without sacrificing accuracy.

**Key narrative themes:**
1. The "Google moment for AI" — About page frames ND as the routing-algorithm-for-the-multi-model-era, contrasted against walled-garden foundation labs.
2. **Cost + accuracy together**, not either/or. Homepage numbers: "10%+ accuracy gains, 50%+ cost savings."
3. **Agent-native.** Heavy emphasis on autonomous coding agents and long-running workloads.
4. **Distributed AI future.** Positioning is partly ideological: less monopolistic, more energy efficient, more interpretable.

## Product & Features

**Core capabilities:**
- **Intelligent model routing** — meta-classifier picks one model per prompt. Pre-trained routers for chat and code; custom routers trainable on user data.
- **Prompt optimization** — separate product line. Automatically tunes prompts to a target model. Works with "as few as three data samples."
- **SDK + REST API** — Python (`notdiamond` on PyPI), TypeScript (`notdiamond` on npm), and an OpenAPI REST surface.
- **Custom routers** — 3 free on PAYG, more on Enterprise.
- **ZDR (zero data retention)** — custom policies on Enterprise.

**Architecture (inferred + stated):**
- Meta-classifier returns a model choice. The SDK then calls that model on the user's behalf or returns the recommendation for the user to call.
- **Operates client-side, not as a proxy** (Slashdot positioning, consistent with the SDK pattern).
- **One-shot route, no post-generation check.** Nothing in their public docs, blog, or pricing page describes scoring the output before shipping. The architecture is route → call → return.
- `notdiamond-0001` is a BERT-based binary classifier (GPT-3.5 vs GPT-4). The hosted product extends to many more models (see below).

**Supported models:** Broad. OpenAI (GPT-3.5 through GPT-5.5), Anthropic (Haiku 3-5 through Opus 4.7), Google (Gemini 2.0–3 preview, Gemma), Mistral, X.AI (Grok), Replicate, TogetherAI, Perplexity, Cohere, Minimax, DeepSeek, Qwen, Inception.

**Integrations:** OpenRouter (powers `openrouter/auto`), Eden AI, and the SDKs above. No first-class proxy-style integration with the Anthropic / OpenAI SDKs in the way Nadir's two-line drop-in works — ND's pattern requires their SDK.

**Notable differentiators:**
- Massive distribution win via OpenRouter `openrouter/auto`.
- IBM as both customer logo and investor.
- Prompt-optimization product (separate from routing) — they monetize a second surface area Nadir does not currently offer.
- Marquee logos: Dropbox, DoorDash, American Express, Replicated, Rootly.

## Pricing

**Pay-as-you-go (default public tier):**
- Intelligent Routing: 10,000 free routing recommendations / month, then **$10 per 10K additional recommendations**. Pre-trained chat router included. 3 free custom routers.
- Prompt Optimization: 10 free successful optimizations / month, then **$20 per additional successful optimization**. 4 target models per run.

**Custom (Enterprise):** Contact-sales. Adds agent optimization, bulk pricing, bring-your-own-models, custom evaluation metrics, priority queue, more routers, custom ZDR, 24/7 support.

**Other notes:**
- "Discounts for startups and researchers."
- Routing recommendation latency stated as **10–100ms** depending on custom-router data volume.
- No BYOK provider keys advertised on the public pricing page. (Their architecture is client-side SDK, so the user always brings their own provider keys by default — but it's not framed as a "BYOK" feature.)
- No flat base subscription on PAYG. Monetization is per-recommendation, not per-token or savings-percentage.
- Third-party comparison sites (Slashdot) list "$100/month" — treat as outdated; current site is PAYG.

## Customers & Social Proof

**Named logos (homepage):** OpenRouter, Hugging Face, Dropbox, IBM, Forethought, DoorDash, Tenor, Rootly, American Express, Covena, Replicated, Parakeet, GROQ, Eden AI, Baker.

**Testimonials (homepage):**
- Alex Atallah (CEO, OpenRouter) — "gives developers the ability to automatically use the best model"
- Grant Miller (CEO, Replicated) — "significantly reduced inference costs" and improved quality
- Sylvain Kalache (Head of AI Labs, Rootly) — "increased average accuracy by 39%, with some use cases more than doubling"

**Reviews:** Sparse. Slashdot lists 0 user ratings; OpenRouter has 1 by comparison. ND is not yet review-bait on G2 / Capterra at meaningful volume.

## Strengths & Weaknesses

### Strengths

1. **Distribution moat via OpenRouter `openrouter/auto`.** OpenRouter is the default LLM gateway for a huge chunk of indie devs. ND's classifier is the default behind `openrouter/auto`. That's organic distribution we can't match by selling harder.
2. **Real institutional backing and customer logos.** IBM as both investor and customer. Dropbox, DoorDash, American Express, Replicated, Rootly as named logos. Angel list includes Jeff Dean. Compares favorably to most early-stage routers.
3. **Published an open-source artifact early.** `notdiamond-0001` on HuggingFace under Apache 2.0 (BERT classifier) gave them a research-flavored launch in 2024. Even though downloads are low (15/mo), the artifact existed and was citable.

### Weaknesses

1. **One-shot routing with no post-generation verification.** Public materials describe a meta-classifier that picks a model. Nothing in docs / blog / pricing mentions scoring the output before shipping. When the classifier is wrong, the user eats the bad response. This is the architectural wedge for Nadir.
2. **Per-recommendation pricing scales poorly for high-volume agents.** $10 per 10K recommendations = $0.001/request. A coding agent making 10M routing decisions/month pays ND $1,000/mo on top of model spend. Nadir's $9 + savings-fee model aligns incentives with the customer's savings, not their request volume.
3. **No public benchmark JSON / paper / RouterBench head-to-head.** They cite "1.51x better than GPT-4 as a router" on their notdiamond-0001 blog with no methodology, eval set, or reproducibility artifact. They have no arxiv paper. The HF model card is a binary BERT classifier — the hosted product's architecture is closed. Nadir publishes specific evals on 11,420 RouterBench held-out triples with AUROC 0.961.

## Competitive Implications for Nadir

### Where Not Diamond is STRONGER than Nadir today

- **Distribution.** ND is shipped to millions of OpenRouter users via `openrouter/auto`. Nadir is not. This is the single biggest gap.
- **Customer logo book.** ND has IBM, Dropbox, DoorDash, American Express, Replicated publicly named. Nadir has no committed customer logos public yet (per `.agents/product-marketing-context.md`).
- **Brand and investor pedigree.** Jeff Dean, Ion Stoica, Julien Chaumond, IBM Ventures, Inovia, Defy. ND will be the name in the room when a CTO asks "who else have you considered."
- **Prompt optimization product line.** Adjacent revenue surface. Nadir does not offer this.
- **SOC-2 and ISO 27001 listed publicly.** Nadir mentions 99.9% uptime SLA but does not publicly list SOC-2 / ISO 27001. For enterprise procurement this matters.

### Where Nadir is STRONGER than Not Diamond today

- **Verify-before-ship architecture.** This is the wedge. From `.agents/product-marketing-context.md`: "Other routers are *predictive*: they guess which model will be best, then ship that model's answer no matter what. Nadir is *verified*: cheap answers are scored before they ship." ND's public materials confirm they route once and ship. They have no public mechanism for catching a wrong route at output time. When ND's classifier is wrong, the user pays in quality. When Nadir's classifier is wrong, the verifier catches it and escalates.
- **Published eval with citable artifact.** Nadir: 60% cost reduction, 98% of always-Opus quality preserved on 11,420 RouterBench held-out triples, verifier AUROC 0.961, ECE 0.016, eval JSON in-repo. ND: "1.51x better than GPT-4" with no eval link, no paper, no held-out set disclosed.
- **Drop-in proxy + OpenAI compatibility.** Nadir is a two-line change: swap base URL, set `model="auto"`. ND requires their SDK. For teams already running the OpenAI SDK against Anthropic / Google through LiteLLM or similar, Nadir is rip-and-replace; ND is an integration project.
- **Savings-aligned pricing.** Nadir charges $9/mo + 25% of first $2K saved / 10% above. If we save the customer nothing, they pay $9. ND charges per recommendation regardless of outcome. A high-volume agent customer pays ND linearly more as they scale; Nadir's variable fee is capped by the savings we actually deliver.
- **BYOK on every tier including Free.** Nadir's free tier supports BYOK explicitly. ND's free routing tier is capped at 10K recs/mo with no BYOK framing on the public page (architecture supports it via client-side SDK, but it's not marketed).
- **Iterative refinement before escalation.** Nadir refines the cheap response with a targeted second cheap-model pass before paying for Opus. Novel, not published elsewhere. ND has no equivalent.
- **Open-source self-host option (NadirClaw, MIT).** ND has `notdiamond-0001` on HF (Apache 2.0, binary classifier only). They do not offer a self-hostable full router. Nadir does.

### What evidence we need to credibly claim "Nadir beats Not Diamond"

1. **Direct RouterBench head-to-head.** Run `notdiamond-0001` (HF) on the same 11,420 RouterBench held-out triples Nadir is evaluated on. Publish a table with: cost, quality preservation, catastrophic-route rate, AUROC for each. Note: ND's HF model is GPT-3.5/GPT-4 binary — that's a methodological caveat we must acknowledge. The fair head-to-head is against their hosted classifier, which requires either their API or reverse-engineering. Honest framing: "open-artifact comparison" with the binary HF model, and "claimed-but-unverified comparison" against their hosted product.
2. **Production case study showing a verifier-caught miss.** A real customer prompt where the cheap-model answer would have been wrong, the verifier caught it, and we escalated. ND can't produce this because their architecture doesn't allow it.
3. **TCO calculator for high-volume customers.** Show a coding-agent workload making 1M / 10M / 100M routing decisions/month. Compare ND per-recommendation pricing vs. Nadir savings-fee pricing. Honest both ways: ND wins on light volume with no savings, Nadir wins on high volume.
4. **SOC-2 / ISO 27001 attestation public** to neutralize their procurement advantage.
5. **An OpenRouter alternative story** — content that captures "I'm using openrouter/auto but I want X" search intent. Currently anyone who wants better-than-openrouter/auto lands at ND by default.

### Specific quotes from their site we could cite when positioning against them

- "Choose the appropriate model faster than it takes to process a single token" (Slashdot quote of ND positioning) — confirms one-shot routing model. Use to reinforce "they route once, we verify."
- ND blog on notdiamond-0001: *"trained on hundreds of thousands of data points from robust, cross-domain evaluation benchmarks."* Doesn't name the benchmarks. Contrast: Nadir cites 11,420 RouterBench held-out triples with a specific eval JSON.
- ND blog claim: *"outperforms GPT-4 by a factor of 1.51x when used as a router."* No methodology link. Reasonable in-house copy to write: "Routers should publish evals, not multipliers."
- Pricing page: *"10–100ms depending on the amount of data used to train your router."* Nadir's pre-classifier overhead is "<10ms" published; verifier adds 180ms only when it runs (most requests skip it). For latency-sensitive customers, this is a teachable comparison.
- Their architecture quote: *"operates as a direct client-side tool rather than a proxy."* Use this in the "why a proxy is fine" section of Nadir's positioning. ND framed proxies as risky; we can answer: in-memory, BYOK, no prompt logging unless opted in.

### Tactical takeaways

- **Don't lead with cost when positioning against ND.** They also lead with cost (50%+ savings). Lead with quality preservation and verification. That's where they have nothing to say.
- **The phrase to own:** "Verify before ship." Three words. ND can't co-opt it without changing their architecture.
- **Where they win on procurement, we win on architecture.** When a buyer cares about compliance checkboxes more than routing quality, ND wins. When they care about not getting punished for a wrong route, we win. Sales-qualify accordingly.
- **OpenRouter is both a moat and a vulnerability for ND.** Their distribution depends on OpenRouter's continued use of `openrouter/auto`. If OpenRouter ever builds their own router or switches providers, ND loses a meaningful chunk of usage overnight.

---

## Raw Data Sources

All raw scrapes and notes saved under `competitor-profiles/raw/not-diamond/2026-05-27/`:

- `scrapes/homepage.md` — notdiamond.ai homepage
- `scrapes/pricing.md` — notdiamond.ai/pricing
- `scrapes/docs.md` — docs.notdiamond.ai (entry page + supported models)
- `scrapes/hf-model.md` — huggingface.co/notdiamond/notdiamond-0001 + companion blog post
- `scrapes/about.md` — notdiamond.ai/about
- `seo/search-notes.md` — funding, founders, third-party comparisons, press

External sources cited (full list in `seo/search-notes.md`):
- https://www.notdiamond.ai/ (homepage, pricing, about, blog/notdiamond-0001)
- https://docs.notdiamond.ai/
- https://huggingface.co/notdiamond/notdiamond-0001
- https://www.taiwannews.com.tw/news/5906945 (funding)
- https://www.ibm.com/think/insights/why-ibm-ventures-invested-in-not-diamond (investment thesis)
- https://venturebeat.com/ai/not-diamond-automatically-routes-your-query-to-the-best-llm (launch)
- https://slashdot.org/software/comparison/Not-Diamond-vs-OpenRouter/ (third-party comparison)
- https://www.crunchbase.com/organization/not-diamond
