# Product Marketing Context

*Last updated: 2026-05-26*
*Auto-drafted from BRAND_VOICE.md, llms.txt, README.md, and the live homepage components in `app/src/components/homepage/`. Review and correct sections marked TBD.*

## Product Overview

**One-liner:** Nadir routes every prompt to the cheapest Anthropic model that can handle it.

**What it does:** A trained classifier reads each prompt in under 10 ms and picks the cheapest model that can answer it well. Haiku for classifications, Sonnet for refactors, Opus only when the prompt actually needs to think. OpenAI compatible — change two lines (base URL + `model="auto"`) and your bill drops.

**Product category:** LLM gateway / AI router. Customers compare us against OpenRouter, Requesty, Portkey, LiteLLM, Not Diamond, and homegrown routers.

**Product type:** Hosted SaaS (api.getnadir.com) with an optional self-hosted open-source core (NadirClaw, MIT). Multi-tenant Postgres via Supabase. Stripe billing.

**Business model:**
- **Free:** $0/forever. Hosted proxy, 50 requests/mo on our keys, unlimited with BYOK, full dashboard.
- **Pro:** $9/mo flat + variable savings fee — 25% on the first $2K saved, 10% above. If we save you nothing, you pay $9. First month free with code `FIRST1`.
- **Enterprise:** Custom volume pricing, 99.9% SLA, SSO/SAML, dedicated infra, solutions engineer.
- **NadirClaw (open source):** MIT, self-hosted, free.

## Target Audience

**Target companies:** Engineering-led teams running production LLM workloads. Startups through mid-market. Anyone with a five-figure-and-up Anthropic / OpenAI / Google bill.

**Decision-makers:** Engineering leads, staff/senior engineers, founder-engineers. They own the bill. They read the code block before the headline.

**Secondary audience:** ML platform teams and data platform teams considering building their own gateway.

**Primary use case:** Cut LLM API spend without changing application code or sacrificing quality on prompts that actually need a frontier model.

**Jobs to be done:**
- Stop paying Opus rates for Haiku-class work
- Get per-request cost and latency observability without instrumenting the app
- Survive provider outages without paging on-call

**Use cases / scenarios:**
- AI-native SaaS routing classification, summarization, and Q&A traffic
- Coding tools (Claude Code, Cursor, Aider, Codex, Windsurf, Continue) where most requests are simple but a few need Opus
- Agent frameworks (LangChain, OpenAI SDK) routing mixed-difficulty steps
- Internal RAG / support / sentiment workloads where Haiku is enough 80%+ of the time

## Target Accounts (Aspirational ICPs)

*Archetype targets, not committed customers or pipeline. Used as anchor logos for marketing, sales-research seed lists, and ICP fit checks. Rough qualifier: teams paying $5K/mo+ to Anthropic, OpenAI, or Google. Names below are public companies in the archetype, not endorsements or active conversations.*

| Archetype | Why they fit | Example targets |
|---|---|---|
| **AI coding tools** | Mixed-complexity LLM calls. Most requests are autocomplete or syntax-level (Haiku-class). A minority need Opus or o1-class reasoning. Margin compression hurts as token volume scales. | Cursor, Replit Agent, Continue, Aider, Windsurf, Tabnine, Bolt.new, V0, Lovable, Cody (Sourcegraph), Codeium |
| **AI-native SaaS (LLM is the product)** | LLM cost is the second line on the AWS invoice. Engineering owns the bill. Mixed workloads: extraction, classification, Q&A, summarization. | Decagon, Sierra, Harvey-tier legal AI, Jasper, Copy.ai, Writer, Glean, Otter.ai, Fireflies, Reka-powered products |
| **Agent and workflow platforms** | Multi-step chains compound spend. Per-step model choice is brittle today. Most have already considered building a router. | CrewAI, n8n (AI workflows), Lindy, Relevance AI, Imbue, AutoGen-based startups, LangChain Inc customers running production agents |
| **Series A/B SaaS adding AI features** | Established product with a growing LLM line item, engineering team that can own the infra change. AI is a feature, not the whole product. | Notion-tier productivity SaaS post-AI features, Linear-tier, Intercom (Fin), Pendo, Mixpanel with AI, Ramp, Brex |
| **Vertical AI startups** | Domain-specific prompts vary widely. Some need frontier models, most don't. Margin is the entire business. | Medical scribe (Abridge-tier, Nabla, Suki), legal AI (Spellbook-tier), financial research AI, recruiting AI (Mercor-adjacent), sales agents (Apollo AI features) |
| **Mid-market with internal AI builds** | Built internal Anthropic / OpenAI integrations for support, sales, or product. The bill is growing faster than headcount. | Tier-2 retail, banking, insurance, and ops platforms with public AI initiatives |

