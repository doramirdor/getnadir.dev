export interface BlogPostMetadata {
  id: string;
  title: string;
  date: string;
  author: string;
  excerpt: string;
  thumbnail: string;
  tags: string[];
  readingTime: string;
}

export interface BlogPost extends BlogPostMetadata {
  content: string;
}

const blogPostsMetadata: BlogPostMetadata[] = [
  {
    id: "enterprise-ai-costs-routing-2026",
    title: "Enterprise AI costs dropped 67% this year. Routing is the reason.",
    date: "2026-05-12",
    author: "Dor Amir",
    excerpt: "Between Q1 2025 and Q1 2026, average enterprise cost per million tokens fell from $18.40 to $6.07. Token price cuts explain half of it. The other half is multi-model routing, now used by 42% of enterprises. We break down the data, the economics, and what separates the teams saving 87% from the ones still overpaying.",
    thumbnail: "Research",
    tags: ["Enterprise", "Cost Optimization", "Routing", "2026 Trends"],
    readingTime: "7 min read",
  },
  {
    id: "opus-4-7-tokenizer-hidden-cost",
    title: "Opus 4.7 costs more than 4.6. Anthropic just did not change the price.",
    date: "2026-05-11",
    author: "Dor Amir",
    excerpt: "Claude Opus 4.7 ships a new tokenizer that produces up to 35% more tokens from the same text. The rate card says $5/$25 per million tokens, unchanged from 4.6. Your bill went up anyway. We break down the real numbers and what model routing does about it.",
    thumbnail: "Deep Dive",
    tags: ["Cost Optimization", "Anthropic", "Tokenizer", "Pricing"],
    readingTime: "6 min read",
  },
  {
    id: "agentic-ai-token-costs",
    title: "Your AI agents are burning tokens. Here is where the money goes.",
    date: "2026-05-11",
    author: "Dor Amir",
    excerpt: "Agentic workloads consume 5 to 30x more tokens than a chatbot. Per-token prices fell 80% last year, yet enterprise LLM bills keep climbing. We break down why, with data from Stanford, Microsoft Research, and production traces.",
    thumbnail: "Deep Dive",
    tags: ["Cost Optimization", "Agentic AI", "Tokens"],
    readingTime: "7 min read",
  },
  {
    id: "ocr-closed-loop-routing",
    title: "OCR: our new closed-loop routing algorithm",
    date: "2026-04-04",
    author: "Dor Amir",
    excerpt: "Static routers plateau at 88-93% accuracy. We built a closed-loop algorithm that learns from every response, adapts to model changes, and cuts costs 43% with zero quality loss.",
    thumbnail: "Research",
    tags: ["Research", "ML", "Routing"],
    readingTime: "8 min read",
  },
  {
    id: "50-prompt-benchmark",
    title: "Routing benchmark: 96% accuracy, 38% cost savings",
    date: "2026-03-24",
    author: "Dor Amir",
    excerpt: "We ran 50 real-world prompts through Nadir's binary classifier. Simple prompts went to Gemini Flash, complex stayed on Sonnet. Here are the raw numbers.",
    thumbnail: "Benchmark",
    tags: ["Benchmark", "Cost Savings"],
    readingTime: "5 min read",
  },
  {
    id: "context-optimize-savings",
    title: "Context Optimize saved 61% of input tokens on Claude Opus",
    date: "2026-03-20",
    author: "Dor Amir",
    excerpt: "Agentic sessions bloat context with repeated tool schemas and pretty-printed JSON. We benchmarked lossless compression across 5 real scenarios.",
    thumbnail: "Deep Dive",
    tags: ["Context Optimize", "Tokens"],
    readingTime: "4 min read",
  },
  {
    id: "why-we-built-nadir",
    title: "Why we built Nadir: the $0.45 docstring problem",
    date: "2026-03-15",
    author: "Dor Amir",
    excerpt: "We were paying Claude Opus prices for 'write a docstring'. That's when we decided to build an intelligent router that sends simple prompts to cheaper models.",
    thumbnail: "Story",
    tags: ["Origin", "Open Source"],
    readingTime: "3 min read",
  },
  {
    id: "how-binary-classifier-works",
    title: "How our binary classifier routes prompts in 50ms",
    date: "2026-03-10",
    author: "Dor Amir",
    excerpt: "Under the hood: DistilBERT embeddings, centroid matching, and a 3-tier system that decides if your prompt needs a premium model or not.",
    thumbnail: "Technical",
    tags: ["Classifier", "ML", "Architecture"],
    readingTime: "6 min read",
  },
  {
    id: "nadir-vs-always-premium",
    title: "Nadir vs always-premium: when to use which",
    date: "2026-03-05",
    author: "Dor Amir",
    excerpt: "Not every workload benefits from routing. We break down which use cases save the most, and when you should just stick with one model.",
    thumbnail: "Guide",
    tags: ["Guide", "Cost"],
    readingTime: "4 min read",
  },
];

