# Nadir Brand Voice

Extracted from the production homepage (April 2026). Use this as a rubric for any marketing copy, docs intro pages, emails, or landing pages. If a draft violates something here, either rewrite or explicitly justify why this page needs an exception.

## Brand Personality

If Nadir were a person, they would be a senior infra engineer who ships. Short on adjectives, long on specifics. Confident enough to say "we route every prompt" without hedging, honest enough to say "your savings vary with your workload." Not a hype account. Not a hedge-everything corporate voice. A builder talking to other builders.

## Voice Attributes

### 1. Direct

- **We are:** short declarative sentences, active voice, verbs up front.
- **We are not:** breathless, exclamatory, or sales-gushy.
- **Sounds like:** "Swap your base URL. Set model to auto. Watch your bill drop."
- **Does NOT sound like:** "Nadir is a revolutionary, next-generation AI gateway that empowers teams to unlock..."

### 2. Confident, not boastful

- **We are:** specific about the things we can prove (under 10 ms overhead, 96% on our eval, OpenAI compatible) and honest about the shape of the proof ("our 50-prompt benchmark," "a sample of six prompts").
- **We are not:** "the best," "the only," "unmatched," "world-class."
- **Sounds like:** "Agreement with human labels on our public eval: 96%."
- **Does NOT sound like:** "The industry's most accurate routing engine."

### 3. Technically literate

- **We are:** comfortable with `base_url`, `model=auto`, response headers, BYOK, semantic cache. We assume the reader writes code.
- **We are not:** condescending or over-explaining. We do not translate "API key" into "a special password for the computer."
- **Sounds like:** "A provider goes down. Nadir retries against your chain. Your app stays up."
- **Does NOT sound like:** "When one of your AI providers experiences a service interruption, our system will automatically..."

### 4. Calm

- **We are:** unhurried. Metric-driven. No urgency theater.
- **We are not:** "ACT NOW." No countdown timers. No "limited time" unless a limit actually exists.
- **Sounds like:** "Start free. Upgrade when you are ready. Cancel anytime."
- **Does NOT sound like:** "🚀 Don't miss out! Sign up today before pricing changes!"

## Audience

- **Primary:** engineering leads, staff/senior engineers, and founder-engineers running production LLM workloads. They own a bill. They read the code block before they read the headline.
- **Secondary:** ML platform teams and data platform teams considering building their own gateway.

They have tried OpenRouter, Requesty, or a homegrown router. They know the tradeoffs. They are evaluating whether to rip and replace, not discovering the category.

## Messaging Pillars

In order of prominence on the homepage:

1. **Cost.** Lower your LLM bill by routing each prompt to the cheapest model that can handle it.
2. **Zero friction.** OpenAI compatible, two-line change, `model=auto`.
3. **Control.** Quality floor per API key, BYOK, failover chain, pin a model when you need to.
4. **Observability.** Per-request cost, latency, routing decisions, cache hits — visible in headers and dashboard.
5. **Safety.** Proxy in memory, no prompt logging unless opted in, failover on provider outage.

Every claim on marketing copy should ladder back to one of these.

## Tone by Context

| Context | Dial up | Dial down |
|---|---|---|
| Homepage headline | Boldness | Technical detail |
| Docs / how-it-works | Precision | Punchy slogans |
| Error messages | Empathy, specificity | Confidence ("obviously...") |
| Outage postmortem | Transparency, accountability | Marketing claims |
| Changelog | Specifics, dated | Superlatives |
| Sales email | Relevance to their stack | Pre-written "excited to connect" filler |

Voice stays the same across all of these. Only the balance shifts.

## Style Rules

- **No em dashes.** Use commas, periods, or separate sentences. Never `—`.
- **Sentence case headings.** "Three steps. Two minutes." not "Three Steps. Two Minutes."
- **Oxford comma:** yes. "fast, reliable, and secure."
- **Contractions:** use them. "you're," "we're," "don't."
- **Numbers:** numerals for metric stats (`< 10 ms`, `96%`, `$9`, `40%`). Spelled out in prose when casual ("three steps," "two minutes," "fifteen requests per day"). Pick one per sentence and stay consistent.
- **Lists:** periods on full sentences, no periods on fragments. Be consistent within a single list.
- **Bold:** reserved for the key phrase in a sentence. Do not bold whole sentences.
- **Exclamation marks:** avoid. Never more than one.
- **Emoji:** none in product marketing. Reserved for social only.
- **Code in prose:** backticks for `base_url`, `model=auto`, `ndr_...`, HTTP headers.

## Terminology

| Use this | Not this | Notes |
|---|---|---|
| Nadir | nadir (lowercase) | Always capitalized. |
| OpenAI compatible | OpenAI-compatible | No hyphen. |
| base URL | baseURL / base-url | Two words in prose. |
| BYOK | bring-your-own-keys | Acronym first use: "BYOK (bring your own keys)" once per page, then BYOK. |
| sign up (verb) | signup | Signup is the noun. |
| log in (verb) | login | Login is the noun/adjective. |
| set up (verb) | setup | Setup is the noun/adjective. |
| prompt | query, input | Consistent technical term. |
| route / routing | redirect, forward | "Route" is the product verb. |
| the cheapest model that can handle it | the smallest / lightest model | "Handle it" is the phrase. |
| under ten milliseconds | sub-10ms, <10ms (in prose) | Numerals fine in stat blocks. |
| Haiku / Sonnet / Opus | haiku / sonnet / opus | Capitalized as proper model names. |

## Claims Discipline

Every quantitative claim on a marketing page must meet one of:

1. **Cite the source in-line or adjacent.** "Based on a sample of six prompts at current Anthropic rates."
2. **Link to the eval / dataset.** "Agreement with human labels on our public eval." [See the eval →]
3. **Qualify the range.** "Up to 40%." "22 to 40% on a typical mix."
4. **Contractually true.** "99.9% uptime SLA" only if the MSA says so.

Repeating an unqualified claim across sections does not strengthen it. It weakens it. "Up to 40%" should appear once prominently, not three times.

## What to Avoid

- Superlatives without evidence: "fastest," "best," "only," "most advanced."
- Tautological claims: "Built for production."
- Vague benefits: "powerful," "robust," "seamless," "cutting-edge."
- Fake urgency: "limited time," countdown timers, "don't miss out."
- Hedge stacking: "can potentially help teams possibly reduce..."
- Condescension: "easy," "simple." (What is easy varies.) Prefer "a two-line change," "no refactor."
- Corporate filler: "We're excited to announce," "revolutionize," "empower," "unlock."

## Example Before / After

**Before:** "Nadir is an innovative AI gateway that empowers development teams to seamlessly unlock significant cost savings across their LLM infrastructure."

**After:** "Nadir routes every prompt to the cheapest model that can handle it. OpenAI compatible. Two-line change."

**Before:** "Don't miss out — sign up today!"

**After:** "Start free. Upgrade when you are ready. Cancel anytime."

**Before:** "Blazing-fast, enterprise-grade, mission-critical routing."

**After:** "Under ten milliseconds of classifier overhead per request. 99.9% uptime SLA on Enterprise."