**Anchor logos for marketing once landed (priority order):**
1. A named AI coding tool. Highest social proof inside our audience.
2. A series A/B AI-native SaaS with a public engineering team.
3. A vertical AI startup with a recognizable name.
4. An agent platform that uses Nadir at scale.

**Qualification heuristics (use to triage inbound and outbound):**
- Paying $5K/mo+ to Anthropic, OpenAI, or Google (rough floor)
- Engineering-owned routing decision (not procurement-led)
- Mixed-complexity prompt distribution (not single-Opus or single-Haiku workloads)
- BYOK acceptable to security review
- Public footprint or active engineering blog (so the logo carries weight when landed)

## Personas

| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Founder-engineer (User + Decision Maker) | Burn rate, shipping velocity | Anthropic bill is the second line on the AWS invoice. Can't justify time to build a router. | Two-line change, save 47% by tomorrow, no refactor |
| Staff engineer (Champion + Technical Influencer) | Latency, reliability, control | Has tried OpenRouter or hand-rolled fallbacks. Wants quality floor, BYOK, observability. | Under 10 ms overhead, BYOK, per-request headers, A/B route in production |
| Eng lead / VP Eng (Decision Maker + Financial Buyer) | Predictable spend, on-call load | Spend is volatile. Provider outages page the team. Quality regressions are expensive. | Flat $9 base + savings fee, 99.9% SLA on Enterprise, automatic failover |
| Platform team (Anti-buyer risk) | Owning the routing layer in-house | "We could build this." | Maintained classifier retrained weekly, OCR closed loop, semantic cache, context optimization — months of work, shipped |

## Problems & Pain Points

**Core problem:** Teams pay Opus / GPT-4 / Gemini Pro prices for prompts that Haiku could answer correctly. A meaningful share of production traffic is classification, formatting, summarization, or simple Q&A — but routing logic is hand-rolled, brittle, or skipped, so everything goes to the premium model.

**Why alternatives fall short:**
- **OpenRouter / Requesty / Portkey:** Hand you a model catalogue and a fallback. You still pick the model. No trained classifier, no routing decision.
- **DIY router:** Months of classifier work, eval set maintenance, drift handling. Not core to the product.
- **Pin-one-model:** Either overpaying on simple prompts (Opus everywhere) or eating quality drops on hard ones (Haiku everywhere).
- **Manual rules / regex routers:** Brittle. Drifts the moment prompt distribution shifts.

**What it costs them:**
- 30 to 70% of LLM spend on prompts that did not need the premium model
- Engineering time spent on routing logic instead of product
- On-call pages when a provider has an outage and there is no failover

**Emotional tension:** The bill is bigger than it should be, and the team knows it. Building the router internally feels like yak-shaving. Buying one feels like giving up control.

## Competitive Landscape

**Direct (LLM gateways):**
- **OpenRouter** — Catalogue of models, BYOK, no trained routing. You still choose.
- **Requesty** — Manual model selection with rules. No classifier.
- **Portkey** — Strong observability, rules-based routing, no trained classifier.
- **LiteLLM** — Open-source SDK, you run it. Routing is rules-based.
- **Not Diamond** — Closer to Nadir on routing claims. We compete on observability, BYOK economics, OCR closed loop, and price.

**Secondary (different solution, same problem):**
- Hand-rolled internal routers and prompt classifiers
- Pin-one-cheaper-model strategies (always-Haiku) with manual escalation
- Prompt caching alone (Anthropic native) — helps repeated prompts, does not cut model selection cost

**Indirect (conflicting approach):**
- "Just use Opus for everything" — overspend on purpose for simplicity
- Provider-native routing (e.g., always go through one vendor) — locks in pricing, no failover

**How they fall short for customers:** Other gateways list models. Nadir picks one. Nobody else ships a trained classifier + outcome-conditioned routing + semantic cache + context optimization in one drop-in proxy.

## Differentiation

**Key differentiators:**
- Trained classifier with 96% agreement on the public 50-prompt eval, retrained weekly
- Outcome-Conditioned Routing (OCR) — closed-loop algorithm that adjusts per-tier thresholds from live response quality. Nobody else ships this.
- Semantic cache on by default (cheapest token is the one you never send)
- Context optimization (cuts input tokens 30 to 70% on long prompts)
- Per-request response headers (`x-nadir-routed-to`, `x-nadir-cost-usd`, `x-nadir-cost-saved`, `x-nadir-latency-ms`, `x-nadir-cached`)
- BYOK on every tier including Free
- Open-source self-host option (NadirClaw, MIT) for teams that want to run it themselves

