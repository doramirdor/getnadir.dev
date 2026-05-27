# OpenRouter — Competitor Profile

*Profiled: 2026-05-27. Source: openrouter.ai pages + Series B announcement + analyst search.*

## At a Glance

| | |
|---|---|
| Company | OpenRouter, Inc. |
| Founded | 2023 |
| Founders | Alex Atallah (OpenSea co-founder / ex-CTO), Louis Vichy |
| HQ | San Francisco |
| Funding | $40M seed + Series A (June 2025, a16z / Menlo / Sequoia, ~$500M valuation). $113M Series B (May 2026, CapitalG-led, ~$1.3B valuation). Total raised ~$153M. |
| Investors | CapitalG (Alphabet), Andreessen Horowitz, Menlo, Sequoia, NVentures (Nvidia), ServiceNow Ventures, MongoDB, Snowflake, Databricks Ventures |
| Reported scale | 100T tokens/month, 25T tokens/week, 8M+ users, 250k+ apps, 400+ models, 60+ providers (homepage + Series B press) |
| Reported revenue proxy | $100M+ annualized inference spend (up from $10M late 2024) |
| Product category | LLM aggregator / unified API + model catalogue |
| URL | https://openrouter.ai |

## Positioning & Messaging

OpenRouter positions itself as **the unified interface for LLMs**, not as a router in the trained-classifier sense. The site headline is "The Unified Interface For LLMs / One API for Any Model." The supporting copy is "Better prices, better uptime, no subscriptions."

The product story is **catalogue + access + ranking**:
1. One API key, 400+ models, 60+ providers.
2. Distributed infrastructure with provider-level failover.
3. Public rankings of which models the developer ecosystem is actually using (weekly token volume by model).
4. Optional `openrouter/auto` meta-model for those who want the system to pick — and that pick is delegated to NotDiamond.

The brand is "the marketplace." Atallah's prior company was OpenSea, and the same shape applies: aggregate supply, expose a unified API, let the demand side discover. Their rankings page is the centerpiece of that positioning — they publish leaderboards by token volume, which makes the catalogue feel alive and competitive.

Notably absent from the messaging: any claim of a proprietary routing classifier, a quality-preservation benchmark, or a cost-reduction guarantee. They are not the routing brain. They are the access layer.

## Product & Features

**Core API**
- OpenAI-compatible endpoint at `https://openrouter.ai/api/v1/chat/completions`.
- Bearer-token auth.
- Slug-based model selection (`anthropic/claude-opus-4-7`, `openai/gpt-5.5`, etc.).
- `~`-prefixed "latest" aliases that resolve to the newest flagship.
- Streaming, tool calling, vision, audio supported across the catalogue.

**SDKs**
- OpenRouter TypeScript SDK (`@openrouter/sdk`)
- OpenRouter Python SDK (`openrouter`)
- Agent SDK (`@openrouter/agent`) — multi-turn loops, tool execution, `callModel` primitive
- OpenAI SDK works as drop-in replacement

**Auto Router (`openrouter/auto`)**
- "Powered by NotDiamond." OpenRouter does not own the routing logic — they integrate NotDiamond's meta-classifier.
- Curated pool: Claude Sonnet 4.5, Claude Opus 4.5, GPT-5.1, Gemini 3.1 Pro, DeepSeek 3.2, "other top performers."
- `cost_quality_tradeoff` knob (0–10, default 7).
- Wildcard model filters (`anthropic/*`, `openai/gpt-5*`).
- Zero additional fee. Pays the chosen model's rate.

**Provider routing**
- For any given model slug served by multiple providers, OpenRouter handles fallback automatically.
- Failed or fallback attempts are not billed.

**Other**
- Fusion (model mixing UI, surfaced in nav), Chat (consumer-style playground), Apps (showcases), Rankings (leaderboard by token volume), Enterprise (custom contracts).
- Custom data policies for per-org provider allow/deny.

## Pricing

| Tier | Cost | Notes |
|---|---|---|
| Free | $0 | 25+ free models across 4 providers. 50 requests/day. |
| Pay-as-You-Go | 5.5% platform fee on usage | 1M free requests/month before fees kick in. Credit card, crypto, bank transfer. No minimum. |
| Enterprise | Custom | 5M free requests/month, bulk discounts, SLA, SSO/SAML, dedicated support, regional routing. |

