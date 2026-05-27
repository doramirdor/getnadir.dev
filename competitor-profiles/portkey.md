# Portkey — Competitor Profile

**URL:** https://portkey.ai/
**Generated:** 2026-05-27
**Depth:** Quick-scan, positioning + pricing + competitive implications

---

## At a Glance

| Field | Value |
|---|---|
| Tagline | "Production Stack for Gen AI Builders" |
| Self-description | AI Gateway + Observability + Guardrails + Governance + Prompt Management |
| Founded | 2023 |
| Founders | Rohit Agarwal (CEO), Ayush Garg (CTO) |
| HQ | San Francisco, USA (engineering presence in India) |
| Team size | Reports range 13 to 45 (RocketReach trends toward 45 as of early 2026) |
| Total raised | ~$18M (Seed $3M Aug 2023 Lightspeed; Series A $15M Feb 2026 Elevation + Lightspeed) |
| YC? | No |
| Models supported | 1,600+ LLMs (their claim) |
| Customers claimed | 3,000+ GenAI teams |
| Scale claims | "$93M in LLM spend" routed in 2025; "2 billion requests" Aug 2024 |
| G2 rating | 4.8/5 |
| Pricing model | Per-recorded-log SaaS tiers + free OSS self-host |
| Stack | Cloud SaaS + open-source gateway (self-hosted option) |

---

## Positioning & Messaging

**Headline:** "Production Stack for Gen AI Builders"

**Subheadline:** "Everything they need to go to production - AI Gateway, Observability, Guardrails, Governance, and Prompt Management, all in one platform."

**Positioning angle:** Enterprise control plane for production AI. They lead with **breadth of platform**, not routing quality. The story is "stop juggling fragmented tools, get one governance layer."

**Key messaging themes:**
- Unified API to 1,600+ models, integrate "in just 3 lines of code"
- Observability is the hook ("real-time dashboard," logs, traces, feedback, alerts)
- Governance for enterprise (RBAC, SSO, budget/rate limits, PII redaction, SOC2/HIPAA/GDPR)
- Guardrails (PII, content checks, custom hooks)
- Prompt Management (templates, versioning, Playground, Prompt Engineering Studio)
- MCP Gateway for tool access (new January 2026)
- Agent-era language ("AgentOps," "agent gateway") — recent blog cadence is heavy on this

**Target audience:** Engineering and platform teams at companies large enough to need RBAC, SSO, and an audit trail. They are reaching upmarket. Bottom-up developer adoption via the free Developer tier and OSS self-host.

---

## Product & Features

### Gateway
- Unified API across 1,600+ providers
- **Conditional routing**: "Route to providers as per custom conditions"
- Load balancing across LLMs
- Automatic fallbacks, retries, timeouts
- Virtual keys (vault for provider keys, rotate / revoke / monitor)
- Simple + semantic caching

### Observability (their flagship)
- Logs, traces, feedback, alerts
- Cost monitoring and budget limits
- Latency distributions, error rates, cache hit rates
- Per-feature / user / model attribution

### Guardrails
- PII redaction
- Content checks
- Custom guardrail hooks on Enterprise

### Prompt Management
- Templates (3 on free Developer tier, unlimited on Production)
- Versioning, Playground
- Prompt Engineering Studio (March 2025 launch)

### Governance
- RBAC
- Budget and rate limits per key / user
- SSO (Enterprise)
- Activity logs
- SOC2 Type 2, GDPR, HIPAA compliance (Enterprise)
- Private cloud / VPC hosting (Enterprise)

### Recent launches
- **MCP Gateway** (Jan 2026) - governance for Model Context Protocol
- **Skills Registry** (Apr 2026) - reusable AI capabilities

### Routing IP - what they DON'T have
- **No trained classifier.** Routing is rule-based / conditional.
- **No verifier or post-generation quality scoring.** They never look at the output before shipping.
- **No cascade architecture.** Single-shot dispatch per request.
- **No published routing benchmark.** They have a blog post titled "LLM routing techniques for high-volume applications" but no eval, no AUROC, no quality-preservation metric.
- Their routing is "switch providers based on rules you write." This is gateway-class routing, not router-class routing.

---

## Pricing

| Tier | Price | Logs / Limits | Notes |
|---|---|---|---|
| **Open Source (self-host)** | Free | Unlimited | Universal API, retries, routing, guardrails, fallbacks, basic dashboard, load balancing, community support |
| **Developer** | Free forever | 10,000 recorded logs/mo | Observability, Universal API, prompt mgmt (3 templates), Playground. Logs beyond limit are dropped, requests still flow. 3-day log retention, 30-day metrics |
| **Production** | $49/month | 100k recorded logs/mo | Expanded observability, LLM guardrails, unlimited prompt templates, RBAC, caching. Overage $9 per additional 100k requests, up to 3M. 30-day log retention, 90-day metrics |
| **Enterprise** | Custom | 10M+ logs/mo | Custom guardrail hooks, advanced eval templates, SSO, granular budget/rate limits, private cloud, VPC, SOC2/GDPR/HIPAA, dedicated onboarding |