**How we do it differently:** A trained model picks the destination, not a rules engine. The router adapts as model quality drifts. The proxy is in-memory, prompts are not logged unless the user opts in.

**Why that's better:** Less configuration, better routing decisions, lower spend, higher reliability, cleaner privacy story.

**Why customers choose us:** "Stop configuring. The router decides." Two-line change, savings visible on the next request, no refactor, no SDK swap.

## Objections

| Objection | Response |
|-----------|----------|
| "Will the cheaper model give worse answers?" | You set a quality floor per API key. Simple prompts route to Haiku-class models. Anything above your threshold routes to your configured premium model. On our 50-prompt eval, 0% catastrophic routes at λ=20. |
| "I don't want a vendor between me and Anthropic." | Proxy runs in memory, BYOK on every tier, OpenAI compatible (rip and replace in two lines). Self-host the open-source core (NadirClaw, MIT) if you prefer. |
| "Adds latency." | Classifier overhead is under 10 ms per request. Faster than your DNS lookup. |
| "We can build this ourselves." | Sure — the trained classifier, OCR closed loop, semantic cache, context optimization, retraining pipeline, and per-request observability are months of work. $9/mo gets you the maintained version today. |
| "Are my prompts logged?" | Only if you turn logging on. With BYOK and logging off, we never see plaintext. Just headers and token counts. |
| "What if Anthropic goes down?" | Nadir retries against your configured chain (OpenAI, Google, etc.). Your app stays up. |

**Anti-persona:** Single-prompt-type workloads where every request needs Opus (deep reasoning, long-form research). Compliance regimes where any third-party proxy is disqualified, even in-memory and BYOK. Teams already deeply invested in a homegrown router that exactly fits their model mix.

## Switching Dynamics

**Push (frustrations driving them away from current setup):**
- Anthropic / OpenAI bill keeps climbing as traffic grows
- A provider outage paged the team last quarter
- Engineering time spent on routing logic instead of product
- Existing rules-based router is drifting as prompt distribution shifts

**Pull (what attracts them to Nadir):**
- Two-line change, savings visible on the next request
- Per-request headers and dashboard, zero instrumentation
- BYOK and free tier — try it without a card
- Trained classifier and OCR closed loop — they don't have to maintain it

**Habit (what keeps them on the current approach):**
- Already wrote a fallback layer
- Familiar with one provider's SDK, do not want to add a hop
- "It is working, why change it"

**Anxiety (what worries them about switching):**
- A new failure mode in the routing layer
- Quality regressions on production traffic
- Vendor lock-in to another gateway
- Privacy of prompts in transit
- Latency hit
- "What if the savings claim does not hold for our workload?"

## Customer Language

**How they describe the problem:**
- "Our Anthropic bill is out of control."
- "We are paying Opus rates for stuff that is basically classification."
- "I keep meaning to write a router, never get to it."
- "When Anthropic went down last month we were down too."
- TBD: capture more verbatim quotes from sales calls and support transcripts

**How they describe Nadir:**
- "It just picks the cheapest model that can do the job."
- "Two-line change."
- "Drop-in for the OpenAI SDK."
- TBD: capture more verbatim from existing customers

**Words to use:** route, routing, the cheapest model that can handle it, base URL, `model="auto"`, BYOK, classifier, quality floor, failover, proxy, semantic cache, OCR (Outcome-Conditioned Routing), under 10 ms.

**Words to avoid (per BRAND_VOICE.md):**
- Em dashes — use commas, periods, separate sentences
- Superlatives without proof: "best," "fastest," "only," "world-class," "unmatched"
- Vague benefits: "powerful," "robust," "seamless," "cutting-edge," "revolutionary"
- Fake urgency: "limited time," "act now," countdown timers, "don't miss out"
- Corporate filler: "excited to announce," "empower," "unlock," "next-generation"
- Condescension: "easy," "simple"
- Emoji in product marketing (social only)

