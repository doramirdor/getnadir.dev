# LiteLLM (BerriAI) - Competitor Profile

**URL:** https://litellm.ai
**Docs:** https://docs.litellm.ai
**Repo:** https://github.com/BerriAI/litellm
**Parent:** BerriAI (YC W23)
**Generated:** 2026-05-27
**Depth:** Quick-scan competitive profile

> **Important context for Nadir:** LiteLLM is an awkward competitor. The Nadir backend uses LiteLLM under the hood as the unified provider-API translation layer. We compete with **LiteLLM Cloud / LiteLLM Enterprise** on the hosted-proxy revenue line, not with LiteLLM-the-library. Positioning needs to reflect that.

---

## At a Glance

| Metric | Value |
|---|---|
| Tagline | "LLM Gateway (OpenAI Proxy) to manage authentication, loadbalancing, and spend tracking across 100+ LLMs" |
| Founded | 2023 |
| Founders | Krrish Dholakia, Ishaan Jaffer |
| HQ | San Francisco |
| Headcount | ~10 (per YC profile) |
| YC Batch | W23 (Winter 2023) |
| Investors | Y Combinator, FoundersX Ventures, Gravity Fund, Pioneer Fund, Ripple Impact Investments |
| Series A | Not announced publicly as of 2026-05-27 |
| License (OSS) | MIT (with commercial Enterprise license) |
| GitHub stars | 48.4k |
| Forks | 8.4k |
| Dependents (used by) | 21.4k |
| Contributors | 1,000+ |
| Latest release | v1.85.2 (May 27, 2026) |
| Docker pulls | 240M+ (self-reported) |
| Requests served | 1B+ (self-reported) |
| Customers (public) | Netflix, Stripe, Adobe, Lemonade, Rocket Money, Samsara, Twilio, Siemens, NASA, Greptile, OpenHands |
| Embedded into | Google ADK, OpenAI Agents SDK |
| Performance claim | 8 ms P95 latency at 1k RPS |

---

## Positioning & Messaging

**Headline:** "LiteLLM - LLM Gateway (OpenAI Proxy) to manage authentication, loadbalancing, and spend tracking across 100+ LLMs. All in the OpenAI format."

**Positioning angle:** Developer-mindshare-first, open-source-first. The default provider abstraction for the Python LLM ecosystem. Sells the cloud / enterprise tier on top of a free OSS core that has already won the integration battle.

**Key messaging themes:**
- "Call 100+ LLMs in the OpenAI format" - the integration-count moat
- "Day 0 LLM access" (Netflix testimonial) - new models work the day they ship
- Two deployment modes: Python SDK (in-process) and Proxy Server (centralized gateway)
- Spend tracking, virtual keys, team/org admin, budgets, rate limits, guardrails - enterprise gateway features
- Observability via callbacks (Langfuse, Helicone, Langsmith, MLflow, Arize, OTEL)
- "8 ms P95 at 1k RPS" - performance for high-throughput deployments

**Target audience:**
- Primary: Platform / ML platform teams that need to centralize LLM access across many developers and many providers
- Secondary: Individual developers using the SDK to write multi-provider code without rewriting client libraries

---

## Product & Features

### Two deployment shapes

1. **LiteLLM Python SDK** - `pip install litellm`. Direct library in your app. OpenAI-format request, calls 100+ providers under the hood. Application-level fallbacks, load balancing, cost tracking.

2. **LiteLLM Proxy Server** - Centralized AI Gateway. OpenAI-compatible HTTP endpoint. Multi-tenant: virtual keys per developer / team / org, per-key budgets and rate limits, audit logs, admin dashboard, callback hooks for observability.

3. **LiteLLM Cloud** - Hosted version of the proxy. SaaS deployment.

4. **LiteLLM Enterprise** - SSO, SCIM, OIDC/JWT auth, 24/7 support, SLAs, key/team guardrails, secret managers, key rotations, dedicated upgrade assistance. Available SaaS or self-hosted.

### Routing (relevant to Nadir)

LiteLLM's "router" is historically a **load balancer over a model list**, not an intelligent classifier. Strategies:
- `usage-based-routing` (lowest TPM/RPM)
- `least-busy`
- `latency-based-routing`
- `simple-shuffle`
- weighted distribution
- Fallback chains (on failure, move to next model group)

**New (2025-2026) routing additions:**

- **`auto_router`** (embedding-based semantic router). Generates an embedding for the input, compares to per-route example "utterances," routes when cosine similarity > threshold. ~100-500 ms overhead due to the embedding API call. Hand-authored utterance lists, not a trained tier classifier.

- **`complexity_router`** (rule-based weighted scoring). Sub-millisecond, no external calls. Hand-tuned rules that score complexity dimensions.

Both ship as configuration. Neither is a model trained on labeled cost / quality data. Neither verifies the cheap-model output before shipping.