**Markup model.** The site says "pricing shown in the model catalog is what you pay which is exactly what you will see on provider's websites" — i.e., pass-through model rates with a 5–5.5% platform fee on top. BYOK requests are also subject to the 5% fee above thresholds. Streaming and non-streaming priced identically.

**Notable:** The Auto Router has no surcharge. Customers get NotDiamond routing essentially for free, bundled with the 5.5% platform fee.

## Customers & Social Proof

OpenRouter publishes more social proof than any other gateway in the category:

- **100T monthly tokens / 25T weekly tokens** — by far the largest aggregator publicly reporting.
- **8M+ global users.**
- **250k+ apps**, **4.2M+ end-users** across those apps.
- **Public rankings** with weekly token volume per model — itself a marketing flywheel. Featured weekly leaders (May 2026): Claude Opus 4.7 at 2.8T tokens, +65% w/w; GPT-5.5 at 508.7B tokens; Gemini 3.1 Pro Preview at 387.2B.
- Series B participants signal enterprise reach: CapitalG (Alphabet), NVentures (Nvidia), ServiceNow, MongoDB, Snowflake, Databricks all wrote checks at the same time.

No named customer logos are featured prominently on the homepage. The proof is the aggregate volume number, not individual brands. That is a deliberate marketplace move — the "millions of developers" story is the asset.

## Strengths

1. **Model breadth.** 400+ models, 60+ providers. Nobody is close on selection.
2. **Brand and mindshare.** The default answer to "where do I try a new model" for a meaningful share of developers. Rankings page is bookmarked widely.
3. **Distribution.** 1M+ developers have hit the API. 8M+ users. Scale moats compound.
4. **Funding and runway.** $153M raised at $1.3B post. Alphabet, Nvidia, and a16z on the cap table.
5. **Zero-effort onboarding.** One API key, OpenAI SDK compatible, no subscription gate, no commitment.
6. **Provider-level failover.** Same model from multiple providers, automatic fallback, you don't pay for failed attempts.
7. **No subscription friction.** 5.5% on usage feels less scary to procurement than a flat monthly fee.

## Weaknesses

1. **No proprietary routing intelligence.** Auto Router is third-party (NotDiamond). If NotDiamond is wrong, OpenRouter inherits the wrongness. They don't ship verification, calibration, or quality guarantees.
2. **No quality benchmark.** The site does not publish a routing-accuracy or quality-preservation number, because they don't own one to publish.
3. **Catalogue, not opinion.** The product asks the developer to choose. For teams who already know what to pick, that's fine. For teams who want the system to be opinionated about cost-quality trade-offs, OpenRouter routes the decision back to the human.
4. **5.5% platform fee on top of provider rates.** At scale, this is real money. A $200K/year Anthropic bill costs $11K/year extra to send through OpenRouter.
5. **Marketplace incentives misaligned with cost reduction.** Every token routed through OpenRouter pays them 5.5%. They are not structurally motivated to send you to the cheapest viable model — Nadir is.

## Competitive Implications for Nadir

The most important thing to land internally: **OpenRouter and Nadir are not competing on the same axis.** They look similar on the homepage (both are LLM gateways, both are OpenAI-compatible, both list models), but the product category is different.

| | OpenRouter | Nadir |
|---|---|---|
| Core value | Model breadth and access | Routing decision and cost-quality trade-off |
| Who picks the model | The developer (or NotDiamond, via Auto Router) | Nadir's trained pre-classifier + verifier |
| Catalogue size | 400+ models, 60+ providers | Curated cascade (Haiku-class / Sonnet-class / Opus-class) |
| Quality guarantee | None published | 98% of always-Opus quality preserved on 11,420 RouterBench held-out triples |
| Cost reduction claim | Implicit (cheaper providers via fallback) | 60% vs always-Opus, eval-cited |
| Pricing model | 5.5% on usage | $9/mo + 25%/10% savings fee (only pays on actual savings) |
| Verification | None | Verifier-gated cascade (AUROC 0.961) |
| Routing IP | Outsourced to NotDiamond | In-house |

