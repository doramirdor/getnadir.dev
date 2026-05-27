# Requesty — Competitor Profile

*Profiled 2026-05-27. Sources in raw/requesty/2026-05-27/.*

## At a Glance

| | |
|---|---|
| URL | https://www.requesty.ai/ |
| Category | LLM gateway / AI gateway |
| HQ | London, UK |
| Founded | 2023 |
| Founders | Leslie Nooteboom, Thibault Jaigu, Daniel Trugman (CTO) |
| Funding | $3M seed led by 20VC, 2024 |
| Tagline | "The AI Gateway for Production" |
| Positioning | "Cloudflare for AI" — GDPR-first alternative to OpenRouter |
| Free tier | Yes, ~$6 starter credits |
| Open source | No |
| Self-host | No |

Smaller and less well-known than OpenRouter and Portkey, but more visible than most. Closest peer to Nadir by size and stage. Press footprint is thin; most third-party content is comparison pages, not independent reviews.

## Positioning and Messaging

The marketing centers on three pillars:
1. **Catalogue breadth**: 400+ models, 23 providers (model catalogue says 493+).
2. **Enterprise governance**: 99.99% SLA, SOC 2 Type II, 5-layer policy engine, RBAC, audit logs, PII redaction, prompt-injection blocking, EU data residency.
3. **Reliability**: sub-20ms failover, multi-region (Frankfurt, Virginia, Singapore), PeakEWMA load balancing.

The wedge against OpenRouter is clear and stated: production-grade governance, European data residency, SOC 2 Type II. They are not selling routing intelligence as the headline.

"Intelligent routing" and "Smart Routing" appear as features, but on inspection the mechanism is not specified. Their own blog post on intelligent routing surveys the industry (rules, trained classifier, router-LLM) without claiming which one Requesty uses, and the only concrete example given is task-tagging (coding requests to Claude Sonnet). No trained classifier is claimed, no held-out eval is published, no routing-quality benchmark is cited.

**Conclusion: Requesty's routing is best characterized as task-detection plus rules plus PeakEWMA load balancing, not a trained classifier or verifier.** They reuse public model benchmarks (SWE-Bench, GPQA, AIME) on their models page rather than running their own routing eval.

## Product and Features

- OpenAI-compatible endpoint at `https://router.requesty.ai/v1`. Two-line switch.
- 493+ models across OpenAI, Anthropic, Google, Bedrock, Azure, xAI, Mistral, Meta, DeepSeek, Moonshot, Alibaba, Zhipu, MiniMax.
- Smart routing (task-detection style), latency-based routing, fallback chains, geo routing, load balancing.
- Semantic caching with claimed 37.2% hit rates; "up to 80%" on repeated prompts.
- PII redaction, prompt-injection blocking, model whitelisting.
- Audit logs, 5-layer policy engine, RBAC, budget caps per key.
- Real-time analytics: cost / latency / errors by user, model, project.
- MCP Gateway feature.
- BYOK on Pay-as-You-Go.
- Framework integrations: LangChain, Vercel AI SDK, LlamaIndex, Haystack, Pydantic AI, Anthropic SDK.
- No self-host. No open-source core. No published verifier or trained classifier. No quality benchmark.

## Pricing

| Tier | Price | Notes |
|---|---|---|
| Free | $0, ~$6 in credits | Per third-party comparisons |
| Pay as You Go | 5% markup on base model cost | "$10/M tokens → $10.50/M tokens." No subscription, no seat fees, no minimum |
| Enterprise | Custom | SSO, full RBAC, guardrails, PII, custom SLA, service accounts, custom model hosting |

Pure usage markup, no flat fee. Different shape from Nadir ($9 flat + savings fee).

## Customers and Social Proof

Logo wall on homepage: Shopify, Amadeus, Chargebee, Contentful, Pfizer, PWC, Capgemini, Sage, Siemens. Unclear which are production vs trial vs MSA-only. No named case studies surfaced. No public customer quotes located.

## Strengths and Weaknesses

**Strengths**
- Strongest enterprise compliance posture among peer-sized routers (SOC 2 Type II, GDPR, EU residency).
- Real multi-region infra and a published SLA — most peers do not have either.
- Clean OpenAI-compatible drop-in, modern docs, decent breadth of framework integrations.
- 5% markup is simple and easy to defend on procurement calls.
- Enterprise-looking logo wall (Shopify, Pfizer, Siemens) regardless of depth.
- Backed by 20VC, with a recognizable Cloudflare-for-AI narrative.