### Endpoints supported
`/chat/completions`, `/embeddings`, `/images`, `/audio`, `/batches`, `/rerank`, `/messages` - across OpenAI, Anthropic, Bedrock, Azure, Vertex AI, Cohere, HuggingFace, NVIDIA NIM, xAI, OpenRouter, and dozens more.

### Other notable features
- MCP (Model Context Protocol) tool integration
- A2A agent support (LangGraph, Vertex AI, Azure AI, Bedrock, Pydantic AI)
- Prompt caching passthrough
- LLM Guardrails
- Docker images with cosign-verified signatures

---

## Pricing

LiteLLM does not publish dollar amounts on litellm.ai/enterprise. Pricing surfaced via third-party analysis (TrueFoundry blog, AWS Marketplace).

| Tier | Price | What's included |
|---|---|---|
| Open Source | Free | Full SDK + proxy, 100+ providers, virtual keys, spend tracking, load balancing, fallbacks |
| **Enterprise Basic** | **$250 / month** | Prometheus metrics, custom callbacks, LLM guardrails, JWT auth, SSO (Okta, Azure AD), audit logs |
| **Enterprise Premium** | **$30,000 / year (~$2,500 / mo)** | Priority SLA support, dedicated account management, custom feature development, SOC2 / HIPAA compliance assistance |

CTA on the enterprise page: "Request 30-day trial key" and "Contact Sales." Also available via AWS Marketplace as a private offer.

**Pricing relative to Nadir:** LiteLLM Enterprise Basic ($250/mo) is the closest comparable to Nadir Pro ($9/mo flat + savings fee), but it's a different value proposition: LiteLLM Enterprise sells **gateway controls** (SSO, audit, JWT), Nadir Pro sells **routing intelligence + savings**. A team paying $250/mo for LiteLLM Enterprise can still be a Nadir Pro customer.

---

## Customers & Social Proof

**Public customer logos** (from homepage, GitHub README, and third-party press):
- Netflix (with named testimonial about Day-0 model access)
- Stripe
- Adobe
- Lemonade
- Rocket Money
- Samsara
- Twilio
- Siemens
- NASA (per third-party claim)
- Greptile
- OpenHands

**Framework embeddings (high-leverage):**
- Google ADK (Agent Development Kit) uses LiteLLM as its provider layer
- OpenAI Agents SDK uses LiteLLM as its provider layer

These framework embeddings mean LiteLLM-the-library is already running inside a large fraction of agent applications, even when teams don't know they're using it. This is the developer-mindshare moat.

**OSS scale:**
- 48.4k GitHub stars (top tier in the LLM tooling category)
- 21.4k dependents
- 1,000+ contributors
- 240M+ Docker pulls
- v1.85.2 (release pace is roughly multiple minor releases per week)

---

## Strengths & Weaknesses

### Strengths

1. **Default integration layer for the Python LLM ecosystem.** 48.4k stars, 21.4k dependents, embedded into Google ADK and OpenAI Agents SDK. Switching cost is "rewrite our provider plumbing." Most teams don't.
2. **100+ providers, OpenAI-compatible from day one.** New models work on release day. Netflix's "Day 0" framing is the cleanest articulation.
3. **Real enterprise customers.** Adobe, Stripe, Netflix, NASA. Logo strength Nadir does not have yet.
4. **Open source-first, commercial-second.** Lowers buyer anxiety. Self-host the OSS, upgrade to Enterprise when you need SSO/SLAs.
5. **Active development.** ~weekly releases, 1,000+ contributors, responsive to provider API changes.
6. **Gateway feature set is broad.** Spend tracking, budgets, virtual keys, guardrails, observability callbacks, MCP tools, agent framework support.

### Weaknesses

1. **No trained routing classifier.** "Router" = load balancer + rules + (new) embedding-utterance matcher. No tier classifier trained on a labeled cost/quality dataset. No published RouterBench (or equivalent) numbers.
2. **No verifier-gated cascade.** Cheap-model outputs are not scored before shipping. If the (new) auto-router picks wrong, the user eats the bad answer. Same wedge that applies to Not Diamond / Martian.
3. **No cost-saving claim with a citation.** No "X% lower bill vs always-Opus" with an eval JSON behind it. They sell *control*, not *savings*.
4. **Enterprise pricing surface is opaque.** Dollar amounts only surface through third parties. This works for top-down sales, less well for bottoms-up adoption against a transparent competitor.
5. **Operating the proxy is your problem.** If you self-host the OSS, you carry HA, scaling, upgrades, secret rotation. The cloud/enterprise tier exists precisely because of this.

---

## Competitive Implications for Nadir

This is the section that matters. LiteLLM's relationship to Nadir is layered and the positioning has to respect it.

### The awkward truth

Nadir's backend uses LiteLLM as the unified provider-API layer (`backend/requirements.txt`, `app/services/`). LiteLLM-the-library handles the OpenAI / Anthropic / Bedrock / Vertex translation work for us. We do **not** want to position Nadir against LiteLLM-the-library. Doing so would be both technically incoherent (we depend on them) and strategically wrong (the LiteLLM OSS crowd is the same audience we're courting).