**Pricing model commentary:**
- Metered on **recorded logs**, not LLM token spend. They are an observability vendor first.
- No percentage-of-savings fee. No skin in the game on cost reduction.
- Entry price $49/mo is 5.4x Nadir's $9/mo flat. Different value prop, not directly comparable.

---

## Customers & Social Proof

**Logos on the homepage:**
Figg, Haptik, Qoala, Ario, Snorkel AI, RVO Health, Perficient, QA.tech

**Notable case-study claims:**
- **QA.tech** - managing 30M policies/month across 25 GenAI use cases
- **Ario** - "saved us thousands of dollars by caching"
- **Internet2** - "complete game changer" for dashboard insights
- **Snorkel AI** - replaced fragmented logging with one clean UI
- **RVO Health** - centralized prompt management at scale
- Unnamed **Fortune 500 pharma**

**Reviews:** G2 4.8/5. Praise centers on observability, easy integration, dashboard. Complaints: feature overwhelm, non-OpenAI provider translation bugs, UI rough edges.

**Independent positioning:** Multiple third-party comparison sites (PkgPulse, ToolHalla, Helicone, MindStudio, Braintrust) consistently classify Portkey as the **enterprise / production-grade** gateway, opposite OpenRouter (marketplace) and LiteLLM (self-host OSS).

---

## Strengths & Weaknesses

### Strengths
- **Observability depth.** This is their best feature and the reason customers stay. Logs, traces, cost attribution, dashboards are mature.
- **Governance / enterprise-readiness.** RBAC, SSO, budgets, SOC2/HIPAA/GDPR, VPC. They can sell to procurement.
- **Breadth.** Gateway + observability + guardrails + prompt mgmt + MCP gateway. One vendor for the whole production AI stack.
- **Customer base.** 3,000+ teams, $18M raised, named customers in pharma + edu + finance + AI. Significant social proof.
- **Open-source gateway** for teams who want to self-host the proxy.
- **Velocity.** Multiple blog posts per week, frequent product launches (MCP Gateway Jan 2026, Skills Registry Apr 2026, Prompt Studio Mar 2025).
- **G2 4.8/5** with consistent positive reviews on integration ease.

### Weaknesses
- **Routing is rule-based.** No trained classifier, no cascade, no verifier. Customers must write conditional rules themselves, or accept that "routing" mostly means fallbacks.
- **No published quality-preservation metric.** They cannot point to AUROC, RouterBench, or any held-out eval. Routing claims are unsupported by public benchmarks.
- **No skin in the game on cost.** Pricing is per-log. If your bill stays high, Portkey gets paid the same. Nadir's $9 + savings-fee model aligns incentives with the buyer.
- **Feature overwhelm** (per G2 reviewers). New users find the platform sprawling.
- **Non-OpenAI provider translation bugs** (per G2). The unified API leaks across providers in production.
- **No verifier IP.** The gap between "we tried to pick the right model" (Portkey) and "we picked, then we verified before shipping" (Nadir) is the architectural wedge.

---

## Competitive Implications for Nadir

### Where Portkey is STRONGER than Nadir today

1. **Observability depth.** Their dashboard, traces, cost attribution, and per-user/feature breakdowns are years ahead. Nadir ships per-request headers and a clean dashboard, but Portkey has the LLMOps surface area enterprise buyers expect.
2. **Governance and compliance.** SOC2 Type 2, HIPAA, GDPR, SSO, RBAC, VPC. Nadir has 99.9% SLA on Enterprise but is not yet at compliance parity.
3. **Integration count.** 1,600+ LLMs claimed vs Nadir's curated provider list.
4. **Prompt management.** Templates, versioning, Playground, Studio. Nadir does not play in prompt management.
5. **Guardrails.** PII redaction, content checks, custom hooks. Nadir does not ship guardrails.
6. **Customer base + funding.** 3,000+ teams, $18M raised, Series A closed Feb 2026. Brand recognition gap.
7. **Enterprise sales motion.** Their Enterprise tier and pricing-by-conversation matches how F500 buyers want to buy.

### Where Nadir is STRONGER

1. **Routing IP.** Nadir runs a verifier-gated cascade with a trained pre-classifier (AUROC 0.961 on 11,420 RouterBench held-out triples, ECE 0.016). Portkey runs **conditional rules**. This is the wedge.
2. **Quality preservation, measured.** Nadir cites "98% of always-Opus quality preserved at 60% cost reduction." Portkey publishes no quality metric. Buyers who care about regressions have no number to compare against on the Portkey side.
3. **Post-generation verification.** The cheap model answers, the verifier scores it, escalate only if it fails. Portkey ships whatever the rule routed to. When the rule is wrong, the user eats the bad response.
4. **Aligned pricing.** $9 base + 25%/10% of savings. If we save nothing, the customer pays $9. Portkey's $49/mo (and overages) flows whether or not the gateway reduces cost.
5. **Iterative refinement** before escalation. A targeted second cheap-model pass cuts borderline-case escalations. Not published by Portkey or anyone else.
6. **OCR closed loop** - continuous retraining of thresholds from live response quality.
7. **Two-line install** vs Portkey's "3 lines + virtual key setup + dashboard wiring." Time-to-first-routed-request is shorter on Nadir.
8. **Open-source core** (NadirClaw, MIT) - peer to Portkey's OSS gateway, but the closed Pro core is the trained classifier they don't have.