const blogContent: Record<string, string> = {
  "enterprise-ai-costs-routing-2026": `## The 67% drop nobody expected

Between Q1 2025 and Q1 2026, the average enterprise cost per million tokens fell from $18.40 to $6.07. That is a 67% year-over-year reduction.

Token prices did fall. Anthropic cut Opus pricing. OpenAI launched cheaper tiers. Google pushed Flash pricing below $0.10 per million tokens. But price cuts alone do not explain a 67% drop in actual spend per token.

The other half of the story is multi-model routing. Enterprises stopped sending every request to a frontier model and started matching each request to the cheapest model that could handle it.

## The multi-model shift

In Q1 2025, the average enterprise used 2.1 models in production. One year later, that number is 4.7. Thirty-seven percent of enterprises now run five or more models. And 42% have deployed a middleware or routing layer to manage model selection automatically.

This is not a gradual shift. The number of models per enterprise more than doubled in twelve months. The catalyst was a combination of model proliferation (more good options at every price point), cost pressure (inference now constitutes 85% of enterprise AI budgets according to Gartner), and tooling maturity (routing middleware that actually works in production).

The teams that adopted tiered routing early saw the biggest gains. Enterprises fully implementing tiered routing achieved median blended costs of $2.31 per million tokens, compared to $18.40 for frontier-only deployments. That is an 87.4% reduction.

## Why single-model deployments are expensive

The logic is straightforward. Most enterprise API traffic is not complex reasoning. Industry benchmarks consistently show that 60 to 85% of requests can be handled by budget-tier models without quality degradation.

When every request goes to a frontier model at $5 to $15 per million tokens, you are paying frontier rates for tasks like formatting output, parsing errors, answering FAQs, and generating boilerplate code. A budget model at $0.10 to $1.00 per million tokens handles these identically.

Microsoft Research published findings in 2026 showing that routing architectures can reduce frontier model calls by 40% without measurable quality degradation. The savings come not from cutting corners, but from recognizing that most work does not need the most powerful tool.

## The FinOps Foundation noticed

The FinOps Foundation identified AI as the fastest-growing spend category in their 2026 State of FinOps report. The number that stands out: 73% of respondents reported that AI costs exceeded their original budget projections.

This is driving a shift in how teams measure AI economics. The old metric, cost per token, is being replaced by cost per successful interaction. A cheap model that fails and retries three times can cost more than an expensive model that succeeds on the first try. Token cost alone does not capture this.

The teams with the best economics track three things:

- **Cost per completed task,** not cost per token
- **Success rate per model per task type,** to calibrate routing thresholds
- **Retry cost,** which compounds because each retry carries the full accumulated context

This is why static rules like "send everything under 100 tokens to Haiku" plateau at 88 to 93% accuracy. The routing decision depends on task complexity, not input length.

## What a routing layer actually does

A routing layer sits between your application and the LLM providers. For each request, it:

1. Classifies the request complexity (typically under 10ms)
2. Selects the cheapest model that can handle that complexity level
3. Forwards the request to the selected provider
4. Returns the response with cost metadata

The classifier is the critical piece. A trained classifier that evaluates semantic complexity, not just surface features like token count, is what separates 96% routing accuracy from 85%.

The overhead matters too. If classification adds 500ms to every request, the latency tax offsets the cost savings. Production routing layers need sub-10ms classification. This is achievable with lightweight models like DistilBERT embeddings and centroid matching.

## The ROI math for a typical enterprise

Here is what the numbers look like for a team spending $10,000 per month on LLM APIs with a mixed workload:

| Request type | Share of traffic | Without routing | With routing | Monthly cost (before) | Monthly cost (after) |
|---|---|---|---|---:|---:|
| Simple (formatting, lookups, FAQ) | 50% | Opus ($5/MTok) | Haiku ($1/MTok) | $5,000 | $1,000 |
| Medium (code gen, explanations) | 35% | Opus ($5/MTok) | Sonnet ($3/MTok) | $3,500 | $2,100 |
| Complex (architecture, debugging) | 15% | Opus ($5/MTok) | Opus ($5/MTok) | $1,500 | $1,500 |
| **Total** | **100%** | | | **$10,000** | **$4,600** |

That is 54% savings with zero quality degradation on the complex tasks. The 15% that genuinely needs frontier reasoning still gets it.

Gartner forecasts worldwide AI spending at $2.52 trillion in 2026. If even a fraction of that is inference spend that could be routed more efficiently, the aggregate savings run into billions.

## How to evaluate routing for your workload

Not every workload benefits equally. Here is a quick diagnostic:

**Routing helps most when:**

- Your prompt mix includes 40%+ simple or medium-complexity requests
- You make more than a few hundred API calls per day
- You run agentic workflows (coding assistants, multi-step chains)
- Your monthly LLM spend exceeds $500

**Routing helps least when:**

- Nearly every request requires complex reasoning (legal analysis, medical diagnosis)
- You are already on the cheapest available model
- Your volume is too low for the savings to matter

The fastest way to check: pull a week of API logs, bucket each request by complexity, and calculate what the cost would have been if simple requests went to Haiku and medium requests went to Sonnet. If the theoretical savings exceed 30%, routing pays for itself immediately.

## The market is moving fast

The LLM middleware and gateway market is growing at a 49.6% compound annual growth rate through 2034. Routing is becoming standard infrastructure, not a nice-to-have optimization.

Nadir routes each request in under 10ms and shows the savings per request in the \`x-nadir-cost-saved\` response header. The open-source core (NadirClaw) runs locally with no data leaving your machine. The hosted platform adds trained classifiers, analytics, and billing. Both are OpenAI-compatible: change the base URL, set \`model="auto"\`, and routing starts on the next request.

---

*Sources: [Open Source For You, "Enterprise AI Costs Crash 67%"](https://www.opensourceforu.com/2026/05/enterprise-ai-costs-crash-67-as-open-source-models-and-multi-model-routing-go-mainstream/) (May 2026). [Index.dev, "LLM Enterprise Adoption Statistics"](https://www.index.dev/blog/llm-enterprise-adoption-statistics) (2026). [FinOps Foundation, "State of FinOps 2026"](https://data.finops.org/) (2026). [Gartner, "Worldwide AI Spending Forecast"](https://www.gartner.com/en/newsroom/press-releases/2026-1-15-gartner-says-worldwide-ai-spending-will-total-2-point-5-trillion-dollars-in-2026) (January 2026). Microsoft Research, routing architecture benchmarks (2026). Anthropic, OpenAI, Google model pricing as of May 2026.*`,

  "opus-4-7-tokenizer-hidden-cost": `## Same price per token. More tokens per request.

On April 16, 2026, Anthropic released Claude Opus 4.7. The rate card stayed at $5 per million input tokens and $25 per million output tokens, identical to Opus 4.6. No price increase announcement. No billing change email.

But Opus 4.7 ships with a new tokenizer. The same input text now produces up to 35% more tokens than it did on 4.6. More tokens at the same price per token means a higher bill per request.

This is not a bug. The new tokenizer improves how the model processes text, and the quality gains in Opus 4.7 are real. But if you are budgeting based on the rate card alone, your forecasts are wrong.

## The numbers

OpenRouter published an analysis based on over one million requests from users who switched from Opus 4.6 to 4.7. The findings:

- **Production-scale prompts (10K+ tokens):** 32 to 34% more tokens for the same input text
- **Short prompts (under 2K tokens):** 42 to 45% more tokens, but Opus 4.7 generates 62% fewer output tokens on these queries, so the net cost is actually lower
- **Real-world cost increase:** 12 to 27% higher per-request cost for prompts above 2K tokens

The pattern is clear. Short prompts got cheaper because Opus 4.7 is more concise on them. Long prompts got more expensive because the tokenizer inflation dominates.

Simon Willison built a token counter that compares models side by side. The same code snippet that tokenizes to 1,000 tokens on Opus 4.6 becomes 1,320 to 1,350 tokens on 4.7. The same English paragraph jumps from 500 to 580 tokens. Structured data like JSON and XML sees the highest inflation.

## Prompt caching absorbs some of it

Anthropic's prompt caching discounts cached input tokens by 90%. Since the new tokenizer inflates all tokens equally, cached and uncached, the 90% discount means extra cached tokens cost almost nothing.

OpenRouter's data shows this clearly. For prompts over 128K tokens, 93% of the extra tokens land in the cache. The effective cost increase on these long-context requests is small, around 2 to 5%.

The problem is the mid-range. Prompts between 2K and 30K tokens, which is where most agentic coding turns fall, see the full 12 to 27% increase. These prompts are long enough for the tokenizer inflation to matter but often too varied for caching to help.

## Why this hits agentic workloads hardest

Agentic coding sessions (Claude Code, Cursor, Aider, Windsurf, Codex) are exactly the workloads in the worst spot. A typical session looks like this:

| Turn | Input tokens (Opus 4.6) | Input tokens (Opus 4.7) | Increase |
|------|------------------------|------------------------|----------|
| 10 | ~12,000 | ~15,800 | +32% |
| 20 | ~22,000 | ~29,000 | +32% |
| 30 | ~32,000 | ~42,200 | +32% |
| 40 | ~40,000 | ~52,800 | +32% |

At $5 per million input tokens, a 40-turn session that cost $4.53 on Opus 4.6 now costs roughly $5.98 on 4.7. That is a 32% increase on a session that never changed. Scale that across a team running hundreds of sessions per week and the difference is thousands of dollars per month.

The retry tax compounds it further. When an agent hits a test failure at turn 35 and retries three times, each retry carries 35,000+ tokens of accumulated context. Those three retries cost $0.53 on 4.6 and $0.70 on 4.7. The tokenizer tax applies to wasted work too.

## The fix is not staying on 4.6

Opus 4.6 is still available, and some teams have pinned to it to avoid the cost increase. This is a short-term workaround, not a strategy. Anthropic will eventually deprecate 4.6, and the quality improvements in 4.7 are genuine. The new tokenizer exists because it helps the model perform better.

The real question is: does every request in your workload need Opus at all?

## Where model routing changes the math

The tokenizer inflation only applies to requests that hit Opus 4.7. Sonnet 4.6 and Haiku 4.5 use the same tokenizer as before. Their token counts have not changed.

In a typical agentic workload, 60 to 70% of turns are low complexity: reading files, checking status, formatting output, parsing errors. These are tasks that Haiku handles correctly at $1 per million input tokens with the old tokenizer. Another 20 to 30% are medium complexity, and Sonnet handles them at $3 per million input tokens, also with the old tokenizer.

Only 5 to 15% of turns actually need Opus-level reasoning. Those are the only turns that pay the tokenizer tax.

Here is what that looks like on the same 40-turn session:

| Segment | Turns | Model (routed) | Cost (all Opus 4.7) | Cost (routed) |
|---------|-------|----------------|--------------------:|---------------:|
| File reads, status checks | 25 | Haiku 4.5 ($1/M) | $3.95 | $0.45 |
| Code generation, tests | 10 | Sonnet 4.6 ($3/M) | $1.45 | $0.84 |
| Architecture, debugging | 5 | Opus 4.7 ($5/M) | $1.32 | $1.32 |
| **Total** | **40** | | **$6.72** | **$2.61** |

Without routing, the tokenizer change increased the session cost from $4.53 (all Opus 4.6) to $6.72 (all Opus 4.7), a 48% jump. With routing, the session costs $2.61, which is 42% less than the old all-Opus-4.6 baseline and 61% less than all-Opus-4.7.

Routing does not avoid the tokenizer tax. It limits the tax to the requests that actually benefit from the model that charges it.

## Three things you can do today

**1. Audit which requests actually need Opus.** Pull your API logs and check how many of your requests are classification, formatting, or simple Q&A. Most teams find that 60%+ of their calls do not need a frontier model. Those calls should not be paying frontier tokenizer rates.

**2. Use prompt caching on everything you can.** The 90% cache discount absorbs most of the tokenizer inflation for repeated content. System prompts, tool schemas, and few-shot examples should all be cached. This is good practice regardless of routing.

**3. Route per request.** A trained classifier that evaluates each prompt and sends it to the cheapest capable model turns the tokenizer tax from a blanket 12 to 27% increase into a 2 to 5% increase on the subset of requests that need Opus. The classifier overhead is under 10 ms per request.

## The bigger picture

Tokenizer changes are not one-time events. As model architectures evolve, tokenizers will change again. GPT-5.5 already had its own tokenizer adjustment earlier this year. Building a workflow that depends on stable token counts for a specific model version is fragile.

Model routing insulates you from this. When the tokenizer changes, when the pricing changes, when a new model drops, the router re-evaluates each request against the current landscape. You do not need to rewrite your cost model every time a provider ships an update.

Nadir evaluates each request in under 10 ms and routes to the cheapest model that can handle it. The \`x-nadir-cost-saved\` response header shows the savings on every request. Change your base URL, set \`model="auto"\`, and the tokenizer tax stops being your problem.

---

*Sources: [OpenRouter, "Opus 4.7's New Tokenizer: What It Actually Costs"](https://openrouter.ai/announcements/opus-47-tokenizer-analysis) (April 2026). [Finout, "Claude Opus 4.7 Pricing: The Real Cost Story"](https://www.finout.io/blog/claude-opus-4.7-pricing-the-real-cost-story-behind-the-unchanged-price-tag) (2026). [Simon Willison, "Claude Token Counter, now with model comparisons"](https://simonwillison.net/2026/apr/20/claude-token-counts/) (April 2026). [CloudZero, "Claude Opus 4.7 Pricing: What It Actually Costs"](https://www.cloudzero.com/blog/claude-opus-4-7-pricing/) (2026). Anthropic Claude model pricing as of May 2026.*`,

  "agentic-ai-token-costs": `## The paradox: prices fall, bills rise

LLM API prices dropped roughly 80% between early 2025 and early 2026. Anthropic cut Opus pricing from $15/$75 per million tokens to $5/$25 with the 4.6 release. OpenAI, Google, and DeepSeek all followed with aggressive cuts of their own.

Yet enterprise LLM spend is accelerating. The reason is not that teams are wasting money on chatbots. It is that the workloads changed. The shift from single-turn chat to multi-step agentic workflows multiplied token consumption per task by 5 to 30x, according to Gartner's March 2026 analysis. Falling prices times rising volume equals a bigger bill.

## Where the tokens actually go

A standard chatbot interaction sends a prompt, gets a response, and is done. An agentic workflow is different. The agent reads the task, calls a tool, reads the output, decides what to do next, calls another tool, reads that output, and repeats. Every turn re-sends the full conversation history as input tokens.

Microsoft Research quantified this in their April 2026 paper on agentic coding tasks. The numbers are striking:

- Agentic coding tasks consume **1,000x more tokens** than code reasoning or code chat tasks
- A typical coding session uses roughly **1 million input tokens and 40,000 output tokens**, a 25:1 ratio
- The same agent on the same task can vary by **up to 30x** in total token consumption between runs

Stanford's Digital Economy Lab confirmed the pattern. Their research found that input tokens, not output tokens, drive the cost. An agent at turn 1 might send 5,000 input tokens. By turn 30, it carries 25,000 to 35,000 tokens of accumulated context on every single API call. By turn 50, the context is so large that each retry loop costs more than the first ten turns combined.

## The context accumulation tax

Vantage published a detailed breakdown of where agentic coding costs hide. The key insight: context accumulates, and every API call pays the full accumulated price.

Here is what a typical agentic coding session looks like:

| Turn | Input tokens | Cumulative cost driver |
|------|-------------|----------------------|
| 1 | ~5,000 | System prompt + task description |
| 10 | ~12,000 | + file reads, tool schemas, initial edits |
| 20 | ~22,000 | + test output, error messages, first retry |
| 30 | ~32,000 | + second retry cycle, more file reads |
| 40 | ~40,000 | + third retry, accumulated conversation |

When the agent hits a test failure at turn 35 and retries three times, those three retries each carry 35,000+ input tokens. That retry loop alone can cost more than the first twenty turns of the session.

The model choice compounds this. A retry loop at turn 40 on Opus ($5/M input) costs 5x what the same loop costs on Haiku ($1/M input). Teams that default every request to a premium model pay the premium rate on wasted retry work, not just productive work.

## Why "just use a cheaper model" does not work

The obvious response is to run everything on the cheapest model. But that breaks on complex tasks. A coding agent using Haiku to architect a distributed system will produce bad output, retry more, and potentially cost more in wasted tokens than if it had used Opus from the start.

The real distribution of agentic work looks like this:

- **60 to 70% of turns are low complexity.** Reading files, checking status, formatting output, running tests, parsing error messages. These are classification-grade tasks that Haiku handles correctly.
- **20 to 30% are medium complexity.** Writing a function, explaining a bug, generating a test. Sonnet handles these well.
- **5 to 15% are genuinely hard.** Architecture decisions, complex debugging, multi-file refactors where the agent needs to reason across a large codebase. These need Opus or an equivalent frontier model.

Pinning everything to one model means either overpaying on the 70% (all Opus) or degrading quality on the 15% (all Haiku). Neither is a good trade.

## The math on per-turn routing

Model routing evaluates each turn independently and sends it to the cheapest model that can handle it. Applied to agentic sessions, the savings compound because the expensive turns (high context, high token count) are exactly the ones most likely to be low complexity.

Consider a 40-turn agentic coding session on Opus at $5/M input tokens:

| Segment | Turns | Avg input tokens | Model (routed) | Cost (all Opus) | Cost (routed) |
|---------|-------|-----------------|----------------|-----------------|---------------|
| File reads, status checks | 25 | 18,000 | Haiku ($1/M) | $2.25 | $0.45 |
| Code generation, tests | 10 | 28,000 | Sonnet ($3/M) | $1.40 | $0.84 |
| Architecture, debugging | 5 | 35,000 | Opus ($5/M) | $0.88 | $0.88 |
| **Total** | **40** | | | **$4.53** | **$2.17** |

That is a 52% reduction on input tokens alone. Multiply by hundreds of sessions per week across a team, and the difference is five figures per month.

The classifier overhead is under 10 ms per turn. In a session where each turn takes 2 to 30 seconds for the LLM to respond, 10 ms is noise.

## What the research says about routing

The industry is converging on this approach. A 2026 survey found that 37% of enterprises now use five or more models in production. The teams seeing the best results treat model selection like air traffic control, routing each request to the right destination rather than sending everything to the same runway.

Multiple independent analyses put the savings from intelligent routing at 40 to 60% for mixed-complexity workloads. That aligns with our own benchmarks: Nadir's \`wide_deep_asym\` router with lambda=20 saves 47% versus always-Opus on a 50-prompt eval set, with 0% catastrophic routes.

The key is that routing must be automatic and per-request. Manual rules break as prompt distributions shift. Static classifiers plateau at 88 to 93% accuracy. A trained classifier that adapts to live response quality (what we call Outcome-Conditioned Routing) closes the gap.

## Practical steps to cut your agentic AI bill

**1. Audit your token distribution.** Before optimizing, measure. Pull your API logs and bucket requests by input token count and task type. Most teams discover that 60%+ of their API calls are low-complexity turns that do not need a frontier model.

**2. Route per request, not per session.** Pinning an entire session to one model wastes money on low-complexity turns. Per-turn routing catches the file reads, status checks, and formatting tasks that accumulate through a session.

**3. Compress context before it compounds.** Minifying JSON, deduplicating tool schemas, and trimming old conversation turns can cut input tokens 30 to 60% on long sessions. These transforms are lossless. The model receives the same information in fewer tokens.

**4. Watch the retry tax.** If your agent retries failed tasks on a premium model, those retries carry the full accumulated context at premium rates. Routing retries to a cheaper model when the retry is a simple fix (syntax error, missing import) saves disproportionately.

**5. Measure cost per completed task, not cost per token.** A cheaper model that fails and retries five times can cost more than an expensive model that succeeds on the first try. Track task completion cost, not just per-token price.

## The bottom line

Per-token prices will keep falling. That is not going to fix your bill. The shift to agentic workloads changed the unit economics: more turns, more context per turn, more tokens per task. The lever that matters now is not the price of a token. It is how many tokens each task consumes, and whether each of those tokens is hitting the right model.

Nadir routes each turn to the cheapest model that can handle it. The classifier adds under 10 ms. The savings show up on the first request, in the \`x-nadir-cost-saved\` response header. No SDK swap, no refactor. Change the base URL, set \`model="auto"\`, and let the router do the work.

---

*Sources: [Stanford Digital Economy Lab, "How are AI agents spending your tokens?"](https://digitaleconomy.stanford.edu/news/how-are-ai-agents-spending-your-tokens/) (May 2026). [Microsoft Research, "How Do AI Agents Spend Your Money?"](https://arxiv.org/abs/2604.22750) (April 2026). [Vantage, "The Hidden Cost Driver in Agentic Coding Sessions"](https://www.vantage.sh/blog/agentic-coding-costs) (2026). Gartner, "Agentic AI Token Consumption Analysis" (March 2026). Anthropic Claude model pricing as of May 2026.*`,

  "ocr-closed-loop-routing": `## The problem with static routing

Every LLM router today works the same way: train a classifier, deploy it, and hope the world doesn't change. The best static routers reach 88-93% accuracy on standard benchmarks. That sounds good until you realize it means 7-12% of your requests are either wasting money (routed to an expensive model unnecessarily) or sacrificing quality (routed to a cheap model that can't handle the task).

We call this ceiling the **Static Routing Ceiling (SRC)**, and we show in our paper that it's structural, not a tuning problem. It comes from two sources:

- **Model non-stationarity:** Providers push updates that shift capability boundaries. Your classifier was trained on last month's models.
- **Monotone capability violations:** Sometimes a cheaper model outperforms an expensive one on specific tasks. A code-specialized small model can beat a generalist large model on programming prompts.

No amount of classifier tuning fixes this. The router needs to learn from what actually happens.

## What OCR does

**Outcome-Conditioned Routing (OCR)** wraps any static classifier with a feedback loop. After every request, it observes the response (was it valid? what did it cost? how long did it take?) and updates its understanding of each model's capabilities.

The key insight is that these feedback signals decompose into two channels with very different properties:

**Channel 1 — Quality failures (fast, binary).** When a model returns an empty, malformed, or truncated response, that's an unambiguous signal it was overloaded. These are rare (1-5% of requests) but highly informative. OCR applies a fast downward correction to the model's capacity estimate.

**Channel 2 — Cost efficiency (slow, continuous).** The difference between expected and actual cost is available for every successful request, but it's noisy. OCR applies a slow bidirectional update, gradually tuning the cost-quality boundary over thousands of requests.

The 10:1 learning rate ratio between these channels isn't arbitrary — it's derived from matching the expected update magnitude per unit time, given that quality failures are rare but unambiguous while cost signals are common but noisy.

## The asymmetric recovery problem

Here's something we discovered in simulation that, to our knowledge, hasn't been reported before: **dual-channel updates have an asymmetric recovery problem.**

When a model gets worse, Channel 1 catches it fast (within ~800 requests). But when a model gets better — say, after a provider silently upgrades it — neither channel recovers:

- Channel 1 never fires because the model succeeds on everything at its underestimated boundary
- Channel 2 is too slow and noisy to close the gap

In our Monte Carlo simulations, OCR without calibration **never converged** from underestimated initial capacities, even after 10,000 requests. The estimates got stuck.

## Cross-tier calibration probes

We solve this with **cross-tier calibration probes**: periodic shadow requests that test whether a cheaper model can handle traffic currently routed to an expensive one.

When OCR routes a request to tier j, it occasionally also sends the same request to tier j-1 (the next cheaper tier). The user always gets the response from tier j. But if the cheaper tier succeeds, OCR boosts its capacity estimate upward.

The probe frequency adapts: starting at every 50 requests during uncertain periods and relaxing to every 200 once estimates stabilize. Total overhead: **2.16% additional API calls**.

The results from simulation are striking:

| Scenario | Without calibration | With calibration | Improvement |
|----------|-------------------|-----------------|-------------|
| Sonnet capacity error (perturbed-low) | 0.600 (stuck) | 0.086 | 7x better |
| Haiku capacity error (perturbed-low) | 0.288 | 0.148 | 2x better |
| Model improvement detection | Not detected | Detected at t=9,300 | From blind to aware |

## Live benchmark results

We evaluated OCR on 50 prompts spanning 8 commercial domains (e-commerce, SaaS, developer tools, healthcare, fintech, edtech, logistics, HR) routed across 3 pricing tiers:

| Metric | Value |
|--------|-------|
| Cost savings vs. all-Opus baseline | 43.3% |
| Quality preservation | 50/50 responses valid |
| Oracle alignment | 96% |
| Calibration overhead | 2.16% |

OCR correctly routed 23 of 25 simple prompts to the cheapest tier (Haiku), kept all 10 complex prompts on the most expensive tier (Opus), and distributed medium prompts across the middle tiers. The two "misrouted" simple prompts went to Sonnet — conservative but defensible, since they scored near the capacity boundary.

## How it fits into Nadir

OCR is the next evolution of Nadir's routing engine. The current binary classifier is a static router — it's fast and accurate, but it doesn't learn. OCR wraps around it:

- **Static classifier** (what Nadir has today): classifies prompt complexity in ~50ms
- **OCR layer** (what we're adding): adjusts routing based on real response outcomes
- **Thompson Sampling bandit**: selects between models within the same tier based on contextual features

The static classifier doesn't go away. It provides the initial complexity estimate. OCR refines the routing decision by maintaining live capacity estimates for each model, updated from every response.

## What's next

We're integrating OCR into Nadir's hosted platform and open-source router. Key areas we're still working on:

- **Richer quality signals:** OCR currently uses binary valid/invalid. LLM-as-judge scoring could accelerate convergence but adds $0.01-0.05 per evaluation
- **Multi-turn routing:** OCR routes single requests independently. Conversation-level complexity aggregation is a natural extension
- **Top-tier estimation:** The most expensive model can't benefit from calibration probes (nothing cheaper to compare against). We're exploring alternative estimation strategies for the top tier

Read the full paper: **OCR: Closed-Loop LLM Routing via Matched-Timescale Implicit Feedback and Cross-Tier Calibration Probes** (Dor Amir).`,

  "50-prompt-benchmark": `## Setup

We ran 50 diverse prompts through Nadir's binary classifier with these settings:

- **Benchmark model:** Claude Sonnet 4 ($3/1M input, $15/1M output)
- **Available models:** Claude Sonnet, Claude Haiku, GPT-4o, GPT-4o-mini, Gemini 2.0 Flash
- **Analyzer:** Binary classifier (DistilBERT-based)

The prompts were split into three categories: 17 simple, 17 medium, 16 complex.

## Results

| Metric | Value |
|--------|-------|
| Routing accuracy | 96% (48/50 correct) |
| Average latency | 107ms per classification |
| Overall savings | 38% |

### Per-tier breakdown

**Simple prompts (17/17 correct):** All routed to Gemini Flash. 97% savings vs benchmark.

Examples: "What is Python?", "Convert 72F to Celsius", "Is 7 a prime number?"

**Medium prompts (17/17 correct):** Routed to Gemini Flash. 97% savings.

Examples: "Write a Python palindrome checker", "Explain JWT auth step by step", "Write a SQL query for second highest salary"

**Complex prompts (14/16 correct):** 14 stayed on Sonnet, 2 were mis-routed to Flash. Complex prompts stay on the premium model by design, but Context Optimize still compacts their input tokens (minifying JSON, deduplicating tool schemas, normalizing whitespace) before sending to the provider. That's where the 12% savings on this tier comes from.

Examples: "Design a distributed rate limiter", "Architect a real-time collaborative editor", "Implement a B+ tree with insert/delete"

### What got mis-classified

Two complex prompts scored as medium:
- "Implement a garbage collector in Python" - uses familiar keywords ("implement", "Python") without architectural framing
- "Write a compiler frontend for a simple expression language" - "simple" in the prompt text confused the classifier

Both are edge cases where the prompt sounds simpler than the task actually is. We're tuning the classifier to weigh task-type keywords more heavily.

## Raw cost comparison

| Tier | Baseline (all Sonnet) | Routed | Savings | How |
|------|----------------------|--------|---------|-----|
| Simple | $0.0209 | $0.0006 | 97.3% | Routed to Flash |
| Medium | $0.0212 | $0.0006 | 97.3% | Routed to Flash |
| Complex | $0.0978 | $0.0859 | 12.1% | Stayed on Sonnet + Context Optimize |
| **Total** | **$0.1399** | **$0.0871** | **37.7%** | **Routing + Context Optimize** |

## What this means

If you spend $5,000/month on LLM APIs and your prompt mix is roughly 1/3 simple, 1/3 medium, 1/3 complex, Nadir saves you around $1,900/month. Complex prompts stay on premium. You don't lose quality where it matters.`,

  "context-optimize-savings": `## The problem

Agentic coding sessions are expensive because of bloated context. Every turn in a conversation accumulates:
- Repeated tool schemas (the same function definitions sent every time)
- Pretty-printed JSON (indented with whitespace that costs tokens)
- Duplicate system prompts across turns
- Old conversation history that's no longer relevant

With Claude Opus at $15/1M input tokens, this adds up fast.

## What Context Optimize does

All transforms are lossless. Zero semantic degradation. The LLM receives the same information, just compacted:

| Transform | What it does |
|-----------|-------------|
| JSON minification | Removes whitespace, newlines from JSON values |
| Tool schema dedup | Replaces repeated tool definitions with references |
| System prompt dedup | Removes duplicated instructions across turns |
| Whitespace normalization | Collapses blanks, preserves code indentation |
| Chat history trimming | Keeps system + first + last N turns |

## Benchmark results (Claude Opus)

| Scenario | Before (tokens) | After | Saved | $/1K requests |
|----------|---------------:|------:|------:|---------------:|
| Agentic coding (8 turns, 5 tools) | 3,657 | 1,573 | 57.0% | $31.26 |
| RAG pipeline (6 chunks) | 544 | 386 | 29.0% | $2.37 |
| API response analysis (nested JSON) | 1,634 | 616 | 62.3% | $15.27 |
| Long debug session (50 turns) | 3,856 | 1,414 | 63.3% | $36.63 |
| OpenAPI spec context (5 endpoints) | 2,649 | 762 | 71.2% | $28.30 |
| **Total** | **12,340** | **4,751** | **61.5%** | **$113.84** |

The biggest wins come from agentic sessions with repeated tool schemas and long debug sessions with JSON logs.

## How to enable it

Context Optimize runs in safe mode by default. Add it to your API key config or enable it globally:

\`\`\`yaml
layers:
  optimize: safe  # lossless transforms only
\`\`\`

The aggressive mode (semantic dedup, embedding-based redundancy removal) is available on the Pro plan.`,

  "why-we-built-nadir": `## The $0.45 docstring

Last year I was using Claude Opus for a coding project. Great model. But then I looked at my API bill and noticed something: a significant chunk of my spend was on prompts like:

- "Write a docstring for this function"
- "What does HTTP 404 mean?"
- "Convert this to TypeScript"

These prompts were hitting Opus at $15/1M input tokens. They could have been handled by Haiku at $0.80/1M or Gemini Flash at $0.075/1M. Same quality output, 20-200x cheaper.

## The manual approach doesn't work

I tried switching models manually. The problem: you don't know the complexity of a prompt until you've read it. And in agentic workflows (Claude Code, Cursor, Aider), the model is called hundreds of times automatically. You can't manually pick the model for each call.

## What we built

Nadir sits between your app and the LLM providers. It classifies each prompt in ~50ms using a DistilBERT-based classifier, then routes to the cheapest model that can handle it:

- **Simple** (status checks, formatting, basic Q&A) - Gemini Flash / Haiku
- **Medium** (code generation, explanations) - GPT-4o-mini / Haiku
- **Complex** (architecture, debugging, reasoning) - stays on your premium model

The classifier runs locally. Your API keys never leave your machine. No third-party proxy.

## Why open source

We're MIT licensed because we think model routing should be infrastructure, not a service that can pull the plug on you. Self-host it, fork it, contribute to it. If you want a hosted version with extra features, that's what the Pro plan is for.`,

  "how-binary-classifier-works": `## Architecture overview

Nadir's binary classifier has three stages:

1. **Embedding** - DistilBERT encodes the prompt into a 384-dim vector (~10ms)
2. **Centroid matching** - Compare against learned centroids for simple/medium/complex (~1ms)
3. **Tier assignment** - Map complexity tier to model selection (~0ms)

Total: ~50-100ms classification overhead.

## Stage 1: Embedding

We use \`sentence-transformers/all-MiniLM-L6-v2\` to encode prompts. It runs locally on CPU, no GPU needed. The model is 22MB and loads in ~2 seconds on startup.

Why not a larger model? Because the embedding is just for classification, not generation. MiniLM-L6 captures enough semantic signal to distinguish "what is 2+2" from "design a distributed system" reliably.

## Stage 2: Centroid matching

During training, we compute centroid embeddings for each complexity tier from labeled examples. At inference time, we compute cosine similarity between the prompt embedding and each centroid.

The classifier outputs:
- **Tier probabilities:** e.g., simple=0.99, medium=0.003, complex=0.003
- **Confidence score:** 0.0 (simple) to 1.0 (complex)
- **Tier name:** simple / medium / complex

## Stage 3: Model selection

The tier maps to a model selection strategy:

| Tier | Strategy | Example models |
|------|----------|----------------|
| Simple (score < 0.2) | Cheapest available | Gemini Flash, GPT-3.5 |
| Medium (0.2 - 0.7) | Mid-tier | GPT-4o-mini, Haiku |
| Complex (score > 0.7) | Premium (benchmark model) | Sonnet, GPT-4o, Opus |

The ranker filters available models by the user's allowed list, then sorts by cost within the tier.

## Accuracy

On our 50-prompt benchmark: 96% accuracy. The two errors were complex prompts that used simple-sounding language. We're working on a heuristic layer that detects task-type keywords (implement, design, architect) to catch these edge cases.

## What's next

We're training a confidence-aware analyzer that escalates uncertain classifications to a secondary check. If the primary classifier scores between 0.3-0.7, it runs a lightweight keyword analysis before committing to a tier. This should push accuracy above 98%.`,

  "nadir-vs-always-premium": `## When Nadir helps most

**High volume, mixed complexity:** If you're making 1000+ API calls/day and many are simple lookups, formatting, or basic Q&A, routing saves the most. Typical savings: 30-47%, depending on your simple-to-complex mix.

**Agentic workflows:** Claude Code, Cursor, Aider - these tools make hundreds of calls per session. Many are simple (read file, check status). Routing + context optimization can cut costs 50%+.

**BYOK setups:** When you bring your own API keys, Nadir just routes. You pay provider prices directly with zero markup.

## When to stick with one model

**All-complex workloads:** If every prompt is a complex reasoning task (legal analysis, medical diagnosis), routing won't help. Everything stays on premium anyway.

**Latency-critical paths:** The 50-100ms classification overhead matters if you're in a real-time pipeline where every millisecond counts. For most use cases, this is negligible.

**Small volume:** If you're spending <$50/month on LLM APIs, the operational overhead of running Nadir isn't worth the savings.

## The math

| Monthly spend | Prompt mix | Savings | Net after Nadir fee |
|---------------|-----------|---------|---------------------|
| $500 | 60% simple, 30% medium, 10% complex | ~$180 | ~$135 |
| $2,000 | 40% simple, 40% medium, 20% complex | ~$640 | ~$480 |
| $10,000 | 30% simple, 40% medium, 30% complex | ~$2,800 | ~$2,100 |

## Bottom line

If your workload has a mix of simple and complex prompts, Nadir pays for itself from day one. If everything you do needs premium reasoning, save yourself the setup.`,
};

export class BlogService {
  static getAllPosts(): BlogPostMetadata[] {
    return blogPostsMetadata.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  static getPostById(id: string): BlogPost | null {
    const metadata = blogPostsMetadata.find((post) => post.id === id);
    if (!metadata) return null;

    return {
      ...metadata,
      content: blogContent[id] || "",
    };
  }

  static formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
}