**Where OpenRouter is stronger:**
- Model breadth (decisively)
- Brand recognition and developer mindshare (decisively)
- Request volume, scale, funding (decisively)
- Integration ecosystem (decisively)
- Time-to-first-token for "I want to try a model I don't have access to" (decisively)

**Where Nadir is stronger:**
- Actual routing decisions. OpenRouter delegates routing to NotDiamond or to the developer. Nadir owns the classifier and the verifier.
- Quality-preservation proof. We publish RouterBench held-out numbers; they publish token-volume numbers.
- Verifier-gated cascade. OpenRouter (and NotDiamond, the engine inside their Auto Router) routes once and ships. We verify the cheap answer before we ship it.
- Cost economics. The savings-fee model means Nadir only earns when the customer saves. OpenRouter earns on every token regardless of outcome.
- Per-request observability with `x-nadir-*` headers that show what was routed where and what was saved.

**Positioning recommendation.** Do not compete with OpenRouter on catalogue. We lose that fight. Compete by being explicitly different:

> "OpenRouter hands you 400 models. Nadir picks one and verifies the answer."

The comparison page (`/compare/openrouter`) should lead with that frame. The buyer who reads "I have to choose" walks to OpenRouter. The buyer who reads "I want my bill cut without changing anything" walks to Nadir.

**The NotDiamond wedge applies here too.** Nadir's strongest architectural differentiator vs NotDiamond — "they route once; we verify before we ship" — is also the differentiator vs OpenRouter's Auto Router, since the Auto Router is NotDiamond underneath. Same wedge, two competitors.

**OpenRouter as a channel, not just a competitor.** A real strategic possibility: Nadir could route through OpenRouter to access models we don't have direct provider contracts for. Long-tail models (DeepSeek, Mistral variants, regional providers) live on OpenRouter. We could plug them into our failover chain. That makes OpenRouter a supplier on the breadth axis while we own the routing-intelligence axis. Worth a strategic review before we set the comparison page tone — we don't want to torch a future integration partner with an aggressive vs-page.

**Counter-positioning checklist for landing pages and ads:**
- Lead with quality preservation, not catalogue size.
- Use the phrase "we pick, you save." OpenRouter cannot say this.
- Cite the verifier (AUROC 0.961, RouterBench held-out) in the same paragraph as the comparison. They have no equivalent number.
- Acknowledge breadth as a real OpenRouter strength — fighting it on the page makes us look defensive. "Use OpenRouter when you need 400 models. Use Nadir when you need your bill cut."
- Show the math: $200K Anthropic spend = $11K/year OpenRouter platform fee on every token vs Nadir's $9/mo + savings fee that only pays when we deliver.

**Where we will not win:**
- Brand recognition for the next 18+ months.
- Token volume on the homepage trophy.
- Any "biggest gateway" framing.

That is fine. We are not the biggest gateway. We are the router.

## Raw Data Sources

Scraped 2026-05-27:
- `competitor-profiles/raw/openrouter/2026-05-27/scrapes/homepage.md`
- `competitor-profiles/raw/openrouter/2026-05-27/scrapes/models.md`
- `competitor-profiles/raw/openrouter/2026-05-27/scrapes/pricing.md`
- `competitor-profiles/raw/openrouter/2026-05-27/scrapes/docs.md`
- `competitor-profiles/raw/openrouter/2026-05-27/seo/search-notes.md`

External:
- https://openrouter.ai/
- https://openrouter.ai/models
- https://openrouter.ai/pricing
- https://openrouter.ai/docs (+ quickstart, + auto-router guide)
- https://openrouter.ai/rankings
- https://siliconangle.com/2026/05/26/openrouter-raises-113m-bring-order-enterprise-ai-inference-routing/
- https://www.businesswire.com/news/home/20260526953416/en/OpenRouter-Raises-$113-Million-CapitalG-led-Series-B-as-Weekly-Volume-Explodes-to-25T-Tokens
- https://www.theblock.co/post/360093/opensea-co-founder-alex-atallah-raises-40-million-for-ai-startup-openrouter
- https://www.orrick.com/en/News/2025/06/AI-Inference-at-Scale-OpenRouter-Raises-Series-Seed-and-Series-A-Financing
- https://portkey.ai/alternatives/openrouter-alternatives
- https://www.pkgpulse.com/guides/portkey-vs-litellm-vs-openrouter-llm-gateway-2026