**Weaknesses**
- No trained classifier, no verifier, no published routing-quality eval. "Smart Routing" is a feature label, not a measured capability.
- No self-host, no open-source core. Procurement teams who want either are blocked.
- No public case studies — logo wall is unsupported by named deployments.
- Press footprint is thin. Almost all third-party coverage is SEO comparison pages.
- Pricing is markup-only; teams paying tens of thousands per month see no cost incentive (5% of a big bill is a big bill).

## Competitive Implications for Nadir

### Where Requesty is stronger or roughly equal
- **Enterprise compliance**. SOC 2 Type II, EU data residency, multi-region infra, 99.99% SLA. Nadir does not match this today. If we lose a deal to Requesty, the most likely reason is European procurement requiring data residency or SOC 2 Type II.
- **Catalogue breadth as marketing**. 493 models vs whatever Nadir lists. Nadir routes 3 to 6 frontier models well; Requesty leads with "everything."
- **Brand of "neutral infrastructure."** Cloudflare-for-AI is a clear story. Nadir's story is "we route smarter," which is harder to communicate at a glance.
- **Pure markup pricing is simpler to procure** than Nadir's $9 + savings fee for buyers who hate variable line items.

### Where Nadir is stronger
- **Verifier-gated cascade is the IP.** Requesty has no verifier. They route once based on task detection plus rules and ship the answer. When their router picks wrong, the user eats it. Nadir scores cheap answers before shipping (AUROC 0.961, ECE 0.016 on RouterBench held-out). This is the same wedge we have against Not Diamond and Martian, but Requesty does not even claim a trained classifier, so the gap is wider.
- **Eval and paper.** We have 60% cost reduction, 98% quality preserved on 11,420 RouterBench held-out triples, with a paper draft. Requesty cites third-party industry numbers ("40% reduction," "37 to 46% LLM usage cut") and public model benchmarks — none of their own routing.
- **Pre-classifier shortcut + iterative refinement.** Two architectural pieces Requesty does not have or claim.
- **Outcome-Conditioned Routing closed loop.** Continuous retraining from production signal. Requesty has analytics; we have a feedback loop.
- **Open-source core (NadirClaw, MIT).** Procurement teams allergic to closed-source SaaS have a self-host path with us. Requesty has none.
- **Pricing aligned with savings.** $9 flat + share of savings means if we save them nothing, they pay $9. Requesty's 5% markup is a tax regardless of whether routing helped.

### Recommendation

Requesty is the closest peer competitor by stage and size, so this is where positioning needs to be sharpest. The fight is **routing intelligence vs enterprise governance**:

1. **Lead with the verifier wedge.** "Other gateways pick a model and ship it. Nadir verifies the cheap answer before it ships." This frame beats both Requesty (task detection) and Not Diamond (one-shot classifier) without naming either.
2. **Force the eval conversation.** Publish the 11,420-triple RouterBench held-out result aggressively. Requesty has no equivalent number to put next to ours.
3. **Close the compliance gap on the roadmap.** If we want enterprise deals against Requesty, SOC 2 Type II and EU data residency need to be on a public roadmap page within Q3. Until then, we cede European enterprise.
4. **Use the open-source core as a procurement unlock.** NadirClaw lets us answer "can we self-host?" with yes. Requesty cannot.
5. **Comparison page: nadir.dev/vs/requesty.** Their /vs/openrouter page exists; ours should exist for them. Anchor it on verifier + eval + open-source.

## Raw Data Sources

- competitor-profiles/raw/requesty/2026-05-27/scrapes/homepage.md
- competitor-profiles/raw/requesty/2026-05-27/scrapes/pricing.md
- competitor-profiles/raw/requesty/2026-05-27/scrapes/docs.md
- competitor-profiles/raw/requesty/2026-05-27/scrapes/models.md
- competitor-profiles/raw/requesty/2026-05-27/seo/search-notes.md
- https://www.requesty.ai/, https://www.requesty.ai/pricing, https://docs.requesty.ai/, https://www.requesty.ai/models, https://www.requesty.ai/vs/openrouter
- https://www.requesty.ai/blog/intelligent-llm-routing-in-enterprise-ai-uptime-cost-efficiency-and-model
- https://www.requesty.ai/blog/requesty-raises-3m
- https://www.startuphub.ai/ai-news/funding-round/2025/requestys-llm-gateway-snags-3m-to-be-cloudflare-for-ai
- https://www.truefoundry.com/blog/requesty-vs-openrouter
- https://www.respan.ai/market-map/compare/openrouter-vs-requesty
- https://tracxn.com/d/companies/requesty/
