# Nadir — One Pager

**The router that picks the cheapest model that can do the job.**

Nadir is an LLM gateway that reads every prompt with a trained classifier in under 10 ms and routes it to the cheapest Anthropic model that can answer it well. Haiku for classification, Sonnet for refactors, Opus only when the prompt actually needs to think. OpenAI compatible. Two lines of code to install. Savings show up on the next request.

---

## The Problem

Engineering teams are paying Opus, GPT-4, and Gemini Pro prices for prompts that a Haiku-class model could answer correctly. A meaningful share of production traffic is classification, formatting, summarization, or simple Q&A. But routing logic is hand-rolled, brittle, or skipped entirely, so everything goes to the premium model.

Result: 30 to 70% of the LLM bill is overspend on prompts that did not need the premium model. Engineering time goes into routing code instead of product. Provider outages page the team.

## The Solution

A drop-in proxy at `api.getnadir.com`. Customer swaps the base URL, sets `model="auto"`, and ships. Nadir reads each prompt, picks the destination model, and returns the answer with cost and routing metadata in the response headers.

- **Trained classifier**, 96% agreement on the public 50-prompt benchmark, retrained weekly
- **Outcome-Conditioned Routing (OCR)** — closed-loop algorithm that adjusts per-tier thresholds from live response quality. Nobody else ships this
- **Semantic cache** on by default
- **Context optimization** cuts input tokens 30 to 70% on long prompts
- **Per-request headers**: `x-nadir-routed-to`, `x-nadir-cost-usd`, `x-nadir-cost-saved`, `x-nadir-latency-ms`, `x-nadir-cached`
- **BYOK on every tier**, including Free
- **Failover chain** — provider outage, Nadir retries against the configured chain, app stays up
- **Open-source self-host** option (NadirClaw, MIT) for teams that prefer to run it themselves

## Proof

- **47% lower Anthropic bill** on the 50-prompt eval set at λ=20, no quality drop on prompts that need Opus
- **96% routing accuracy** on the public benchmark
- **Under 10 ms** classifier overhead per request
- **2 lines of code** to migrate
- **Up to 53% savings** with the argmax variant (2.4pp higher downgrade rate, documented)
- **99.9% uptime SLA** on Enterprise (contractual)

## Who It's For

Engineering-led teams running production LLM workloads. Startups through mid-market. Anyone with a five-figure-and-up Anthropic, OpenAI, or Google bill.

**Strong fit:**
- AI coding tools (Cursor, Replit Agent, Continue, Aider, Windsurf, Tabnine, Bolt, V0, Lovable, Cody, Codeium)
- AI-native SaaS where the LLM is the product (Decagon, Sierra, Harvey-tier legal, Jasper, Writer, Glean, Otter, Fireflies)
- Agent and workflow platforms (CrewAI, n8n AI, Lindy, Relevance AI, AutoGen-based startups)
- Series A/B SaaS adding AI features (Notion-tier, Linear-tier, Intercom Fin, Pendo, Ramp, Brex)
- Vertical AI (Abridge, Nabla, Suki, Spellbook, financial research AI, recruiting AI, sales agents)

**Not a fit:**
- Workloads where every request needs Opus (deep reasoning, long-form research)
- Compliance regimes that disqualify any third-party proxy, even in-memory and BYOK
- Teams deeply invested in a homegrown router tuned to their exact model mix

## Pricing

| Tier | Price | What you get |
|---|---|---|
| **Free** | $0 forever | Hosted proxy, 50 requests/mo on our keys, unlimited with BYOK, full dashboard |
| **Pro** | $9/mo flat + savings fee | 25% on the first $2K saved, 10% above. If we save you nothing, you pay $9. First month free with code `FIRST1` |
| **Enterprise** | Custom | Volume pricing, 99.9% SLA, SSO/SAML, dedicated infra, solutions engineer |
| **NadirClaw** | Free (MIT) | Self-hosted open-source core |

The Pro fee scales with the value delivered. Customers only pay the variable fee on savings Nadir produced.

## Competitive Landscape

| Competitor | What they do | How Nadir differs |
|---|---|---|
| **OpenRouter** | Model catalogue, BYOK, fallback | They list models. We pick one. Trained classifier, not a chooser |
| **Requesty** | Manual model selection with rules | Rules drift. Our classifier retrains weekly |
| **Portkey** | Strong observability, rules-based routing | Same routing problem. No trained classifier |
| **LiteLLM** | Open-source SDK, run it yourself | Rules-based. No OCR, no semantic cache, no context optimization |
| **Not Diamond** | Closest on routing claims | We compete on observability, BYOK economics, OCR, and price |
| **DIY router** | In-house build | Months of work. Classifier, OCR, retraining pipeline, eval set — already shipped |
| **Pin-one-model** | Always-Opus or always-Haiku | Either overpay on simple, or eat quality drops on hard |

## Top Objections

| Objection | Response |
|---|---|
| "Will the cheaper model give worse answers?" | Set a quality floor per API key. Below the threshold, premium model. On our eval, 0% catastrophic routes at λ=20 |
| "I don't want a vendor between me and Anthropic." | Proxy runs in memory, BYOK on every tier, OpenAI compatible. Self-host the open-source core if preferred |
| "Adds latency." | Classifier overhead is under 10 ms per request. Faster than DNS lookup |
| "We can build this ourselves." | The classifier, OCR loop, semantic cache, context optimization, retraining pipeline, and per-request observability are months of work. $9/mo gets the maintained version today |
| "Are my prompts logged?" | Only if logging is on. With BYOK and logging off, we never see plaintext |
| "What if Anthropic goes down?" | Nadir retries against the configured chain. App stays up |

## How It Works (2-line install)

```python
# Before
client = OpenAI(api_key=ANTHROPIC_KEY)
resp = client.chat.completions.create(model="claude-opus-4-6", messages=...)

# After
client = OpenAI(api_key=NADIR_KEY, base_url="https://api.getnadir.com/v1")
resp = client.chat.completions.create(model="auto", messages=...)
```

That's the migration. The response carries cost and routing headers. The dashboard shows savings on the next page load.

## Primary Call to Action

1. Sign up at **getnadir.com** (no card)
2. Swap base URL, set `model="auto"`
3. First routed request lands on the dashboard
4. Pro trial starts when ready

For Enterprise: route to `getnadir.com/contact?reason=enterprise`.

---

*Nadir, Inc. — getnadir.com — sales contact: TBD*