### What we should NOT try to compete with them on

- **Don't try to out-build their observability stack.** They have years of head start and a real LLMOps team. We ship per-request headers + a clean dashboard and tell the customer "if you want deep LLMOps, pair us with Helicone or Portkey on the side." Honest positioning is better than racing them on dashboards.
- **Don't try to match 1,600 integrations.** Curated provider coverage is fine. Match the providers our buyers actually use.
- **Don't try to match Prompt Management.** Not the wedge. Out of scope for the router-first product.
- **Don't try to match Governance for F500.** Until we have Enterprise customers asking for SSO + VPC, don't build it.
- **Don't try to outspend them on content.** They publish multi-times-per-week on AgentOps and governance. We publish less, but every piece cites a verifier-gated benchmark and shows a number.

### What we SHOULD compete with them on

- **Routing quality, measured.** "Portkey routes by rules you write. Nadir routes by a trained classifier and verifies the answer before ship. On 11,420 RouterBench held-out triples we preserve 98% of always-Opus quality at 60% cost reduction." Every comparison page leads with this.
- **Cost reduction with quality preservation.** Their case studies say "saved us thousands" without a methodology. Ours has an eval JSON and a held-out test set.
- **Aligned pricing.** "If we save you nothing, you pay $9. Portkey charges $49 plus overages whether or not your bill went down."
- **The verifier IP.** Build the comparison page around the architectural difference: predictive routers (Portkey, Not Diamond, Martian) absorb their mistakes. Verifier-gated routers (Nadir) recover from them.
- **Time-to-first-savings.** Two-line change, first routed request shows `x-nadir-cost-saved` header. Portkey gives you a dashboard, but you have to write rules to actually save anything.

### Quotes to cite when positioning

- "Production Stack for Gen AI Builders" - positions them as a platform, not a router. Use this to draw the line: platform breadth vs routing depth.
- "Route to providers as per custom conditions" - their own routing description. Cite this verbatim. It's the rule-based admission.
- "Dynamically switch between models, distribute workloads, and ensure failover with configurable rules" - emphasis on **configurable rules**. This is gateway routing, not classifier routing.
- "Integrate in just 3 lines of code" - we say "two lines."
- "Last platform you'll need in your AI stack" - they are pitching all-in-one. Our counter is "we do one thing - routing - better than anyone, and we play nicely with your existing observability stack."

### Battle-card one-liner

> Portkey is the **gateway**. Nadir is the **router**. They give you a control plane to write your own routing rules and observe the result. We pick the cheapest model that can answer your prompt, verify the answer before shipping, and back that with a 0.961 AUROC verifier on 11,420 RouterBench triples. If you need governance and an LLMOps dashboard, pick Portkey. If you need your bill cut by 60% without writing routing logic, pick Nadir.

---

## Raw Data Sources

- Homepage scrape: `competitor-profiles/raw/portkey/2026-05-27/scrapes/homepage.md`
- Pricing scrape: `competitor-profiles/raw/portkey/2026-05-27/scrapes/pricing.md`
- Product / AI Gateway scrape: `competitor-profiles/raw/portkey/2026-05-27/scrapes/product.md`
- Blog / release cadence scrape: `competitor-profiles/raw/portkey/2026-05-27/scrapes/blog.md`
- Search notes (funding, reviews, comparisons): `competitor-profiles/raw/portkey/2026-05-27/seo/search-notes.md`

**Primary URLs:**
- https://portkey.ai/
- https://portkey.ai/pricing
- https://portkey.ai/features/ai-gateway
- https://portkey.ai/blog
- https://portkey.ai/blog/series-a-funding/
- https://portkey.ai/blog/llm-routing-techniques-for-high-volume-applications/
- https://www.g2.com/products/portkey/reviews

**Third-party comparison sources:**
- https://www.pkgpulse.com/guides/portkey-vs-litellm-vs-openrouter-llm-gateway-2026
- https://toolhalla.ai/guides/openrouter-vs-litellm-vs-portkey-2026
- https://www.helicone.ai/blog/top-llm-gateways-comparison-2025
- https://www.braintrust.dev/articles/best-llm-gateways-2026
- https://www.artifilog.com/posts/best-ai-model-routers
- https://www.mindstudio.ai/blog/best-ai-model-routers-multi-provider-llm-cost
- https://tracxn.com/d/companies/portkey/

**Funding sources:**
- https://www.thesaasnews.com/news/portkey-raises-15-million-series-a
- https://entrackr.com/news/ai-apps-building-platform-portkey-raises-15-mn-in-series-a-led-by-elevation-11134623
- https://www.crunchbase.com/organization/portkey
