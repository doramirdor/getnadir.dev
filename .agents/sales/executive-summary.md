# Nadir — Executive Summary

**For:** New sales hire onboarding
**Prepared by:** Founder
**Date:** 2026-05-26

---

## What Nadir Is

Nadir is an LLM gateway that routes every prompt to the cheapest model that can handle it. A trained classifier reads each request in under 10 ms and picks the destination: Haiku for classification work, Sonnet for code edits, Opus only when the prompt actually requires frontier reasoning. The product is OpenAI-compatible, so installation is a two-line change: swap the base URL, set `model="auto"`.

We are a hosted SaaS at `api.getnadir.com` with an open-source self-hosted core (NadirClaw, MIT). Multi-tenant Postgres via Supabase, Stripe billing, FastAPI backend, React dashboard.

## Why It Exists

LLM bills are growing faster than engineering teams can audit them. A large share of production prompts (classification, summarization, formatting, simple Q&A) does not need a frontier model, but most teams pin one model for everything or hand-roll brittle routing logic. The bill compounds. Engineering time gets spent on routing code instead of product. Provider outages page on-call.

Nadir solves this with a maintained routing layer: a trained classifier, an outcome-conditioned closed loop that adapts as model quality drifts, semantic cache, context optimization, and per-request observability. The customer ships the integration in an afternoon and sees savings on the next request.

## Market and ICP

**Buyers:** Engineering-led teams running production LLM workloads. Startups through mid-market. Decision is owned by founder-engineers, staff engineers, and VPs of Engineering, not procurement. The qualifier is a $5K/mo+ Anthropic, OpenAI, or Google bill.

**Strongest archetypes:**
1. **AI coding tools** (Cursor, Replit Agent, Aider, Windsurf, Tabnine, Bolt, V0, Cody, Codeium). Mixed-complexity calls. Margin compression scales with token volume.
2. **AI-native SaaS** where the LLM is the product (Decagon, Sierra, Harvey-tier legal, Glean, Writer, Otter). LLM cost is the second line on the AWS invoice.
3. **Agent and workflow platforms** (CrewAI, Lindy, Relevance AI, AutoGen-based startups). Multi-step chains compound spend.
4. **Series A/B SaaS adding AI features** (Notion-tier, Linear-tier, Intercom Fin, Ramp, Brex).
5. **Vertical AI** (Abridge, Nabla, Suki, Spellbook, financial research, recruiting AI).

Anchor logo priority: AI coding tool first (highest social proof inside our audience), then a Series A/B AI-native SaaS, then a vertical AI startup, then an agent platform.

## How We Win

We are not another model catalogue. The competitive landscape is full of gateways that hand the customer a list of models and a fallback chain. OpenRouter, Requesty, Portkey, and LiteLLM all leave the routing decision with the engineer. Not Diamond is closest on the routing claim itself.

Nadir picks the model. The classifier is trained, retrained weekly, and benchmarked publicly (96% agreement on the 50-prompt eval). The Outcome-Conditioned Routing loop adjusts per-tier thresholds from live response quality, which nobody else ships. Semantic cache, context optimization, BYOK on every tier including Free, in-memory proxy with no plaintext logging by default. The open-source core exists for teams who want to run it themselves, which neutralizes the "vendor lock-in" objection.

The headline proof point: **47% lower Anthropic bill on our 50-prompt eval at λ=20, no quality drop on prompts that need Opus.** Up to 53% with the argmax variant (documented tradeoff: 2.4pp higher downgrade rate). Under 10 ms classifier overhead.

## Pricing and Business Model

| Tier | Price | Purpose |
|---|---|---|
| Free | $0 forever, 50 requests/mo on our keys, unlimited with BYOK | Remove signup friction |
| Pro | $9/mo flat + 25% on first $2K saved, 10% above | Aligns price with value delivered |
| Enterprise | Custom volume pricing, 99.9% SLA, SSO/SAML, dedicated infra | Mid-market and up |

The savings fee is the lever. Customers pay the variable component only on savings Nadir produced, measured against the always-Opus benchmark. The flat $9 base is the subscription floor and is billed separately from savings.

## Sales Motion

The motion is engineer-led, product-led at the top of funnel. Sales gets involved on Enterprise and on mid-market accounts with custom routing, volume pricing, or compliance requirements.

**Stages:**

1. **Self-serve trial.** Engineer signs up, swaps the base URL, ships the integration, sees the first routed request. Pro trial activates on first subscribe. No card required for Free.
2. **Pro conversion.** Triggered by demonstrated savings on the dashboard. First-month-free coupon (`FIRST1`) is available.
3. **Enterprise.** Reached via `?reason=enterprise` on the contact form, or outbound. Solutions engineer joins. Volume pricing, SLA, dedicated infra, SSO/SAML.

**Qualification checklist (use for inbound triage and outbound):**
- Paying $5K/mo+ to Anthropic, OpenAI, or Google
- Engineering-owned routing decision (not procurement-led)
- Mixed-complexity prompt distribution
- BYOK acceptable to security review
- Public engineering footprint (so the logo carries weight when landed)

## Common Objections (with responses)

1. **"Will the cheaper model give worse answers?"** Quality floor is per-API-key. Below the threshold, premium model. 0% catastrophic routes on our 50-prompt eval at λ=20.
2. **"I don't want a vendor between me and Anthropic."** In-memory proxy, BYOK on every tier, OpenAI compatible. Self-host the open-source core if preferred.
3. **"Adds latency."** Classifier overhead under 10 ms. Faster than DNS lookup.
4. **"We can build this ourselves."** The classifier, OCR loop, semantic cache, context optimization, retraining pipeline, and per-request observability are months of engineering. $9/mo gets the maintained version today.
5. **"Are my prompts logged?"** Only if logging is on. With BYOK and logging off, we never see plaintext.
6. **"What if Anthropic goes down?"** Nadir retries against the configured chain. The app stays up.

## What to Send First

1. **One-pager** (`.agents/sales/one-pager.md`) — the lead artifact, sent to qualified prospects after the first conversation
2. **Homepage demo** — getnadir.com walks the same pitch with the calculator and code snippets
3. **Deep dives** — `/compare` pages cover OpenRouter, Requesty, Portkey, LiteLLM, Not Diamond head-to-head

## Goals This Quarter

- Convert engineering teams already paying $5K/mo+ to Anthropic, OpenAI, or Google into Pro subscribers
- Land an anchor logo in the AI coding tools or AI-native SaaS archetypes
- Build the testimonial bank (zero verbatim customer quotes captured today, this is the gap)
- Tighten activation: first-routed-request within 7 days of signup is the metric to watch

## What I Need From You

- Run the qualification checklist on every inbound and every outbound seed list
- Send the one-pager after the first call, not before
- Capture verbatim language from every prospect — exact phrases, not paraphrased. Post them in `#sales-quotes` so we can feed them back into copy
- Flag any objection not on the list above. We update the doc, not the answer

---

*Questions: ping the founder. Updates to this doc: edit in place, commit, ping the team.*