**Glossary:**
| Term | Meaning |
|------|---------|
| Nadir | The product. Always capitalized. |
| NadirClaw | The open-source self-hosted core (MIT). |
| Router / routing | The product verb — never "redirect" or "forward." |
| `model="auto"` | The signal that triggers Nadir's classifier. |
| BYOK | Bring your own keys. Spell out on first use, BYOK after. |
| OCR | Outcome-Conditioned Routing. Closed-loop algorithm that adjusts per-tier thresholds from live response quality. |
| Quality floor | Per-API-key threshold below which prompts get the premium model. |
| Classifier overhead | Time the trained classifier adds per request (under 10 ms). |
| Semantic cache | Returns near-identical prompts from cache. |
| Failover chain | Configured ordered list of providers Nadir retries against. |
| Haiku / Sonnet / Opus | Anthropic model names. Capitalized. |
| OpenAI compatible | No hyphen. |
| base URL | Two words in prose. |
| Hosted keys | Nadir-managed provider keys (alternative to BYOK on Pro+). |

## Brand Voice

**Tone:** Direct, confident, technically literate, calm. A senior infra engineer who ships, talking to other builders.

**Style:** Short declarative sentences. Active voice. Verbs up front. Specifics over adjectives. Honest about the shape of the proof ("our 50-prompt benchmark," "sample of six prompts").

**Personality (5 adjectives):** Direct. Confident-not-boastful. Technical. Calm. Honest.

**Style rules (from BRAND_VOICE.md):**
- No em dashes. Sentence case headings. Oxford comma. Contractions allowed.
- Numerals for stats (`< 10 ms`, `96%`, `$9`, `47%`). Spelled out in casual prose.
- No exclamation marks. No emoji in marketing.
- Code in backticks: `base_url`, `model=auto`, `ndr_...`.
- Bold reserved for the key phrase, never whole sentences.

**Voice examples (do):**
- "Stop paying Opus prices for Haiku problems."
- "Swap your base URL. Set model to auto. Watch your bill drop."
- "A provider goes down. Nadir retries against your chain. Your app stays up."
- "Start free. Upgrade when you are ready. Cancel anytime."

**Voice examples (don't):**
- "Nadir is a revolutionary, next-generation AI gateway that empowers teams to seamlessly unlock significant cost savings."
- "🚀 Don't miss out! Sign up today!"
- "Blazing-fast, enterprise-grade, mission-critical routing."

## Proof Points

**Metrics:**
- 47% lower Anthropic bill on the 50-prompt eval set, no quality drop on prompts that need Opus (λ=20 in the wide_deep_asym router)
- 96% routing accuracy on the public 50-prompt benchmark (retrained weekly)
- Under 10 ms classifier overhead per request
- 2 lines of code change to migrate
- 30 to 70% input token reduction with context optimization (where applicable)
- Up to 53% savings with the argmax variant (2.4pp higher downgrade rate, documented)
- 99.9% uptime SLA on Enterprise (contractual)

**Customers / logos:** No committed customer logos yet. See "Target Accounts (Aspirational ICPs)" above for the archetypes and example companies we are building toward. Anchor-logo priority order is documented there.

**Testimonials:**
> TBD — capture verbatim customer quotes from support, Slack, and post-onboarding emails.

**Value themes:**
| Theme | Proof |
|-------|-------|
| Cost | 47% lower bill on 50-prompt eval; per-request `x-nadir-cost-saved` header; calculator on the homepage |
| Zero friction | OpenAI compatible, two-line change, `model="auto"`, drop-in for Claude Code / Cursor / Codex / Aider / Windsurf / Continue / LangChain / OpenAI SDK |
| Control | Quality floor per API key, BYOK, failover chain, pin-a-model when needed |
| Observability | Per-request response headers, full dashboard, no instrumentation |
| Safety | In-memory proxy, no prompt logging unless opted in, automatic failover |

**Claims discipline (from BRAND_VOICE.md):** Every quantitative claim must (a) cite the source inline, (b) link to the eval, (c) qualify the range, or (d) be contractually true. "Up to 47%" appears once prominently, not three times.

## Goals

**Business goal:** Convert engineering teams already paying Anthropic / OpenAI / Google five-figures-plus per month into Pro subscribers. Free tier and BYOK exist to remove signup friction; the Pro savings fee scales with the value delivered.

**Primary conversion action:** Sign up (no card) → Onboarding (Subscribe = step 0 for Pro trial) → Swap base URL → First routed request.

**Activation milestone:** First routed request through `api.getnadir.com` with `model="auto"`. After that, the dashboard shows per-request cost and `x-nadir-cost-saved` headers — the "aha" moment.

**Secondary CTAs:**
- "Read the docs" (low intent)
- "Talk to sales" (Enterprise, gated `?reason=enterprise&source=...`)
- "Read the deep dives" → `/compare` per-competitor pages
- "Calculator" → CalculatorTeaser on homepage

**Current metrics:** TBD — fill in from PostHog (project 356515): signup conversion, activation rate (first-routed-request within 7d), trial-to-paid, savings-fee revenue per active account.