### Where LiteLLM Cloud / Enterprise is stronger than Nadir

- **Developer mindshare:** 48.4k stars vs Nadir's much smaller GitHub footprint. The OSS-first crowd recognizes LiteLLM by name.
- **Integration count:** 100+ providers documented. Nadir focuses on the providers our customers actually use, not breadth.
- **Customer logos:** Adobe, Netflix, Stripe, NASA. Nadir has aspirational ICPs, not committed logos yet.
- **Framework embeddings:** Inside Google ADK and OpenAI Agents SDK. Nadir is not embedded in either.
- **Enterprise muscle:** SSO, SCIM, OIDC, audit logs, SOC2/HIPAA support paths. Nadir Enterprise tier covers SSO/SLA, but the proof points are lighter.
- **Brand among platform engineers:** Three years of head start.

### Where Nadir is stronger than LiteLLM Cloud / Enterprise

- **Routing brain.** LiteLLM's `auto_router` is embedding-utterance matching with hand-authored examples. The `complexity_router` is rule-based scoring. Neither is a model trained on a labeled cost/quality eval. Nadir ships a trained pre-classifier (wide_deep_asym_v3) plus a calibrated verifier (AUROC 0.961 on 11,420 RouterBench held-out triples) gating the cascade.
- **Verifier-gated cascade.** Nadir scores the cheap-model output before shipping it. LiteLLM doesn't. When the LiteLLM router is wrong, the customer eats the bad answer. When Nadir's pre-classifier is wrong, the verifier catches it and escalates.
- **Cost claim with a citation.** "60% cost reduction with 98% of always-Opus quality preserved on 11,420 RouterBench held-out triples." LiteLLM has no equivalent published number.
- **Savings-aligned pricing.** $9 flat + 25% on the first $2K saved, 10% above. If we don't save the customer money, they pay $9. LiteLLM's $250/mo flat doesn't scale with the value delivered.
- **OCR closed loop.** Outcome-Conditioned Routing retrains thresholds from live response-quality signal. LiteLLM has no analogue.
- **Free tier with BYOK on every plan.** Friction-free adoption.

### Strategic positioning (do this; avoid that)

**Do:**
- Pitch Nadir as **"the routing intelligence on top of any gateway, including LiteLLM-the-library."** Acknowledge the dependency. Treat it as a feature.
- When asked about LiteLLM, say: "Different category. They're a gateway with a load balancer. Nadir adds the routing brain. We use their provider layer internally."
- Compete with LiteLLM Cloud / Enterprise on the **hosted-proxy revenue line**, not on integration count or community.
- For platform teams already running LiteLLM Proxy in-house: position Nadir as a complement that adds the trained classifier + verifier in front of their existing LiteLLM model list. They keep their gateway. We add the routing intelligence.

**Don't:**
- Don't attack LiteLLM. The OSS audience overlaps heavily with our buyer audience. Bashing the most-loved tool in the category loses the room.
- Don't claim "more providers than LiteLLM." We won't, and it's not the wedge.
- Don't put LiteLLM in a head-to-head feature matrix that frames them as the worse choice. Frame them as the layer below.
- Don't fight on developer mindshare. We won't catch them on stars. Compete on routing science.

### Where the head-to-head actually happens

Where Nadir wins:
- Buyer cares about **bill reduction** with a defensible eval, not just gateway controls.
- Buyer wants **quality floor / verification**, not blind routing.
- Buyer wants **savings-aligned pricing**, not flat-fee enterprise.
- Buyer is mid-market / startup, where $250/mo + ops burden is non-trivial.

Where LiteLLM Cloud / Enterprise wins:
- Buyer's procurement requires SOC2 / HIPAA paperwork and named enterprise logos in the references list.
- Buyer needs to centralize **gateway controls** (SSO, virtual keys, audit, budgets) more than they need routing intelligence.
- Buyer is platform team at a large org already standardized on LiteLLM Proxy.

---

## Raw Data Sources

- Homepage: `competitor-profiles/raw/litellm/2026-05-27/scrapes/homepage.md`
- Docs: `competitor-profiles/raw/litellm/2026-05-27/scrapes/docs.md`
- Enterprise page: `competitor-profiles/raw/litellm/2026-05-27/scrapes/enterprise.md`
- GitHub README: `competitor-profiles/raw/litellm/2026-05-27/scrapes/github.md`
- Search notes (funding, pricing, customers, routing): `competitor-profiles/raw/litellm/2026-05-27/seo/search-notes.md`

External:
- https://litellm.ai
- https://docs.litellm.ai
- https://github.com/BerriAI/litellm
- https://www.litellm.ai/enterprise
- https://www.ycombinator.com/companies/litellm
- https://docs.litellm.ai/docs/proxy/auto_routing
- https://www.truefoundry.com/blog/litellm-pricing-guide
