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
    id: "routing-without-verification-dead-reckoning",
    title: "Routing without verification is dead-reckoning",
    date: "2026-05-27",
    author: "Dor Amir",
    excerpt: "Every LLM router on the market reads the prompt and predicts which model will handle it. Not Diamond, Martian, OpenRouter rules, hand-rolled regex — same shape, same blind spot. When the router picks wrong, the user eats the bad response. Verifier-gated cascade reads the cheap-model answer before it ships. Same cost reduction, recoverable mistakes, 98% of always-Opus quality preserved on RouterBench held-out.",
    thumbnail: "Architecture",
    tags: ["Routing", "Verifier", "RouterBench", "Architecture", "2026 Trends"],
    readingTime: "7 min read",
  },
  {
    id: "finops-ai-98-percent-manage-spend-visibility-gap",
    title: "98% of FinOps teams now manage AI spend. Most still cannot see where the tokens go.",
    date: "2026-05-26",
    author: "Dor Amir",
    excerpt: "The FinOps Foundation surveyed 1,192 organizations managing $83 billion in cloud spend. Two years ago, 31% of FinOps teams managed AI costs. Today, 98% do. But their top challenge is the same one most engineering teams face: they cannot see token-level costs per request, per feature, or per user. The tooling gap between cloud cost management and AI cost management is where the waste hides.",
    thumbnail: "Research",
    tags: ["FinOps", "Cost Optimization", "Observability", "AI Infrastructure", "2026 Trends"],
    readingTime: "8 min read",
  },
  {
    id: "microsoft-cancelled-claude-code-ai-coding-cost-crisis",
    title: "Microsoft cancelled its Claude Code licenses. The AI coding cost crisis is here.",
    date: "2026-05-25",
    author: "Dor Amir",
    excerpt: "Microsoft is pulling Claude Code from its Experiences and Devices division by June 30, 2026. Uber burned its entire AI budget in four months. Meta built an internal leaderboard called Claudeonomics to track token spend across 85,000 employees. The pattern is the same everywhere: agentic coding tools hit frontier models for every call, and the bill grows faster than the budget. The fix is not to use AI less. It is to route each call to the cheapest model that can handle it.",
    thumbnail: "Deep Dive",
    tags: ["Cost Optimization", "Agentic AI", "Microsoft", "Routing", "2026 Trends"],
    readingTime: "9 min read",
  },
  {
    id: "enterprise-seven-models-no-routing-layer",
    title: "The average enterprise runs 7 AI models. Most have no routing layer.",
    date: "2026-05-22",
    author: "Dor Amir",
    excerpt: "F5 surveyed 1,800 organizations and found that 78% now run AI inference in production, operating an average of seven models. But most route every request the same way: to whatever model the developer hardcoded last quarter. IDC predicts 70% of top AI enterprises will use dynamic model routing by 2028. The gap between multi-model adoption and multi-model routing is where the money leaks.",
    thumbnail: "Research",
    tags: ["Enterprise", "Multi-Model", "Routing", "AI Infrastructure", "2026 Trends"],
    readingTime: "8 min read",
  },
  {
    id: "uber-burned-ai-budget-four-months",
    title: "Uber burned its 2026 AI budget in four months. Here is what the per-developer numbers look like.",
    date: "2026-05-21",
    author: "Dor Amir",
    excerpt: "Uber's 5,000-engineer org exhausted its entire 2026 AI budget by April after Claude Code adoption jumped from 32% to 84%. Per-developer costs ran $500 to $2,000 per month. They are not alone. Pragmatic Engineer reports AI spending 10x'd in six months across the industry, and DX's survey shows engineering leaders planned for $500 to $1,000 per developer per year while actual costs are running $3,000 or more. The root cause is the same everywhere: every coding agent call hits a frontier model, whether it needs one or not.",
    thumbnail: "Deep Dive",
    tags: ["Cost Optimization", "Engineering Budgets", "Agentic AI", "Routing", "2026 Trends"],
    readingTime: "8 min read",
  },
  {
    id: "coding-agents-burn-1000x-tokens-research",
    title: "Coding agents burn 1,000x more tokens than chat. Stanford and Microsoft measured where the money goes.",
    date: "2026-05-20",
    author: "Dor Amir",
    excerpt: "A joint Stanford and Microsoft study analyzed 8 frontier LLMs on SWE-bench and found that coding agents consume 1,000x more tokens than chat. Runs on the same task vary by 30x, and spending more tokens does not improve accuracy. 40 to 60% of input tokens are removable waste. The research confirms what routing practitioners already knew: your agent bill is a model selection problem, not a token volume problem.",
    thumbnail: "Research",
    tags: ["Agentic AI", "Research", "Cost Optimization", "Token Optimization", "2026 Trends"],
    readingTime: "9 min read",
  },
  {
    id: "flat-rate-ai-over-metered-billing",
    title: "Flat-rate AI is over. Anthropic, GitHub, and Cursor all moved to metered billing in 30 days.",
    date: "2026-05-19",
    author: "Dor Amir",
    excerpt: "In May 2026, Anthropic split agent usage into a metered credit pool. GitHub Copilot switched to usage-based AI Credits. Cursor shipped its own model at 1/10th the cost of frontier APIs. The flat-rate era is ending because agentic workloads consume 50x more tokens than chat. Every token now has a price tag, and routing is the most direct lever to control the bill.",
    thumbnail: "Deep Dive",
    tags: ["Pricing", "AI Billing", "Cost Optimization", "2026 Trends", "Routing"],
    readingTime: "8 min read",
  },
  {
    id: "deepseek-v4-pricing-war-routing",
    title: "DeepSeek V4 costs 1/7th of Opus 4.7. The routing math just changed.",
    date: "2026-05-18",
    author: "Dor Amir",
    excerpt: "DeepSeek V4 matches frontier benchmarks at $1.74/$3.48 per million tokens. Opus 4.7 and GPT-5.5 still charge $5/$25 and above. The output token gap is 7x. For teams running mixed-complexity workloads, the savings from routing simple queries to cheaper models just got dramatically larger. We break down the new pricing math and what it means for your bill.",
    thumbnail: "Deep Dive",
    tags: ["Cost Optimization", "DeepSeek", "Pricing", "Routing", "2026 Trends"],
    readingTime: "7 min read",
  },
  {
    id: "github-ai-agent-token-waste",
    title: "GitHub's AI agents wasted 37% of their tokens. Yours probably waste more.",
    date: "2026-05-15",
    author: "Dor Amir",
    excerpt: "In April 2026, GitHub audited token consumption across its agentic workflows and found that 37% of tokens were waste. Unused tool schemas, LLM calls for deterministic work, and unpruned context were the top offenders. We break down what they found, how they fixed it, and how to run the same audit on your own stack.",
    thumbnail: "Deep Dive",
    tags: ["Agentic AI", "Token Optimization", "Cost Optimization", "GitHub", "2026 Trends"],
    readingTime: "8 min read",
  },
  {
    id: "finops-for-ai-cost-governance",
    title: "56% of AI teams have no cost guardrails. Here is what the other 44% do.",
    date: "2026-05-14",
    author: "Dor Amir",
    excerpt: "The FinOps Foundation surveyed 1,192 organizations managing $83 billion in cloud spend. Fewer than half have financial guardrails for AI. The ones that do spend 3.2x less per completed task. We break down the five practices that separate governed AI spend from ungoverned.",
    thumbnail: "Research",
    tags: ["FinOps", "Cost Optimization", "Enterprise", "2026 Trends"],
    readingTime: "7 min read",
  },
  {
    id: "ai-jevons-paradox-token-costs",
    title: "Tokens got 280x cheaper. Your AI bill still tripled. Here is why.",
    date: "2026-05-13",
    author: "Dor Amir",
    excerpt: "Between 2024 and 2026, per-token prices fell by 99.7%. Enterprise AI spend tripled to $37 billion anyway. The culprit is the Jevons Paradox applied to inference: cheaper tokens made agentic workflows viable, and agentic workflows consume 5 to 30x more tokens per task. We break down the real numbers and the only lever that actually fixes the bill.",
    thumbnail: "Deep Dive",
    tags: ["Cost Optimization", "Jevons Paradox", "Agentic AI", "2026 Trends"],
    readingTime: "8 min read",
  },
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
    id: "routerbench-cascade-benchmark",
    title: "Verifier-gated cascade on RouterBench: 60% cheaper, 98% of always-Opus quality preserved",
    date: "2026-05-26",
    author: "Dor Amir",
    excerpt: "We ran 11,420 held-out RouterBench triples through Nadir's verifier-gated cascade. The cheap model answers first; a calibrated verifier (AUROC 0.961, ECE 0.016) scores it before we ship; on rejection, escalate to Sonnet or Opus. Here are the raw numbers, the threshold sweep, and what changes when you read the cheap answer before you commit to it.",
    thumbnail: "Benchmark",
    tags: ["Benchmark", "Cost Savings", "RouterBench", "Verifier"],
    readingTime: "6 min read",
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
  "routing-without-verification-dead-reckoning": `## The blind spot every LLM router shares

Every LLM router on the market looks at the prompt and predicts which model will handle it. Not Diamond trains a meta-classifier on your traffic and returns a recommendation. Martian does similar. OpenRouter and Portkey leave the prediction to your fallback config. Hand-rolled routers use regex or keyword rules. Different implementations, identical shape: read the input, guess the model, ship the answer the guess produced.

When the guess is right, you save money. When the guess is wrong, the user eats a bad response. The router never finds out.

That is dead-reckoning. You hold a heading, you assume the wind, you commit. If the wind shifts you arrive somewhere else. There is no instrument that tells you whether you arrived where you intended.

## What "verifier-gated cascade" changes

The architectural shift is one extra step: read the cheap-model answer before you ship it.

1. The pre-classifier reads the prompt. Confident cheap routes ship from Haiku immediately. That covers most traffic, under 10 ms overhead.
2. Borderline prompts get the Haiku answer scored by a calibrated verifier.
3. If the verifier accepts (score above tau), ship the cheap answer.
4. If the verifier rejects, escalate to Sonnet, or to Opus on Sonnet rejection.

The verifier never sees the Opus output. Its only job is deciding whether the cheap answer is good enough to leave alone. That is a much smaller, much more tractable scoring problem than predicting model fit from the prompt alone, and it generalizes better off-distribution.

On 11,420 RouterBench held-out triples, verifier AUROC is 0.961 and calibration ECE is 0.016. The verifier knows what it knows.

## Predicted vs verified: same cost, different failure mode

Run a prompt-only classifier and a verifier-gated cascade on the same held-out split at matched cost:

| Strategy | Cost (x) | Catastrophic | Quality preserved |
|---|---:|---:|---:|
| Always-Opus | 12.0x | 0% | 100% |
| Prompt-only classifier | 4.8x | 3.4% | 96.6% |
| **Verifier-gated cascade** | **4.7x** | **1.7%** | **98.3%** |
| Always-Haiku | 1.0x | 26.0% | 74.0% |

Same cost. Half the quality drops. The mechanism that produces the gap is the verification step. Reading the cheap-model answer turns "we predicted this prompt was easy" into "we predicted this prompt was easy and the cheap model in fact produced a passing answer." Different claim, different reliability.

A prompt-only router maxes out at the ceiling of how well any model can predict outcome from input alone. That ceiling sits around 96-97% on RouterBench-class evals. The verifier breaks the ceiling because it reads the output, not the input.

## Why this is the architectural wedge

The competing router products lead with cost. So do we, eventually. But the buyer concern that actually blocks the purchase is quality: "If I switch, will my users get worse answers?" A router that predicts model fit cannot answer this honestly. It can show eval results and cross its fingers that your traffic looks like its eval. The verifier-gated cascade can: the verifier is in the loop on every borderline request, so quality drops are caught and surfaced, not absorbed silently.

Lead with quality preservation, not cost. ND and Martian lead with cost. The wedge for the buyer is "I will not be punished for switching." Once they trust the quality story, the 60% cost number lands.

## The tradeoff, said honestly

The verifier adds 180 ms when it runs. Most requests skip it because the pre-classifier is confident, so the average added latency is much smaller, but the borderline path pays this cost. We think 180 ms on the slow path to avoid shipping a bad Haiku answer is the right tradeoff for production LLM workloads. If your application is in a tight loop where 180 ms is the difference between viable and not, you are probably better served by always-Haiku with manual escalation rules, and you should not be reading this post.

The verifier is also currently trained on RouterBench-derived signal. RouterBench covers a wide distribution of public LLM tasks, but it is not your traffic. If your prompt distribution is meaningfully different (deep agentic, narrow vertical, heavily multilingual), the verifier may need on-distribution calibration. The OCR closed loop in production is already wired to do this from your live response signal.

## What we are publishing next

A direct head-to-head against notdiamond-0001 on the same RouterBench held-out split. Both routers, same triples, same metric. Until that artifact is public, we will say "the closest competitor on routing claims" and let the architectural difference do the rest of the work. After it is public, we will lead with the head-to-head number.

## How to try it

Two-line change. Swap your base URL to \`https://api.getnadir.com\`. Set \`model="auto"\`. BYOK on every tier including Free. The verifier ships with the image; the version is stamped on every response as \`x-nadir-classifier-sha\`. The eval JSONs that produce the numbers in this post are in the public repo.

You do not have to pick the threshold. The production cascade ships with a sane default. You can read the full threshold sweep in [the RouterBench cascade benchmark](/blog/routerbench-cascade-benchmark).`,

  "finops-ai-98-percent-manage-spend-visibility-gap": `## Two years ago, 31% of FinOps teams managed AI spend. Today, 98% do.

The FinOps Foundation's sixth annual State of FinOps report surveyed 1,192 respondents representing over $83 billion in annual cloud spend. The headline finding on AI is stark: in 2024, 31% of FinOps practitioners managed AI costs. In 2025, that number hit 63%. In 2026, 98% expect to manage AI spend within the year.

FinOps for AI is now the top forward-looking priority across organizations of all sizes.

This is not a gradual trend. It is a phase change. AI spend went from a niche concern to a universal one in 24 months. The question is no longer whether finance teams track AI costs. It is whether they can actually see them.

[Source: FinOps Foundation, "State of FinOps 2026 Report," 2026](https://data.finops.org/)

[Source: CloudKeeper, "State of FinOps 2026 Report: Key Trends, Insights, and What Comes Next"](https://www.cloudkeeper.com/insights/blog/state-finops-2026-report-key-trends-insights-and-what-comes-next)

## The #1 challenge: visibility into where the tokens go.

The report identifies three interconnected challenges when extending FinOps to AI workloads. The top one is visibility.

Practitioners cannot see AI costs at the level of detail they need. Cloud FinOps has years of tooling for tracking provisioned resources priced per hour or per GB. AI FinOps is different. A single workflow might hit an inference API, a vector database, a tool API, and a GPU cluster for fine-tuning. Each has its own pricing model, billing cycle, and unit of measure. Token-based LLM billing does not look like anything in the traditional cloud cost stack.

The second challenge is allocation. AI usage is embedded inside product features, internal workflows, and agent chains that cross teams and systems. Attributing cost to a business unit requires tagging at the request level, not the service level.

The third is ROI. Without per-request cost data, teams cannot calculate what a feature, customer, or transaction actually costs in inference spend. They know the total bill. They do not know which parts of the product are driving it.

The top tooling request in the entire 2026 survey is granular monitoring of AI spend: tokens, LLM requests, and GPU utilization. Commercial tooling has not yet delivered this at scale.

[Source: Virtasant, "State of FinOps 2026 Signals Expansive Future for Practitioners"](https://www.virtasant.com/blog/state-of-finops-2026)

[Source: USU, "6 Takeaways from the State of FinOps Report 2026"](https://www.usu.com/en/blog/6-takeaways-from-the-state-of-finops-report-2026)

## The gap between cloud FinOps and AI FinOps is structural.

Cloud FinOps is a solved problem in 2026. Teams know how to track EC2 hours, S3 storage, and Lambda invocations. The billing data is granular, the tagging is standardized, and the tooling is mature.

AI FinOps is at the stage cloud FinOps was in 2018. The billing data exists but it is aggregated at the wrong level. A monthly Anthropic invoice tells you total tokens consumed across all API keys. It does not tell you which feature consumed them, which user triggered them, or which requests could have gone to a cheaper model.

The unit economics question is especially pointed for LLM inference. Cloud compute has relatively stable per-unit costs. LLM inference costs vary by model, by prompt length, by output length, by whether the input was cached, and by whether the request was batched. A single API call to Claude Opus 4.7 can cost 25x more than the same call to Haiku 4.5, depending on output length. Without per-request tracking, teams cannot tell which model handled which request or what it cost.

This is why the FinOps Foundation updated its framework in 2026 to include AI-specific categories. The old framework assumed provisioned resources with predictable pricing. The new one accounts for consumption-based billing where cost per unit fluctuates with every request.

[Source: FinOps Foundation, "FinOps Framework 2026: Executive Strategy, Technology Categories, and Converging Disciplines"](https://www.finops.org/insights/2026-finops-framework/)

## Organizations are being asked to self-fund AI through optimization savings.

The report surfaces a dynamic that many engineering leads will recognize. Organizations are being told to fund AI investments by finding savings in their existing cloud footprint. The logic: optimize what you already spend, and redirect the freed-up budget to AI initiatives.

This creates a direct feedback loop. The faster you reduce waste in your AI inference bill, the more budget you have for AI expansion. But you cannot reduce waste you cannot see. Without per-request cost visibility, optimization is guesswork. You can negotiate volume discounts with your provider. You can set hard budget caps. But you cannot identify which requests are overpaying for model capability they do not need.

This is the difference between FinOps (governance and visibility) and cost optimization (routing and model selection). FinOps tells you how much you spent. Optimization decides how much you should have spent. The State of FinOps report covers the first. The second requires a routing layer.

## What per-request visibility actually looks like.

The tooling gap the report identifies has a specific shape. Here is what teams need and what most do not have:

**1. Per-request model attribution.** Which model handled each API call? If your application sends \`model="auto"\` or uses a gateway, did the request go to Opus, Sonnet, or Haiku? Without this, you cannot calculate cost per request accurately. Different models have 5x to 25x price differences on the same prompt.

**2. Per-request cost calculation.** Input tokens, output tokens, cached tokens, and the model-specific rate for each. This needs to happen at the request level, not aggregated by day or by API key. A daily aggregate hides the distribution. Ten cheap requests and one expensive one average out to a medium cost that describes none of them.

**3. Per-request savings attribution.** If you are routing, how much did each routing decision save compared to the default (most expensive) model? This is the number that justifies the routing layer. Without it, you are trusting the vendor's benchmark instead of measuring your own workload.

**4. Metadata tagging at the request level.** User ID, feature name, environment, team. This is what makes allocation possible. The FinOps Foundation's report says allocation is the second-hardest challenge. It is hard because the data is not tagged at the right granularity.

**5. Real-time access, not batch reports.** Monthly invoices and weekly dashboards are not fast enough to catch anomalies. An agent loop that burns $30 on a $0.50 task needs to be visible within minutes, not at the end of the billing cycle.

The FinOps tooling vendors (Vantage, Amnic, Finout) are building toward this. Vantage launched LLM Token Allocation in private preview in 2026, joining token observability data to cost rows with per-model, per-team, and per-customer allocation. But most of these tools sit outside the request path. They ingest billing data after the fact.

[Source: Vantage, "AI Cost Observability: Measuring and Justifying Token Spend in 2026"](https://www.vantage.sh/blog/finops-for-ai-token-costs)

## The routing layer is the observability layer.

There is a simpler path to per-request visibility. If every API call goes through a routing proxy, the proxy can log per-request cost data as a side effect of routing.

This is not a novel insight. It is how cloud cost management evolved. AWS did not ship cost allocation tags on day one. Third-party tools and API gateways added the metadata that made FinOps possible. The same pattern is playing out for AI inference, but faster, because the billing model (per-token, variable by model) makes visibility even more critical.

A routing layer that sits between your application and the LLM provider sees every request. It knows the model, the token counts, the cost, and the routing decision. It can tag each request with application metadata (user, feature, environment) and expose per-request cost data in real time.

The FinOps Foundation's report says the #1 missing feature is granular monitoring of AI spend. A routing proxy that logs per-request cost data delivers exactly that, as a byproduct of making the routing decision.

## The numbers on what visibility enables.

Enterprise data from the AICC's analysis of 2.4 billion API calls shows the impact of combining visibility with routing. Organizations that implemented intelligent multi-model routing achieved median blended costs of $2.31 per million tokens, compared to $18.40 for frontier-only deployments. That is an 87% reduction.

But the reduction did not come from routing alone. It came from routing informed by visibility. Teams that could see per-request cost data identified which request types were overpaying for model capability. They set routing thresholds based on observed quality, not assumptions. They measured the actual savings per routing decision and adjusted.

The FinOps Foundation's earlier survey of 1,192 organizations found that teams with financial guardrails for AI spend 3.2x less per completed task than teams without. The guardrails are only as good as the data feeding them.

IDC predicts that by 2028, 70% of top AI-driven enterprises will use dynamic model routing. The prediction implicitly assumes per-request cost visibility as a prerequisite. You cannot route dynamically if you cannot see what each route costs.

[Source: AICC, "Enterprise Token Costs Drop 67% Year-Over-Year as Multi-Model AI Adoption Hits Record High," May 2026](https://www.einpresswire.com/article/911544568/aicc-report-enterprise-token-costs-drop-67-year-over-year-as-multi-model-ai-adoption-hits-record-high)

[Source: IDC Blog, "Why the Future of AI Lies in Model Routing," November 2025](https://blogs.idc.com/2025/11/17/the-future-of-ai-is-model-routing/)

## Three things engineering teams should do now.

**1. Instrument per-request token costs today.** Do not wait for your FinOps tool to ship an AI module. Log input tokens, output tokens, model, and cost for every LLM API call. A week of data is enough to identify your top cost drivers. Most teams discover that 50 to 70% of their token spend goes to requests that did not need a frontier model.

**2. Tag requests with business metadata.** User ID, feature name, team, environment. Without tags, you can see total cost but not cost per feature or cost per customer. The allocation problem the FinOps report identifies is a tagging problem. Solve it at the request level and the aggregation follows.

**3. Route based on what you see.** Once you have per-request cost data, the routing decisions become obvious. Classification requests going to Opus at $5/$25 per million tokens should go to Haiku at $1/$5. Formatting and summarization do not need frontier reasoning. A trained classifier can make these decisions in under 10 ms per request, but the visibility comes first.

## Where Nadir fits.

Nadir is a routing proxy that also solves the visibility problem the FinOps Foundation identified.

Every request through Nadir returns per-request response headers: \`x-nadir-routed-to\` (which model handled the request), \`x-nadir-cost-usd\` (what it cost), \`x-nadir-cost-saved\` (what was saved versus the default model), and \`x-nadir-latency-ms\` (routing overhead). The dashboard aggregates these by day, week, month, feature, and API key.

This is the granular monitoring that 98% of FinOps teams say they need. It ships as a side effect of the two-line integration: change the base URL, set \`model="auto"\`. No separate observability pipeline. No CSV uploads. No private preview waitlist.

For teams that need to show finance where the AI budget is going, per-request cost headers are the answer. For teams that need to reduce that budget, routing is the answer. They are the same integration.

---

*Sources: [FinOps Foundation, "State of FinOps 2026 Report"](https://data.finops.org/) (2026). [CloudKeeper, "State of FinOps 2026 Report: Key Trends, Insights, and What Comes Next"](https://www.cloudkeeper.com/insights/blog/state-finops-2026-report-key-trends-insights-and-what-comes-next). [Virtasant, "State of FinOps 2026 Signals Expansive Future for Practitioners"](https://www.virtasant.com/blog/state-of-finops-2026). [USU, "6 Takeaways from the State of FinOps Report 2026"](https://www.usu.com/en/blog/6-takeaways-from-the-state-of-finops-report-2026). [FinOps Foundation, "FinOps Framework 2026"](https://www.finops.org/insights/2026-finops-framework/). [Vantage, "AI Cost Observability: Measuring and Justifying Token Spend in 2026"](https://www.vantage.sh/blog/finops-for-ai-token-costs). [AICC, "Enterprise Token Costs Drop 67%"](https://www.einpresswire.com/article/911544568/aicc-report-enterprise-token-costs-drop-67-year-over-year-as-multi-model-ai-adoption-hits-record-high) (May 2026). [IDC Blog, "Why the Future of AI Lies in Model Routing"](https://blogs.idc.com/2025/11/17/the-future-of-ai-is-model-routing/) (November 2025).*`,
  "microsoft-cancelled-claude-code-ai-coding-cost-crisis": `## Microsoft is pulling Claude Code. The reason is the bill.

In mid-May 2026, Microsoft began cancelling most internal Claude Code licenses across its Experiences and Devices division. The directive covers thousands of engineers working on Windows, Microsoft 365, Teams, Outlook, and Surface. Access ends June 30, 2026. Developers are being redirected to GitHub Copilot CLI.

The pilot launched in December 2025. By May, adoption had spread well beyond engineering to product managers and designers. The tool was popular. It was also expensive. Microsoft's financial year ends June 30, and the Claude Code line item was hard to defend at enterprise scale.

Microsoft framed the move as platform standardization. The financial pressure tells the rest of the story.

[Source: Windows Central, "Microsoft cancels Claude Code licenses, shifting developers to GitHub Copilot CLI," May 2026](https://www.windowscentral.com/microsoft/microsoft-cancels-claude-code-licenses-shifting-developers-to-github-copilot-cli-a-move-likely-driven-by-financial-motives)

[Source: Crypto Briefing, "Microsoft cancels Claude Code licenses as AI costs surge across the industry," May 2026](https://cryptobriefing.com/microsoft-cancels-claude-code-ai-costs/)

## Microsoft is not alone. This is an industry pattern.

Uber burned through its entire 2026 AI budget by April. Claude Code adoption jumped from 32% to 84% across a 5,000-engineer organization in three months. Per-developer costs ran $500 to $2,000 per month for heavy users. The CTO had to revisit financial assumptions after spending exceeded projections by a wide margin.

[Source: The Information, "Uber CTO Shows How Claude Code Can Blow Up AI Budgets," May 2026](https://www.theinformation.com/newsletters/applied-ai/uber-cto-shows-claude-code-can-blow-ai-budgets)

At Amazon, the internal culture went the opposite direction. Employees were encouraged to maximize token consumption in a practice they called "tokenmaxxing." The bet was that heavy AI usage would drive enough productivity to justify the cost. The bill is still being tallied.

At Meta, an employee built an internal leaderboard called "Claudeonomics" that ranked the company's roughly 85,000 workers by token consumption. In a 30-day window, total usage on the dashboard exceeded 60 trillion tokens.

[Source: Tom's Hardware, "AI cost crisis hits tech giants as employee tokenmaxxing backfires," May 2026](https://www.tomshardware.com/tech-industry/artificial-intelligence/ai-cost-crisis-hits-tech-giants-as-employee-tokenmaxxing-backfires-agentic-ai-eats-up-to-1000x-more-tokens-than-standard-ai-sparks-corporate-pullback-at-microsoft-meta-and-amazon)

[Source: Fortune, "Microsoft reports are exposing AI's real cost problem," May 2026](https://fortune.com/2026/05/22/microsoft-ai-cost-problem-tokens-agents/)

## The numbers across the industry tell the same story.

The Pragmatic Engineer newsletter tracked AI agent spending surging roughly 10x in six months at some organizations. Individual developers report monthly bills between $500 and $2,000. One company profiled went from $200 per developer per month to $3,000 for a seven-person team.

DX surveyed engineering leaders on their 2026 AI budgets. When asked about 2025 spending, 38.4% of leaders reported $101 to $500 per developer per year. For 2026, most planned to allocate 1% to 3% of their engineering budget to AI tools. Actual costs are running $3,000 or more per developer per year. That is 3x to 6x what most leaders budgeted.

[Source: DX, "How are engineering leaders approaching 2026 AI tooling budgets?"](https://getdx.com/blog/how-are-engineering-leaders-approaching-2026-ai-tooling-budget/)

Gartner's May 2026 report estimates the enterprise AI coding agent market at $9.8 billion to $11 billion annualized. AI agent cost overruns are a top concern among IT executives, with most attributing the overruns to increased usage under consumption-based pricing.

[Source: Gartner, "The market for enterprise AI coding agents is entering a new phase," May 2026](https://www.gartner.com/en/newsroom/press-releases/2026-05-20-gartner-says-the-market-for-enterprise-ai-coding-agents-is-entering-a-new-phase-of-expansion-and-competitive-realignment)

Software vendors are also adding their own pressure. AI-driven renewals are raising enterprise software prices 20% to 37% through forced SKU migrations and credit-based pricing. The "AI tax" is compounding on top of the token bill.

[Source: Tropic, "The AI Tax: How AI Is Driving Software Price Increases," 2026](https://www.tropicapp.io/blog/ai-tax)

## Why the bill grows faster than the budget.

The root cause is straightforward. Every call in every agentic coding session hits a frontier model. File reads, status checks, linting, formatting, classification, and simple code generation all go to Opus or GPT-5 at $5 to $25 per million tokens. The model does not distinguish between a request that requires deep reasoning and one that Haiku could handle at $1 per million tokens.

Agentic workflows consume 1,000x more tokens than chat. Stanford and Microsoft Research documented this in their study of eight frontier LLMs on SWE-bench. Runs on the same task vary by 30x. Spending more tokens does not improve accuracy. 40% to 60% of input tokens are removable waste.

The math is counterintuitive but consistent. Per-token prices have fallen 99.7% since 2024. Enterprise AI spend tripled to $37 billion anyway. Cheaper tokens made agentic workflows viable. Agentic workflows consume 5x to 30x more tokens per task than the chatbots they replaced. Volume growth outpaced price cuts.

Goldman Sachs projects this will accelerate. Their forecast calls for a 24x increase in token consumption by 2030, reaching 120 quadrillion tokens per month. If consumption grows faster than unit costs fall, the bill gets worse, not better.

[Source: Goldman Sachs, "AI Agents Forecast to Boost Tech Cash Flow as Usage Soars," May 2026](https://www.goldmansachs.com/insights/articles/ai-agents-forecast-to-boost-tech-cash-flow-as-usage-soars)

[Source: Stanford/Microsoft Research, "How Do AI Agents Spend Your Money?", arXiv:2604.22750, April 2026](https://arxiv.org/abs/2604.22750)

## The fix is not to use AI less. It is to route each call.

Microsoft's answer was to cancel licenses and consolidate on a cheaper tool. That is one approach. It trades capability for cost control. It does not address the underlying problem: uniform model selection.

The underlying problem is that every API call, regardless of complexity, goes to the most expensive model. File reads go to Opus. Status checks go to Opus. Simple code generation goes to Opus. The 60% to 70% of calls that do not need a frontier model get billed at frontier rates anyway.

Enterprise data shows what happens when you fix this. Between Q1 2025 and Q1 2026, organizations that implemented tiered routing achieved median blended costs of $2.31 per million tokens, compared to $18.40 for frontier-only deployments. That is an 87% reduction. Multi-model routing is now used by 42% of enterprises, up from single digits a year ago.

[Source: AICC, "Enterprise Token Costs Drop 67% Year-Over-Year," May 2026](https://www.einpresswire.com/article/911544568/aicc-report-enterprise-token-costs-drop-67-year-over-year-as-multi-model-ai-adoption-hits-record-high)

Augment Code published routing data specific to coding agent workflows. Their analysis shows three-tier Claude routing (Opus for architecture decisions, Sonnet for implementation, Haiku for file navigation and classification) saves 51% compared to uniform Opus deployment.

[Source: Augment Code, "Best AI Model for Coding Agents in 2026: A Routing Guide"](https://www.augmentcode.com/guides/ai-model-routing-guide)

## What the Microsoft math looks like with routing.

Microsoft's Experiences and Devices division has thousands of engineers. Assume 3,000 active Claude Code users at an average of $300 per month (conservative, given industry data showing $500 to $2,000 for heavy users). That is $900,000 per month, or $10.8 million per year.

If 60% of agentic coding calls are low complexity and route to Haiku at $1/$5 per million tokens instead of Opus at $5/$25, the blended cost drops 40% to 50%. That turns $900,000 per month into $450,000 to $540,000. The annual savings are $4.3 to $5.4 million.

Microsoft chose to cancel licenses instead. The engineers still need AI coding tools. They will use Copilot CLI, which also runs on token-based pricing under the hood. The cost problem did not go away. It moved.

## What engineering leaders should do instead.

**1. Audit the complexity breakdown.** Most teams do not know what percentage of their agentic calls actually need a frontier model. Instrument a week of traffic. Classify each call by complexity. GitHub found 37% of their agentic tokens were pure waste. Independent analyses show 60% to 70% of calls do not need Opus or GPT-5.

**2. Route per call, not per tool.** The model that plans architecture changes is not the model that should read file listings. A trained classifier that evaluates each API call independently and routes to the cheapest capable model captures the pricing gap on the majority of calls. Augment Code's data shows 51% savings from three-tier routing alone.

**3. Budget with routing in the forecast.** DX's survey shows engineering leaders planned for $500 to $1,000 per developer per year. Actual costs are running $3,000 or more. With routing, a realistic budget is $1,000 to $1,500 per developer per year. Without routing, plan for $3,000 or more and expect to blow through it.

**4. Do not cancel the tool. Fix the model selection.** Microsoft's approach trades capability for cost control. Routing preserves the capability (frontier models for tasks that need them) while cutting cost on the 60% to 70% of calls that do not.

## Where Nadir fits.

Nadir routes each API call through a trained classifier in under 10 ms. Haiku for file reads and classification. Sonnet for implementation. Opus only when the prompt actually needs deep reasoning. The integration is two lines: change the base URL, set \`model="auto"\`.

Per-request response headers (\`x-nadir-routed-to\`, \`x-nadir-cost-saved\`, \`x-nadir-cost-usd\`) show exactly where each call went and what it saved. The dashboard aggregates savings by day, week, and month. No instrumentation beyond the two-line change.

For teams watching their AI coding budget evaporate, routing is the most direct lever. It does not require changing tools, rewriting prompts, or downgrading model quality on the requests that actually need it. The requests that do not need a frontier model stop being billed at frontier rates.

---

*Sources: [Windows Central, "Microsoft cancels Claude Code licenses"](https://www.windowscentral.com/microsoft/microsoft-cancels-claude-code-licenses-shifting-developers-to-github-copilot-cli-a-move-likely-driven-by-financial-motives) (May 2026). [Crypto Briefing, "Microsoft cancels Claude Code licenses as AI costs surge"](https://cryptobriefing.com/microsoft-cancels-claude-code-ai-costs/) (May 2026). [Tom's Hardware, "AI cost crisis hits tech giants as employee tokenmaxxing backfires"](https://www.tomshardware.com/tech-industry/artificial-intelligence/ai-cost-crisis-hits-tech-giants-as-employee-tokenmaxxing-backfires-agentic-ai-eats-up-to-1000x-more-tokens-than-standard-ai-sparks-corporate-pullback-at-microsoft-meta-and-amazon) (May 2026). [Fortune, "Microsoft reports are exposing AI's real cost problem"](https://fortune.com/2026/05/22/microsoft-ai-cost-problem-tokens-agents/) (May 2026). [The Information, "Uber CTO Shows How Claude Code Can Blow Up AI Budgets"](https://www.theinformation.com/newsletters/applied-ai/uber-cto-shows-claude-code-can-blow-ai-budgets) (May 2026). [DX, "How are engineering leaders approaching 2026 AI tooling budgets?"](https://getdx.com/blog/how-are-engineering-leaders-approaching-2026-ai-tooling-budget/). [Gartner, "Enterprise AI coding agents market"](https://www.gartner.com/en/newsroom/press-releases/2026-05-20-gartner-says-the-market-for-enterprise-ai-coding-agents-is-entering-a-new-phase-of-expansion-and-competitive-realignment) (May 2026). [Goldman Sachs, "AI Agents Forecast"](https://www.goldmansachs.com/insights/articles/ai-agents-forecast-to-boost-tech-cash-flow-as-usage-soars) (May 2026). [Stanford/Microsoft Research, arXiv:2604.22750](https://arxiv.org/abs/2604.22750) (April 2026). [AICC, "Enterprise Token Costs Drop 67%"](https://www.einpresswire.com/article/911544568/aicc-report-enterprise-token-costs-drop-67-year-over-year-as-multi-model-ai-adoption-hits-record-high) (May 2026). [Augment Code, "AI Model Routing Guide"](https://www.augmentcode.com/guides/ai-model-routing-guide). [Tropic, "The AI Tax"](https://www.tropicapp.io/blog/ai-tax) (2026).*`,
  "enterprise-seven-models-no-routing-layer": `## Enterprises adopted multi-model AI. They forgot the routing layer.

F5's 2026 State of Application Strategy Report surveyed 1,800 organizations across every major industry vertical. The headline finding: 78% of enterprises now run AI inference as a core production operation. Not experiments. Not pilots. Production workloads handling real traffic.

The average organization operates seven AI models in production or active evaluation. For 77% of respondents, inference (not training or fine-tuning) is the dominant AI activity. Only 8% rely exclusively on a single public AI service.

[Source: F5, "AI Has Left the Lab: F5 Report Reveals 78% of Enterprises Now Run AI Inference as a Core Operation," May 2026](https://www.f5.com/company/news/press-releases/enterprises-now-run-ai-inference-as-core-operation)

[Source: Help Net Security, "Multi-model AI is creating a routing headache for enterprises," May 2026](https://www.helpnetsecurity.com/2026/05/07/f5-ai-inference-operations-report/)

## Seven models, one routing strategy: send everything to the most expensive one.

Having seven models available does not mean seven models are being used well. Most enterprises adopted new models opportunistically. A team evaluated GPT-5, another team integrated Claude, a third team picked up an open-source model for a batch pipeline. Each team hardcoded their model choice.

The result is a multi-model portfolio with single-model routing. Every request within a given application still goes to whichever model the original developer chose. There is no per-request evaluation of whether a cheaper model could handle the task.

F5's data confirms this gap. While 52% of organizations chain or orchestrate multiple AI models together, the chaining is mostly sequential (model A processes, then model B refines). It is not cost-aware routing where each request is independently evaluated and sent to the cheapest capable model.

The report describes the operational challenge directly: enterprises are expanding traffic management, identity controls, observability, and routing systems for multiple AI models across hybrid environments. But expanding infrastructure to support multiple models is not the same as routing intelligently between them.

[Source: F5, "F5 Report 2026: AI inferencing has arrived, complicating an already complex IT landscape," May 2026](https://www.f5.com/company/blog/f5-report-2026-ai-inferencing-has-arrived-complicating-an-already-complex-it-landscape)

## The cost of the gap.

The numbers from the AICC's analysis of 2.4 billion API calls show what happens on both sides of this divide.

Enterprises that adopted intelligent multi-model routing achieved a median 71% cost reduction compared to single-provider deployments. The top quartile hit reductions exceeding 80%. The effective blended cost per million tokens dropped from $18.40 to $6.07 across the dataset, a 67% year-over-year decline.

But routing optimization accounted for an estimated 34 percentage points of that 67% drop. The rest came from model price cuts (DeepSeek V4, Gemini Flash, open-source competition). Meaning: enterprises that got cheaper models but did not route to them captured roughly half the available savings. The other half required a routing decision at the request level.

Open-source and open-weight models captured 38% of enterprise token volume in Q1 2026, up from 11% in Q1 2025. That is a 245% share increase in twelve months. But having cheap models in your portfolio only helps if your application actually sends requests to them when they are the right fit.

[Source: AICC, "Enterprise Token Costs Drop 67% Year-Over-Year as Multi-Model AI Adoption Hits Record High," May 2026](https://www.einpresswire.com/article/911544568/aicc-report-enterprise-token-costs-drop-67-year-over-year-as-multi-model-ai-adoption-hits-record-high)

## IDC says routing is where this is going.

IDC's AI and Automation FutureScape predicts that by 2028, 70% of top AI-driven enterprises will use advanced multi-tool architectures to dynamically and autonomously manage model routing across diverse models.

That prediction implies that today, in mid-2026, significantly fewer than 70% have this in place. The gap between multi-model adoption (widespread) and dynamic model routing (early) is where the excess spend lives.

IDC frames the value of routing as threefold: performance optimization (selecting the most context-appropriate model per request), cost reduction (routing commodity tasks to commodity models), and insulation from technology churn (swapping models without rewriting applications).

The third point matters more than teams realize. Model pricing changes every quarter. New models launch monthly. A routing layer absorbs these shifts. A hardcoded model choice does not.

[Source: IDC Blog, "Why the Future of AI Lies in Model Routing," November 2025](https://blogs.idc.com/2025/11/17/the-future-of-ai-is-model-routing/)

## Deloitte calls it "the AI infrastructure reckoning."

Deloitte's 2026 Tech Trends report dedicated an entire section to what they call the AI infrastructure reckoning. The core argument: inference costs dropped 280-fold over two years, but enterprise AI spending kept climbing because cheaper tokens made agentic workflows viable, and agentic workflows consume 5 to 30x more tokens per task.

The math is counterintuitive but consistent. Per-token prices fell 99.7%. Total inference spend tripled to $37 billion. The culprit is volume. When tokens get cheap enough, teams deploy agents, chains, and orchestrated workflows that consume orders of magnitude more tokens than the chatbots they replaced.

Deloitte's prescription includes a three-tier hybrid model: public cloud for elastic training, private infrastructure for predictable high-volume inference, and edge computing for latency-critical decisions. But underneath the infrastructure layer, the routing question remains. Which model handles which request? The infrastructure tier does not answer that. The routing layer does.

[Source: Deloitte, "The AI infrastructure reckoning: Optimizing compute strategy in the age of inference economics," Tech Trends 2026](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends/2026/ai-infrastructure-compute-strategy.html)

## What a routing layer needs to do in a 7-model world.

When you operate one or two models, you can get away with if-else routing. Model A for one use case, Model B for another. The routing logic fits in 20 lines.

At seven models, that breaks down. The combinatorics of model capabilities, pricing tiers, latency profiles, and task types exceed what static rules can handle. F5's report noted that 93% of surveyed organizations operate in hybrid multicloud environments, with 86% distributing applications across on-premises, public cloud, and colocation. Every inference request becomes a routing decision weighed against cost, accuracy, availability, latency, and geographic constraints.

A production routing layer at this scale needs four things:

**1. Per-request classification.** Each API call is evaluated independently. A trained classifier that reads the prompt and outputs a complexity tier in under 10 ms. Not prompt length. Not keyword matching. Semantic complexity.

**2. Cost-aware model selection.** Given the complexity tier, the router selects the cheapest model that meets the quality threshold. This requires a live pricing table and performance data per model per tier.

**3. Automatic failover.** When a provider goes down (and they all do), the router retries against the next model in the chain. The application never sees the failure.

**4. Per-request observability.** Every routing decision is logged with the model selected, the cost incurred, the cost saved versus the default model, and the latency added. Without this, you cannot validate that routing is actually working.

Static rules cannot adapt when a new model launches with better price-performance on mid-tier tasks. A trained classifier, retrained on observed outcomes, can.

## The gap is closing, but slowly.

The trajectory is clear. Multi-model adoption happened in 2025. Multi-model routing is happening in 2026. By 2028, IDC expects it to be standard at top AI enterprises.

The question for engineering teams running seven models today is whether they wait for routing to become standard or capture the savings now. The AICC data says the difference is 34 percentage points of cost reduction. On a $50,000 per month inference bill, that is $17,000 per month, or $204,000 per year.

## Where Nadir fits.

Nadir is a routing layer purpose-built for this problem. A trained classifier evaluates each API call in under 10 ms and routes to the cheapest model that can handle it. Integration is two lines: change the base URL, set \`model="auto"\`.

Per-request response headers (\`x-nadir-routed-to\`, \`x-nadir-cost-saved\`, \`x-nadir-cost-usd\`, \`x-nadir-latency-ms\`) give the observability that F5's report identifies as a gap. The dashboard aggregates savings by day, week, and month. No instrumentation beyond the two-line change.

For teams that already have multiple models available but route by developer preference instead of task complexity, Nadir turns a multi-model portfolio into a multi-model routing strategy. The models you already pay for start earning their keep.

---

*Sources: [F5, "AI Has Left the Lab: 78% of Enterprises Now Run AI Inference as a Core Operation"](https://www.f5.com/company/news/press-releases/enterprises-now-run-ai-inference-as-core-operation) (May 2026). [F5, "F5 Report 2026: AI inferencing has arrived"](https://www.f5.com/company/blog/f5-report-2026-ai-inferencing-has-arrived-complicating-an-already-complex-it-landscape) (May 2026). [Help Net Security, "Multi-model AI is creating a routing headache for enterprises"](https://www.helpnetsecurity.com/2026/05/07/f5-ai-inference-operations-report/) (May 2026). [AICC, "Enterprise Token Costs Drop 67% Year-Over-Year"](https://www.einpresswire.com/article/911544568/aicc-report-enterprise-token-costs-drop-67-year-over-year-as-multi-model-ai-adoption-hits-record-high) (May 2026). [IDC Blog, "Why the Future of AI Lies in Model Routing"](https://blogs.idc.com/2025/11/17/the-future-of-ai-is-model-routing/) (November 2025). [Deloitte, "The AI infrastructure reckoning"](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends/2026/ai-infrastructure-compute-strategy.html) (2026).*`,
  "uber-burned-ai-budget-four-months": `## Uber's AI budget lasted four months.

In early 2026, Uber rolled out Claude Code access to its full 5,000-engineer organization. Adoption moved fast. By March, 84% of engineers were classified as agentic coding users, up from 32% at launch in December 2025. Nearly 95% of Uber engineers used AI tools every month. Around 70% of committed code came from those systems.

Then the bill arrived. Uber's CTO Praveen Neppalli Naga told The Information that the company had to revisit its financial assumptions after spending exceeded projections much earlier than expected. The entire 2026 AI budget was exhausted by April.

Per-developer costs ranged from $150 to $250 per month on average, but heavy users ran $500 to $2,000 per month. No FinOps playbook existed for token-based billing at that scale.

[Source: The Information, "Uber CTO Shows How Claude Code Can Blow Up AI Budgets," May 2026](https://www.theinformation.com/newsletters/applied-ai/uber-cto-shows-claude-code-can-blow-ai-budgets)

[Source: Startup Fortune, "Uber Burned Its Entire 2026 AI Budget in Four Months," May 2026](https://startupfortune.com/uber-burned-its-entire-2026-ai-budget-in-four-months-and-claude-code-is-why-finance-teams-should-be-worried/)

## This is not just an Uber problem.

The Pragmatic Engineer newsletter has been tracking the same pattern across multiple companies. AI agent spending has surged roughly 10x in six months at some organizations. One company profiled went from $200 per developer per month to $3,000 per developer per month for a seven-person team. Some individual developers are spending $500 a day on Claude Code alone.

[Source: The Pragmatic Engineer, "The Pulse: AI token spending out of control," 2026](https://newsletter.pragmaticengineer.com/p/the-pulse-ai-token-spending-out-of)

DX's survey of engineering leaders tells the planning side of the story. When asked about their 2025 spending, 38.4% of leaders reported spending $101 to $500 per developer per year on AI tools. Only 10.5% were spending over $1,000. For 2026, many planned to allocate 1 to 3% of their total engineering budgets.

The actual numbers blew past those plans. DX now estimates the realistic floor at $500 to $1,000 per developer per year, with multi-vendor setups pushing costs to $3,000 or more. That is 3 to 6x what most leaders budgeted.

[Source: DX, "How are engineering leaders approaching 2026 AI tooling budgets?"](https://getdx.com/blog/how-are-engineering-leaders-approaching-2026-ai-tooling-budget/)

Deloitte's January 2026 report, "The Pivot to Tokenomics," confirmed the trend at the enterprise level. AI has become the single fastest-growing line item in corporate technology budgets, consuming a quarter to one-half of IT spend at some firms. Cloud bills are up 19% year over year, driven almost entirely by generative AI workloads.

[Source: Deloitte Insights, "AI tokens: How to navigate AI's new spend dynamics," January 2026](https://www.deloitte.com/us/en/insights/topics/emerging-technologies/ai-tokens-how-to-navigate-spend-dynamics.html)

## The root cause is uniform model selection.

The spending explosion has a straightforward explanation. Every call in every agentic coding session hits a frontier model. File reads, status checks, linting, formatting, classification, and simple code generation all go to Opus or GPT-5.5. The model does not distinguish between a request that requires deep reasoning and one that could be handled by a model costing 5 to 10x less.

Developer surveys back this up. A study tracking 42 agent runs on a FastAPI codebase found 70% of tokens were waste from reading too many files, failed attempts, and verbose tool output. A separate analysis found 87% of tokens went to finding code, not writing it. In both cases, the wasted tokens were billed at frontier rates.

Token cost volatility topped the pain points in a Q1 2026 developer survey at 42%. Monthly bills swing 2 to 3x quarter over quarter because agentic workloads are inherently stochastic. The same task can cost 30x more on one run than another, as Stanford and Microsoft Research documented in their study of coding agent token consumption.

The pattern repeats at every scale. Individual developers hit subscription limits and switch to API pricing, where costs balloon further. Teams adopt multiple tools (Claude Code, Cursor, Copilot) and pay for overlapping coverage. Organizations set annual budgets based on 2025 usage patterns and blow through them in Q1 when agentic adoption takes off.

## The data on what routing changes.

The fix is not to use cheaper models for everything. Sonnet 4.6 delivers 99% of Opus 4.6's performance on SWE-bench (79.6% vs 80.8%), but there are tasks where that 1.2 percentage points matters. The fix is to stop sending every request to the most expensive model.

Augment Code published a routing guide in 2026 that breaks coding agent workflows into roles: Opus for coordination and architecture decisions, Sonnet for implementation, Haiku for file navigation and classification. Their data shows three-tier Claude routing saves 51% compared to uniform Opus deployment.

[Source: Augment Code, "Best AI Model for Coding Agents in 2026: A Routing Guide"](https://www.augmentcode.com/guides/ai-model-routing-guide)

Enterprise data tells the same story at a larger scale. Between Q1 2025 and Q1 2026, average enterprise cost per million tokens fell from $18.40 to $6.07. Token price cuts explain roughly half. The other half came from multi-model routing, now used by 42% of enterprises. The average number of models per enterprise account grew from 2.1 to 4.7 in that period.

[Source: Open Source For You, "Enterprise AI Costs Crash 67% As Open Source Models And Multi-Model Routing Go Mainstream," May 2026](https://www.opensourceforu.com/2026/05/enterprise-ai-costs-crash-67-as-open-source-models-and-multi-model-routing-go-mainstream/)

Organizations that fully implemented tiered routing architectures achieved median blended costs of $2.31 per million tokens, compared to $18.40 for frontier-only deployments. That is an 87.4% reduction.

## What the Uber math looks like with routing.

Take Uber's numbers. 5,000 engineers, $150 to $250 per developer per month average, $500 to $2,000 for heavy users. Call it $1 million per month total at the midpoint.

If 60% of agentic coding calls are low complexity (file reads, simple edits, formatting, classification) and route to Haiku at $1/$5 per million tokens instead of Opus at $5/$25, the blended cost drops by 40 to 50%. That turns $1 million per month into $500,000 to $600,000. The annual difference is $4.8 to $6 million.

That is not a theoretical number. It is the same range the enterprise data shows. Teams with tiered routing pay roughly half what teams with uniform model selection pay, and the quality gap on routed requests is within measurement noise for the tasks being routed.

The per-developer math is equally direct. A heavy user spending $1,500 per month on uniform Opus usage drops to $750 to $900 with routing. A team of seven spending $3,000 per developer per month drops to $1,500 to $1,800. The budget that was supposed to last a year lasts a year.

## Three things engineering leaders should do now.

**1. Audit where tokens actually go.** Most teams do not know the complexity breakdown of their agentic workloads. Instrument a week of production traffic. Classify each call by complexity. The data will almost certainly show that 50 to 70% of calls do not need a frontier model. GitHub found 37% of their agentic tokens were pure waste. Your number is probably similar.

**2. Route per call, not per session.** The model that plans architecture changes is not the model that should read file listings. A trained classifier that evaluates each API call independently and routes to the cheapest capable model captures the gap between frontier and commodity pricing on the majority of calls. Static rules based on prompt length or keyword matching drift as workloads change. A classifier trained on observed outcomes adapts.

**3. Set per-developer budgets with routing in the loop.** DX's survey shows most engineering leaders are still planning AI budgets based on subscription sticker prices. That does not work when heavy users run $500 to $2,000 per month in token costs. Budget at the per-developer level, and include routing savings in the forecast. A realistic 2026 budget with routing is $1,000 to $1,500 per developer per year. Without routing, plan for $3,000 or more.

## Where Nadir fits.

Nadir routes each API call through a trained classifier in under 10 ms. For coding agent workloads where the majority of calls are low to mid complexity, this means most of your traffic hits Haiku or Sonnet pricing instead of Opus pricing. The integration is two lines: change the base URL, set \`model="auto"\`.

Per-request response headers (\`x-nadir-routed-to\`, \`x-nadir-cost-saved\`, \`x-nadir-cost-usd\`) show exactly where each call was routed and what it saved. The dashboard aggregates savings by day, week, and month. No instrumentation needed beyond the two-line change.

For teams staring at AI budgets that are tracking 3 to 6x above plan, routing is the most direct lever that does not require changing tools, rewriting prompts, or downgrading model quality on the requests that actually need it.

---

*Sources: [The Information, "Uber CTO Shows How Claude Code Can Blow Up AI Budgets"](https://www.theinformation.com/newsletters/applied-ai/uber-cto-shows-claude-code-can-blow-ai-budgets) (May 2026). [Startup Fortune, "Uber Burned Its Entire 2026 AI Budget in Four Months"](https://startupfortune.com/uber-burned-its-entire-2026-ai-budget-in-four-months-and-claude-code-is-why-finance-teams-should-be-worried/) (May 2026). [The Pragmatic Engineer, "The Pulse: AI token spending out of control"](https://newsletter.pragmaticengineer.com/p/the-pulse-ai-token-spending-out-of) (2026). [DX, "How are engineering leaders approaching 2026 AI tooling budgets?"](https://getdx.com/blog/how-are-engineering-leaders-approaching-2026-ai-tooling-budget/). [Deloitte Insights, "AI tokens: How to navigate AI's new spend dynamics"](https://www.deloitte.com/us/en/insights/topics/emerging-technologies/ai-tokens-how-to-navigate-spend-dynamics.html) (January 2026). [Augment Code, "Best AI Model for Coding Agents in 2026: A Routing Guide"](https://www.augmentcode.com/guides/ai-model-routing-guide). [Open Source For You, "Enterprise AI Costs Crash 67%"](https://www.opensourceforu.com/2026/05/enterprise-ai-costs-crash-67-as-open-source-models-and-multi-model-routing-go-mainstream/) (May 2026). [Stanford/Microsoft Research, "How Do AI Agents Spend Your Money?" arXiv:2604.22750](https://arxiv.org/abs/2604.22750) (April 2026). Anthropic, OpenAI model pricing as of May 2026.*`,
  "coding-agents-burn-1000x-tokens-research": `## The first systematic study of agent token spending is here.

In April 2026, researchers from Stanford's Digital Economy Lab and Microsoft Research published the first large-scale empirical study of how coding agents actually consume tokens. The paper, "How Do AI Agents Spend Your Money?", analyzed trajectories from eight frontier LLMs on SWE-bench Verified, the standard benchmark for real-world software engineering tasks.

The findings are worth reading carefully if you pay for LLM inference at scale. Not because the numbers are surprising (practitioners already suspected most of this), but because the study puts hard data behind patterns that were previously anecdotal.

[Source: Stanford Digital Economy Lab / Microsoft Research, "How Do AI Agents Spend Your Money? Analyzing and Predicting Token Consumption in Agentic Coding Tasks," arXiv:2604.22750, April 2026](https://arxiv.org/abs/2604.22750)

## Finding 1: Coding agents use 1,000x more tokens than chat.

This is the headline number. Agentic coding tasks consume roughly 1,000 times more tokens than conversational code reasoning or code chat. The gap exists because agents loop: they read files, call tools, interpret results, make changes, verify, and repeat. Each loop iteration sends the full accumulated context back through the model.

A chat interaction is a prompt and a response. An agentic task is 10 to 50 API calls, each carrying the full history of every previous call. Input tokens, not output tokens, drive the cost. The study found that input token volume is the primary determinant of total spend in agentic workflows.

This tracks with what GitHub found when they audited their own agentic systems earlier this year (37% of tokens were waste) and with independent analyses showing that agentic sessions average 1 to 3.5 million tokens per task including retries.

## Finding 2: The same task can cost 30x more on one run than another.

Token consumption in agentic coding is highly stochastic. The study found that repeated runs of the same agent on the same task can differ by up to 30x in total token usage. Same model, same prompt, same codebase. Different execution path, wildly different bill.

This happens because agent behavior is non-deterministic. The model might find the right file on the first try or explore five wrong files first. It might generate a correct fix immediately or enter a debug-retry loop that consumes 500,000 additional tokens. The variance is inherent to the agentic paradigm, not a bug in any specific model.

The practical implication: forecasting agent costs from averages is unreliable. A task that costs $0.50 on one run can cost $15 on the next. Budget planning based on average cost per task will underestimate actual spend for any team running agents at scale.

## Finding 3: Spending more tokens does not improve accuracy.

This is the finding that matters most for cost optimization. The study found no meaningful correlation between token consumption and task success. Agents that consumed more tokens were not more likely to solve the task correctly.

In other words, the expensive runs are not the productive ones. They are the ones where the agent got lost, explored dead ends, retried failed approaches, or accumulated irrelevant context. The cheapest successful runs were often the most direct: the agent identified the issue, made the fix, and stopped.

This directly challenges the implicit assumption behind "let the agent run until it succeeds" strategies. Giving an agent more budget does not make it smarter. It makes it more expensive. The quality of the routing decision (which model handles which task) matters more than the token budget allocated to each task.

## Finding 4: Models vary dramatically in token efficiency.

Not all models consume tokens at the same rate on the same tasks. The study found that on identical SWE-bench tasks, some models consumed over 1.5 million more tokens than others. The gap is not explained by accuracy. In several cases, more token-efficient models also achieved higher solve rates.

This is a model selection problem, not a prompt engineering problem. Two frontier models given the same task and the same tools can differ by millions of tokens in total consumption. The cost difference at $5 per million input tokens is $7.50 or more per task, before accounting for output tokens.

The implication for teams choosing a default agent model: benchmark token efficiency alongside accuracy. A model that scores 2 percentage points lower on SWE-bench but uses 40% fewer tokens per task will cost dramatically less at production scale. And at 500+ tasks per day, "dramatically less" means tens of thousands of dollars per month.

## Finding 5: Models cannot predict their own costs.

The researchers asked each model to estimate its own token consumption before executing a task. The correlation between predicted and actual consumption was weak to moderate, peaking at 0.39. Models systematically underestimated what they would actually spend.

This matters for pre-routing and budget allocation. If you are using an LLM to classify task difficulty as an input to routing decisions, the model's self-assessment of "how hard is this" is not a reliable proxy for "how many tokens will this consume." The study also found that human expert assessments of task difficulty only weakly correlated with actual token costs. Humans and models both misjudge the computational effort agents expend.

Effective routing needs a purpose-built classifier trained on observed token consumption and task outcomes, not self-reported difficulty estimates. The classifier has to learn the mapping between prompt characteristics and actual routing cost from historical data, not from the model's introspection.

## Parallel research: 40 to 60% of agent tokens are removable.

The Stanford/Microsoft study measured the problem. Other recent work measured the solution.

AgentDiet, a trajectory reduction framework evaluated on SWE-bench Verified, demonstrated that 39.9 to 59.7% of input tokens in coding agent runs can be removed with no measurable loss in task accuracy. The cost reduction: 21.1 to 35.9% of total computational spend.

[Source: "Reducing Cost of LLM Agents with Trajectory Reduction," arXiv:2509.23586](https://arxiv.org/abs/2509.23586)

The waste categories:
- **Stale context.** File listings, error messages, and tool outputs from early turns that are no longer relevant by turn 20+.
- **Redundant tool schemas.** Full JSON schemas for every registered tool re-sent on every API call, even when most tools are irrelevant to the current step.
- **Uncompressed tool output.** Raw JSON payloads, whitespace, and verbose formatting that can be minified without information loss.
- **Failed attempt history.** Full traces of approaches that did not work, carried forward as context for the rest of the session.

A separate study, Squeez (task-conditioned tool-output pruning), found that extracting only the relevant evidence block from each tool observation, while discarding the rest, reduces token volume with no performance loss on downstream agent decisions.

[Source: "Squeez: Task-Conditioned Tool-Output Pruning for Coding Agents," arXiv:2604.04979](https://arxiv.org/abs/2604.04979)

These are not marginal improvements. Cutting 40 to 60% of input tokens on a 2-million-token agentic session saves 800,000 to 1,200,000 tokens per task. At $5 per million input tokens, that is $4 to $6 per task. At 500 tasks per day, that is $2,000 to $3,000 per day, or $60,000 to $90,000 per month.

## What this means for your agent architecture.

The research converges on a clear picture: coding agents are expensive not because the work is hard, but because the execution is wasteful. Most tokens are spent finding things, not doing things. Most retries do not need a frontier model. Most context carried forward is stale.

Three levers move the needle:

**1. Route per turn, not per session.** The study confirms that not every API call in an agentic session requires the same model. File reads, status checks, and output formatting do not need Opus. Error parsing and simple code generation do not need Opus. A classifier that evaluates each turn independently and routes to the cheapest capable model captures the efficiency gap the researchers measured between models.

**2. Compress context aggressively.** The 40 to 60% removable token finding from AgentDiet is conservative for long sessions. Minifying JSON, deduplicating schemas, and summarizing stale turns can cut input tokens substantially without affecting the agent's ability to complete the task. Every token removed from context saves money on every subsequent turn, because agentic sessions are cumulative.

**3. Scope tools per step.** Every tool schema sent to the model is input tokens billed at full rate. An agent with 40 registered tools pays for 40 tool definitions on every API call, even when only 3 are relevant. Narrowing tool registrations to the current step reduces the fixed cost per turn.

## Where Nadir fits.

Nadir addresses the first lever directly. The trained classifier evaluates each API call in under 10 ms and routes to the cheapest model that can handle it. For agentic workloads where 60 to 70% of turns are low complexity, this means the majority of your turns hit Haiku-class pricing ($1 per million input tokens) instead of Opus-class pricing ($5 per million).

The research validates this approach from multiple angles:
- More tokens does not equal better results, so routing to a cheaper model on low-complexity turns does not degrade outcomes.
- Models vary dramatically in efficiency, so selecting the right model per turn is the highest-leverage cost decision.
- Self-assessment of difficulty is unreliable, so routing needs a trained classifier, not the model's own judgment.

The integration is two lines. Change the base URL, set \`model="auto"\`. Per-request response headers (\`x-nadir-routed-to\`, \`x-nadir-cost-saved\`) show exactly where each turn was routed and what it saved.

For teams running coding agents at production scale, the Stanford/Microsoft data makes the case clearly: the cheapest token is the one you never send, and the next cheapest is the one routed to the right model.

---

*Sources: [Stanford Digital Economy Lab / Microsoft Research, "How Do AI Agents Spend Your Money?" arXiv:2604.22750](https://arxiv.org/abs/2604.22750) (April 2026). [AgentDiet, "Reducing Cost of LLM Agents with Trajectory Reduction," arXiv:2509.23586](https://arxiv.org/abs/2509.23586). [Squeez, "Task-Conditioned Tool-Output Pruning for Coding Agents," arXiv:2604.04979](https://arxiv.org/abs/2604.04979). [GitHub Blog, "How we reduced token consumption in GitHub Agentic Workflows by 37%"](https://github.blog/engineering/how-we-reduced-token-consumption-in-github-agentic-workflows-by-37/) (April 2026). [Artificial Analysis, "Coding Agent Index"](https://artificialanalysis.ai/agents/coding-agents) (May 2026). Anthropic, OpenAI model pricing as of May 2026.*`,
  "flat-rate-ai-over-metered-billing": `## The subscription-to-metered shift happened in 30 days.

In April and May 2026, three things happened within weeks of each other:

1. GitHub announced that Copilot is moving to usage-based "AI Credits" billing on June 1.
2. Anthropic split Claude Code and agent usage into a separate credit pool billed at full API rates, effective June 15.
3. Cursor shipped Composer 2.5, an in-house model that costs 1/10th of frontier APIs, because even they could not stomach the per-token math.

Each story looks different on the surface. Underneath, they all point to the same structural shift: flat-rate AI access is ending. Every token is getting a price tag. And the teams that route intelligently will pay a fraction of what everyone else pays.

## What happened at GitHub

GitHub Copilot launched in 2022 as a $10/month subscription. Use it as much as you want. That deal is expiring.

Starting June 1, 2026, Copilot moves to usage-based billing. Each plan gets monthly "AI Credits" equal to its price: $10 for Pro, $19 for Business, $39 for Enterprise. Usage gets calculated based on actual token consumption at published per-model API rates. Code completions and Next Edit Suggestions stay free. Everything else, chat, CLI, agents, and Spaces, consumes credits.

The developer reaction was not enthusiastic. Visual Studio Magazine's coverage captured the sentiment: you pay the same price, but you get less.

The calculus changed because of agents. A code completion is a few hundred tokens. An agentic coding session can burn tens of thousands. GitHub cannot offer unlimited agentic compute at $10/month and stay profitable. So they metered it.

[Source: GitHub Blog, "GitHub Copilot is moving to usage-based billing"](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)

## What happened at Anthropic

On May 14, 2026, Anthropic announced that all programmatic and agent usage of Claude will be separated from the standard subscription pool. This includes the Agent SDK, \`claude -p\`, GitHub Actions, and third-party integrations like Zed and OpenClaw. Starting June 15, agent usage draws from a dedicated "Agent SDK Credit Pool" billed at full API rates.

The credit caps: $20/month on Pro, $100/month on Max 5x, $200/month on Max 20x. No rollover.

The backstory is instructive. Some Max subscribers were running $1,000 to $5,000 worth of agent compute per month on a $200 subscription. That is a 5x to 25x arbitrage. Anthropic closed it.

For teams building with Claude's API directly, this changes nothing. They were already paying per token. But it signals something important: even the provider with the most popular coding agent decided that unlimited agentic access is unsustainable at flat-rate pricing.

[Source: Axios, "Anthropic tightens Claude limits as OpenAI courts agent users," May 14, 2026](https://www.axios.com/2026/05/14/anthropic-claude-price-openai-tokens)

[Source: InfoWorld, "Anthropic puts Claude agents on a meter," May 2026](https://www.infoworld.com/article/4171274/anthropic-puts-claude-agents-on-a-meter-across-its-subscriptions.html)

## What happened at Cursor

Cursor took a different approach to the same problem. Instead of metering access to frontier models, they built their own.

On May 18, 2026, Cursor released Composer 2.5, an in-house coding model built on Moonshot's open-source Kimi K2.5 checkpoint. It costs $0.50/$2.50 per million tokens (input/output), compared to $5/$25 for Claude Opus 4.7. That is a 10x price difference.

On coding benchmarks, Composer 2.5 scores within a few points of Opus 4.7 and GPT-5.5. It hits 79.8% on SWE-Bench Multilingual. A complex refactoring session costs $2 to $5 on Composer 2.5 versus $20 to $50 on Opus 4.7.

This is vertical integration driven by unit economics. Cursor could not keep paying frontier API prices for every coding interaction. So they trained a model that handles most coding tasks at a fraction of the cost.

[Source: Cursor Blog, "Introducing Composer 2.5," May 18, 2026](https://cursor.com/blog/composer-2-5)

## The common thread

These three stories share a single insight: AI at flat-rate pricing does not scale when agents are involved.

A chatbot interaction is a few thousand tokens. An agentic coding session can be 50,000 to 500,000 tokens. When users shift from chat to agents, consumption can jump 50x while the subscription price stays the same. No business model survives that math.

The industry response is playing out in three variants:

| Strategy | Who | How it works |
|----------|-----|-------------|
| Meter everything | GitHub Copilot | Track tokens, charge per consumption, let users manage their budget |
| Segment billing | Anthropic | Keep chat unlimited, cap agent usage at API rates |
| Build cheaper models | Cursor | Train an in-house model at 1/10th the cost so margins work at scale |

All three approaches share one assumption: every token has a cost, and that cost must be passed through or optimized away.

## What this means for teams building with LLM APIs

If you are building AI features, products, or internal tools using LLM APIs, the shift to metered billing does not affect you directly. You were already paying per token. But the industry-wide move validates something important: the per-token cost structure is permanent, and it is expanding to every surface.

The question is not whether tokens will be metered. They already are. The question is how you respond.

There are really only three strategies:

**Use cheaper models for everything.** This works until you hit a task that requires frontier reasoning. Then quality drops and users notice. Cheap models do not throw errors on hard prompts. They return plausible-looking responses that are subtly wrong. You do not notice until a customer reports a bug or someone manually reviews the output.

**Use the best model for everything.** This works until your bill scales linearly with usage and someone in finance asks why you are paying $25 per million output tokens to summarize emails.

**Route each request to the cheapest model that can handle it.** Simple tasks go to Haiku or Flash. Mid-complexity tasks go to Sonnet. Only the genuinely hard problems go to Opus or GPT-5.5. Your bill reflects the actual complexity of your workload, not the price of your most expensive model.

The third strategy is model routing. And the metered-billing era makes it more valuable, not less.

## The routing math in a metered world

A typical mixed workload breaks down like this:

| Complexity tier | Share of requests | Example tasks |
|----------------|-------------------|---------------|
| Simple | 40-50% | Summarization, formatting, classification, extraction |
| Mid-complexity | 30-35% | Multi-step reasoning, code generation, structured analysis |
| Complex | 15-25% | Novel problem-solving, multi-file refactoring, research synthesis |

If you send everything to Claude Opus 4.7 at $5/$25 per million tokens, you pay frontier prices for tasks that Haiku handles at $1/$5 per million tokens.

Route the simple tier to Haiku and the mid tier to Sonnet, and you cut your bill by 40 to 55% with no measurable quality loss on the routed requests. At scale, the difference between routing and not routing can be thousands of dollars per month.

This is not theoretical. On 11,420 held-out RouterBench triples, Nadir's verifier-gated cascade preserves 98% of always-Opus quality at 60% lower cost. The cheap model answers first; a calibrated verifier (AUROC 0.961) scores it before we ship; on rejection we escalate.

## Why this matters more for agentic workloads

Single-request savings are meaningful. Agentic savings are transformative.

An agentic session with 30 turns re-sends the full context on every turn. Input tokens accumulate because each turn pays for all previous context. A session starting at 2,000 input tokens per turn can reach 30,000 by turn 30. Total input across 30 turns: roughly 480,000 tokens. Total output: roughly 150,000, assuming 5,000 per turn.

At Opus 4.7 pricing, that single session costs $6.15. Route even half of those turns to a cheaper model and the cost drops to $3 to $4. Across hundreds of sessions per day, the savings compound into real money.

This is exactly why GitHub metered Copilot and Anthropic capped Agent SDK credits. The per-session cost of agentic compute at frontier pricing is unsustainable at flat rates. And for teams paying API rates directly, routing is the primary lever to keep that cost under control.

## What comes next

The metered-billing trend will accelerate. OpenAI's API has always been usage-based. Anthropic and GitHub just joined for agentic usage. Google will follow. By the end of 2026, every major AI provider will charge per token for agent-class workloads.

This is not a temporary market correction. Agentic workflows consume orders of magnitude more tokens than chat. Providers cannot subsidize that gap with subscription revenue. The math does not work.

For teams building on LLM APIs, the implication is straightforward: your AI bill is now directly proportional to your token consumption. Routing is the most direct lever to reduce that consumption without reducing capability.

The flat-rate era gave teams the luxury of not thinking about cost per request. That luxury is gone.

## Sources

- [GitHub Blog: GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)
- [Visual Studio Magazine: Devs Sound Off on Usage-Based Copilot Pricing](https://visualstudiomagazine.com/articles/2026/04/27/devs-sound-off-on-usage-based-copilot-pricing-change-you-will-get-less-but-pay-the-same-price.aspx)
- [Axios: Anthropic tightens Claude limits as OpenAI courts agent users, May 14, 2026](https://www.axios.com/2026/05/14/anthropic-claude-price-openai-tokens)
- [InfoWorld: Anthropic puts Claude agents on a meter](https://www.infoworld.com/article/4171274/anthropic-puts-claude-agents-on-a-meter-across-its-subscriptions.html)
- [Cursor Blog: Introducing Composer 2.5, May 18, 2026](https://cursor.com/blog/composer-2-5)
- [The Decoder: Cursor's Composer 2.5 matches frontier benchmarks at a fraction of the cost](https://the-decoder.com/cursors-composer-2-5-matches-opus-4-7-and-gpt-5-5-benchmarks-at-a-fraction-of-the-cost/)
- [The Register: Microsoft's GitHub shifts to metered AI billing](https://www.theregister.com/2026/04/28/microsofts_github_shifts_to_metered/)`,
  "deepseek-v4-pricing-war-routing": `## The frontier price gap just blew open.

In May 2026, DeepSeek released V4. It scores within 2 to 3 points of Claude Opus 4.7 and GPT-5.5 on major benchmarks (MMLU-Pro, HumanEval, MATH-500). It costs a fraction of what they charge.

Here is the current pricing for the three frontier-class models:

| Model | Input ($/M tokens) | Output ($/M tokens) | Cached input ($/M tokens) |
|-------|---------------------|----------------------|---------------------------|
| Claude Opus 4.7 | $5.00 | $25.00 | $2.50 |
| GPT-5.5 | $5.00 | $30.00 | $2.50 |
| DeepSeek V4 | $1.74 | $3.48 | $0.435 |

The input price gap is 3x. The output price gap is 7 to 9x. With cached input, DeepSeek V4 costs roughly 1/6th of the US frontier models.

This is not a comparison between a frontier model and a budget model. DeepSeek V4 is a frontier model. It matches Opus 4.7 on reasoning benchmarks, trails by a small margin on creative writing, and leads on several code generation tasks. VentureBeat called it a direct challenge to US frontier pricing.

The question is no longer whether cheaper models can handle serious workloads. They can. The question is which of your requests actually need the $25-per-million-output-tokens model.

## Why the output token gap matters more than the input gap

Most cost discussions focus on input tokens. That made sense when prompts were long and responses were short. It does not hold for 2026 workloads.

Agentic systems generate substantial output. A coding agent that writes files, explains changes, and produces tool calls generates 2 to 5x more output tokens than input tokens on many turns. A RAG system that synthesizes long answers from retrieved context follows the same pattern. Chain-of-thought reasoning, which Opus 4.7 and GPT-5.5 both default to for complex queries, inflates output token counts further.

When output tokens dominate your bill, the 7x gap between DeepSeek V4 ($3.48/M) and Opus 4.7 ($25/M) is the number that matters. On a workload that generates 1 million output tokens per day, the difference is $21.52 per day, or $645 per month, on output alone.

For teams with agentic workloads where output is 3x input, roughly 75% of the total token cost comes from output tokens. The model you choose for output-heavy requests is the single biggest lever on your bill.

## The new routing economics

Intelligent routing has always saved money by sending low-complexity requests to cheaper models. The economics depended on two variables: the price spread between models and the percentage of requests that can safely go to the cheaper tier.

Both variables just shifted in favor of routing.

**The price spread widened.** Before DeepSeek V4, the practical spread between the cheapest capable model and the most expensive was roughly 5x (Haiku at $1/$5 vs. Opus at $5/$25). Now the spread between DeepSeek V4 and Opus 4.7 on output tokens is 7.2x. And DeepSeek V4 is not the floor. With volume discounts, DeepSeek V4-Pro drops to $0.435/$0.87, pushing the output spread to nearly 29x versus Opus 4.7.

**The capable-cheap tier got more capable.** DeepSeek V4 handles tasks that previously required a true frontier model. Code review, multi-step reasoning, structured analysis. This means more of your traffic can safely route to the cheaper tier without quality loss.

Here is what that looks like in practice. Assume a mixed workload of 100,000 requests per month, averaging 1,000 input tokens and 500 output tokens per request:

| Routing strategy | Monthly cost | Savings vs. all-Opus |
|------------------|-------------|----------------------|
| All Opus 4.7 | $1,750 | baseline |
| All DeepSeek V4 | $261 | 85% |
| Routed: 60% DeepSeek V4, 30% Sonnet, 10% Opus | $466 | 73% |
| Routed: 40% Haiku, 30% DeepSeek V4, 20% Sonnet, 10% Opus | $358 | 80% |

The "all DeepSeek V4" row looks tempting. But quality matters. DeepSeek V4 trails Opus 4.7 on specific tasks: nuanced creative writing, complex multi-turn conversations with heavy context, and certain edge cases in code refactoring. The routed strategies preserve quality on hard requests while capturing most of the savings.

## This compounds in agentic workflows

Single-request savings are meaningful. Agentic savings are transformative. Here is why.

An agentic session with 30 turns re-sends the full context on every turn. Input tokens accumulate linearly, but each turn pays for all previous context. A session that starts at 2,000 input tokens per turn can reach 30,000 by turn 30. Total input tokens across 30 turns: roughly 480,000. Total output tokens: roughly 150,000, assuming 5,000 output tokens per turn.

At Opus 4.7 pricing, that single session costs $6.15. At DeepSeek V4 pricing, it costs $1.36. Difference: $4.79 per session.

A team running 500 agentic sessions per day saves $2,395 per day, or $71,850 per month, by routing appropriate sessions to DeepSeek V4 instead of Opus 4.7. Even conservative routing (40% of sessions shifted to the cheaper model) saves $28,740 per month.

The compounding is why agentic workloads are the highest-leverage target for routing. Each incremental turn amplifies the cost difference between models.

## The quality tradeoff is not binary

The temptation is to go all-in on DeepSeek V4 and pocket the 85% savings. Teams that do this will regret it within weeks.

DeepSeek V4 performs within 2 to 3 percentage points of Opus 4.7 on aggregate benchmarks. But benchmarks are averages. Specific tasks show wider gaps:

- **Complex multi-file code refactors.** Opus 4.7 maintains coherence across files better than DeepSeek V4 on refactors touching 5+ files with interdependencies.
- **Nuanced instruction following.** Prompts with layered constraints (tone, format, audience, technical depth) see higher compliance rates on Opus 4.7.
- **Long-context reasoning.** At 100K+ token contexts, Opus 4.7 shows better recall and synthesis, particularly on contradictory information in the source material.
- **Safety-critical outputs.** Medical, legal, and financial content benefits from Opus 4.7's more conservative and thorough reasoning.

The right strategy is not "cheapest model always" or "best model always." It is "cheapest model that can handle this specific request." That is what a trained classifier does. It reads the prompt, estimates the complexity, and routes accordingly. For the 60 to 70% of requests that are classifications, summaries, formatting, simple Q&A, and code completions, DeepSeek V4 or Haiku are more than sufficient. For the 10 to 15% that genuinely need frontier reasoning, Opus 4.7 is worth every token.

## What changed for multi-provider strategies

Before May 2026, most routing strategies operated within a single provider's model family. Route between Haiku, Sonnet, and Opus. Or between GPT-4o-mini and GPT-5. The models share tokenizers, API formats, and behavioral patterns. It is clean.

DeepSeek V4 breaks that pattern. The savings are too large to ignore, but adding a second provider introduces complexity:

**Tokenizer differences.** DeepSeek V4 uses a different tokenizer than Anthropic or OpenAI. The same prompt produces a different token count on each provider. Cost estimates need to account for this, and token-based budgets need normalization.

**Behavioral differences.** System prompt handling, tool call formatting, and response style differ between providers. A prompt tuned for Claude may need adjustment for DeepSeek, particularly around structured output formatting.

**Latency variance.** DeepSeek V4 latency varies by region and load. Teams routing latency-sensitive requests need to factor time-to-first-token into routing decisions, not just cost.

**Availability.** DeepSeek API availability has historically been less consistent than Anthropic or OpenAI. A routing strategy that depends on DeepSeek V4 needs a failover chain.

These are solvable problems. An LLM gateway that handles provider normalization, token counting, and failover abstracts the complexity away from your application code. You get multi-provider savings without multi-provider headaches.

## The $690 billion backdrop

This pricing war is happening against a staggering backdrop of AI infrastructure spending. Amazon, Alphabet, Microsoft, Meta, and Oracle are on track to spend over $600 billion on capex in 2026, the majority of it on AI infrastructure. Gartner projects worldwide AI spending at $2.5 trillion for the year.

That spending creates pressure in both directions. Providers need to monetize their massive investments, which keeps frontier pricing high. At the same time, competitors like DeepSeek can undercut on price because their infrastructure costs are lower and they are willing to subsidize usage for market share.

For buyers, this means the pricing spread will likely widen further before it narrows. New models from Chinese labs, European open-source projects, and specialized providers will continue to offer frontier-adjacent capabilities at a fraction of US frontier pricing.

Routing becomes more valuable as the spread widens. A 3x price gap makes routing worth considering. A 7x gap makes it obvious. A 29x gap (DeepSeek V4-Pro volume pricing vs. Opus 4.7 output) makes it negligent not to route.

## Practical next steps

**If you are spending $1,000+ per month on LLM inference:**

1. Audit your prompt complexity distribution. What percentage of your requests are classifications, summaries, simple Q&A, or formatting? If it is above 50%, routing will cut your bill substantially.

2. Benchmark DeepSeek V4 on your actual workload. Run your last 1,000 production prompts through V4 and compare outputs to your current model. Track quality on a per-category basis, not in aggregate.

3. Set up per-request routing. A classifier evaluates each prompt and sends it to the cheapest model that can handle it. Simple requests go to Haiku or DeepSeek V4. Complex requests stay on Opus 4.7. Everything in between goes to Sonnet.

4. Monitor with per-request cost headers. After routing, every request should tell you what it cost and what it saved. Without observability, you are guessing.

## Where Nadir fits

Nadir's trained classifier evaluates each prompt in under 10 ms and routes to the cheapest model that can handle it. When the cheapest capable model is DeepSeek V4 instead of Sonnet, the savings per request jump from 2 to 3x to 7x on output tokens.

The integration is two lines. Change the base URL, set \`model="auto"\`. Nadir handles provider normalization, tokenizer differences, and failover. The \`x-nadir-cost-saved\` response header on every request shows the difference.

The wider the price gap between models, the more routing saves. DeepSeek V4 just made that gap the widest it has ever been.

---

*Sources: [VentureBeat, "DeepSeek V4 arrives with near state-of-the-art intelligence at 1/6th the cost of Opus 4.7"](https://venturebeat.com/technology/deepseek-v4-arrives-with-near-state-of-the-art-intelligence-at-1-6th-the-cost-of-opus-4-7-gpt-5-5) (May 2026). [MindStudio, "DeepSeek V4 vs GPT-5.5 vs Claude Opus 4.7 Pricing Comparison"](https://www.mindstudio.ai/blog/deepseek-v4-vs-gpt-55-vs-claude-opus-47-pricing) (May 2026). [DataCamp, "Claude Opus 4.7 vs DeepSeek V4"](https://www.datacamp.com/blog/deepseek-v4-vs-claude-opus-4-7) (May 2026). [Futurum, "AI Capex 2026: The $690B Infrastructure Sprint"](https://futurumgroup.com/insights/ai-capex-2026-the-690b-infrastructure-sprint/) (2026). [Gartner, "Worldwide AI Spending Will Total $2.5 Trillion in 2026"](https://www.gartner.com/en/newsroom/press-releases/2026-1-15-gartner-says-worldwide-ai-spending-will-total-2-point-5-trillion-dollars-in-2026) (January 2026). Anthropic, OpenAI, DeepSeek model pricing as of May 2026.*`,

  "github-ai-agent-token-waste": `## GitHub runs AI agents at scale. The waste surprised them.

GitHub Agentic Workflows launched in technical preview in February 2026. Within weeks, the system was processing millions of tokens per day across code review, CI/CD automation, and Copilot-powered development tasks. By mid-February, daily consumption peaked at 237.8 million tokens.

Then the engineering team looked at where those tokens were actually going.

In April 2026, GitHub published a detailed breakdown of their token efficiency work. The headline number: a 37% reduction in token consumption, achieved without removing features or degrading output quality. The savings came entirely from eliminating structural waste that had been invisible until they instrumented for it.

The patterns they found are not unique to GitHub. They exist in every production agentic system. The difference is that most teams never measure.

## Pattern 1: Unused tool registrations (10 to 15KB per turn)

This was the single biggest source of waste GitHub identified. LLM APIs are stateless, so agent runtimes include the full JSON schema for every registered tool on every API call. If your agent has access to 40 MCP tools, those 40 tool definitions travel with every single request, whether the agent uses them or not.

For GitHub's MCP server with 40 tools, this added 10 to 15KB of schema text per turn. In a 30-turn agentic session, that is 300 to 450KB of repeated tool definitions. At Opus pricing ($5 per million input tokens), those tool schemas alone cost $0.04 to $0.06 per session. Multiply by thousands of sessions per day and the waste adds up to four or five figures per month.

The fix: register only the tools relevant to each workflow step, not the full catalog. A code review agent does not need deployment tools. A CI agent does not need code search tools. Scoping tool registrations per step cut schema overhead by 60 to 80% in GitHub's tests.

Most agent frameworks make this hard by default. CrewAI, LangGraph, and AutoGen all register tools globally. Narrowing tool scope requires explicit per-agent or per-step configuration. It is worth the effort.

## Pattern 2: LLM calls for deterministic work

GitHub discovered that many of their "tool calls" were actually deterministic HTTP requests wrapped in an LLM roundtrip for no reason. Reading a file from a repository, fetching a pull request, listing issues. These are REST API calls with predictable inputs and outputs. Routing them through an LLM adds latency, tokens, and cost without adding intelligence.

The solution was what GitHub calls "pre-agentic data downloads" and "CLI proxy substitution." Before the agent starts reasoning, a lightweight script fetches the data the agent will need via direct API calls. The agent receives the data as context rather than discovering and fetching it through tool use.

This pattern applies broadly. If your agent calls a tool that always returns the same type of structured data (database lookups, API fetches, file reads), consider fetching that data before the LLM step and injecting it into the prompt. You save the tool-call roundtrip tokens (the LLM reasoning about which tool to call, the tool schema, the tool result parsing) while preserving the information.

In GitHub's case, replacing MCP calls with direct GitHub CLI calls for data retrieval eliminated LLM involvement entirely for those steps. The data still reaches the agent. The agent still reasons about it. But the fetch itself no longer costs tokens.

## Pattern 3: Context accumulation without pruning

This pattern is well-documented but still underaddressed in production. Every turn in an agentic session re-sends the full conversation history as input tokens. By turn 20, each API call carries 20,000 to 25,000 tokens of context. By turn 40, it can reach 40,000 to 50,000 tokens per call.

The problem is not the context itself. It is that much of the context is no longer relevant. A file listing from turn 3 that was used to pick a file to edit has no bearing on turn 35. An error message from turn 12 that was already resolved is dead weight at turn 25. But the accumulated history carries all of it, because pruning requires active management that most frameworks do not do by default.

GitHub addressed this with structured context management: keeping system prompts, the current task state, and the most recent N turns while summarizing or dropping older history. The result was fewer input tokens per turn with no measurable quality degradation on task completion.

For teams that cannot modify their agent framework's context management, there is a simpler lever. Lossless compression of the existing context (minifying JSON, deduplicating tool schemas, normalizing whitespace) can cut input tokens 30 to 60% on long sessions. This is what Nadir's Context Optimize does: the same information, fewer tokens, zero semantic loss.

## Pattern 4: Retry loops at premium prices

When an agent produces output that fails validation (a test failure, a malformed response, a type error), it retries. Each retry carries the full accumulated context plus the error message. Three retries at turn 35 of a session can cost more than the first ten turns combined.

The cost problem is compounded by the model problem. Most agent frameworks retry on the same model that failed. A syntax error retry at turn 35, carrying 35,000 tokens of context, hits Opus at $5 per million input tokens. That same retry would succeed on Haiku at $1 per million input tokens, because fixing a syntax error does not require frontier reasoning.

GitHub's optimization here was partly about reducing retries (better prompts, clearer tool schemas) and partly about routing retries to appropriate models. Both matter.

The numbers on retries are significant. NavyaAI's May 2026 cost analysis found that retry loops account for 15 to 25% of total token spend in agentic workloads. At enterprise scale, that is tens of thousands of dollars per month spent on failed attempts, each paying full context prices on a premium model.

## Pattern 5: Every turn hits the same model

GitHub did not publish specific numbers on model routing, but the pattern is consistent across every production agentic system that has been audited. The distribution of work in agentic sessions follows a predictable curve:

- 60 to 70% of turns are low complexity: file reads, status checks, output formatting, error parsing
- 20 to 30% are medium complexity: code generation, test writing, bug explanations
- 5 to 15% are genuinely hard: architecture decisions, multi-file refactors, complex debugging

When every turn hits the same frontier model, the majority of your spend goes to tasks that do not need frontier capabilities. The price spread between Haiku ($1 per million input tokens) and Opus ($5 per million) is 5x. Across providers, the spread between the cheapest production-grade model and the most expensive exceeds 100x.

Per-turn model routing addresses this directly. A classifier evaluates each API call independently (not each session, each individual call) and routes to the cheapest model capable of handling that complexity level.

The industry data on this is converging. IDC's 2026 report on model routing found that enterprises using trained classifiers for automatic routing achieved blended costs of $2.31 per million tokens, compared to $18.40 for frontier-only deployments. Multiple independent analyses put savings from intelligent routing at 40 to 60% for mixed-complexity workloads.

## How GitHub built the audit

GitHub's approach was methodical. They built two components:

**Instrumentation layer.** An API proxy captures token usage across all workflow runs in a normalized format. Every workflow outputs a \`token-usage.jsonl\` artifact with records containing input tokens, output tokens, cache-read tokens, cache-write tokens, model, provider, and timestamps.

**Two daily automated workflows.** A Daily Token Usage Auditor reads token usage artifacts from recent runs, aggregates consumption by workflow, and flags workflows with significantly increased usage. A Daily Token Optimizer examines the workflow source and recent logs to create GitHub Issues describing concrete inefficiencies and proposing specific optimizations.

This feedback loop is what made the 37% reduction possible. You cannot optimize what you cannot see. And manual audits do not scale. Automated daily auditing catches waste patterns as they appear, before they compound into five-figure monthly bills.

## How to run this audit on your stack

You do not need GitHub's infrastructure to find the same waste patterns. Here is a practical five-step process:

**Step 1: Instrument token usage per request.** If your agent framework does not log per-request token counts, add logging. Record input tokens, output tokens, model, and a task identifier for each API call. Most LLM SDKs return token counts in the response metadata. A week of data is enough to identify patterns.

**Step 2: Bucket requests by type.** Categorize each request: tool call, retry, reasoning, formatting, data fetch. Most teams discover that 40 to 60% of their token volume is structural overhead (tool schemas, context history, retries) rather than productive reasoning.

**Step 3: Measure tool schema overhead.** Count how many tool definitions are included in each request and how many are actually invoked. If you are sending 30 tool schemas per request and using 2 on average, you have a 93% waste rate on tool schema tokens. Scope tool registrations to each agent or workflow step.

**Step 4: Identify deterministic calls.** Flag any tool call where the input and output are both structured data with no reasoning involved (file reads, API fetches, database lookups). These can often be replaced with direct calls outside the LLM, injecting the results as context.

**Step 5: Analyze the complexity distribution.** For each request that does involve LLM reasoning, assess the complexity. Are you paying $5 per million tokens for a model to format JSON? To parse an error message? To generate a simple status update? Per-request routing captures these mismatches automatically.

## The compounding effect

These five patterns do not just add up. They compound. Unused tool schemas inflate the context, which inflates the cost of retries, which all hit a model that is overqualified for the task. Fixing any one pattern reduces costs. Fixing all five compounds the savings.

GitHub's 37% reduction came primarily from patterns 1 and 2 (tool schema pruning and deterministic call elimination). They left significant savings on the table from patterns 3, 4, and 5.

A team that addresses all five can realistically target 50 to 65% total reduction. For a team spending $10,000 per month on AI inference, that is $5,000 to $6,500 back. The audit takes a week. The savings are permanent.

## Where Nadir fits in

Nadir addresses patterns 3 and 5 directly. Context Optimize handles context accumulation by applying lossless compression (JSON minification, schema deduplication, whitespace normalization) that cuts input tokens 30 to 60%. Per-request routing handles the model mismatch by classifying each API call in under 10 ms and routing to the cheapest model capable of handling it.

The integration is two lines. Change the base URL, set \`model="auto"\`. The \`x-nadir-cost-saved\` response header shows the savings on every request. No SDK change, no framework swap.

For teams that want to address all five patterns, start with the audit above. Fix the structural waste (patterns 1, 2, 3) first, because those savings apply regardless of model routing. Then add per-request routing (pattern 5) to capture the remaining optimization on the tokens that survive the audit.

The 37% that GitHub found is not the ceiling. It is the floor for teams that have never looked.

---

*Sources: [GitHub Engineering, "Improving token efficiency in GitHub Agentic Workflows"](https://github.blog/ai-and-ml/github-copilot/improving-token-efficiency-in-github-agentic-workflows/) (April 2026). [GitHub Agentic Workflows, Daily Token Consumption Reports](https://github.com/github/gh-aw/discussions) (February-March 2026). [NavyaAI, "Tokens got 99.7% cheaper. So why did your AI bill triple?"](https://www.navyaai.com/reports/ai-cost-report-token-prices-vs-ai-bill) (May 2026). [IDC, "The Future of AI is Model Routing"](https://www.idc.com/resource-center/blog/the-future-of-ai-is-model-routing/) (2026). [Gartner, "Agentic AI Token Consumption Analysis"](https://www.gartner.com/en/newsroom) (March 2026). Anthropic, OpenAI, Google model pricing as of May 2026.*`,

  "finops-for-ai-cost-governance": `## The number that should worry every engineering leader

The FinOps Foundation's 2026 State of FinOps report surveyed 1,192 organizations managing $83 billion in cloud spend. One finding stood out: only 44% of organizations have financial guardrails for AI workloads. The other 56% are running AI in production with no cost governance at all.

This matters because AI is no longer a rounding error on the cloud bill. At AI-forward enterprises, AI workloads now account for 18% of total cloud spend, up from 4% in 2023. Inference alone constitutes 85% of enterprise AI budgets, according to Gartner. And 42% of enterprises say optimizing AI workflows is their top spending priority for 2026, overtaking expansion for the first time.

The teams without guardrails are not spending less. They are spending blindly. And the gap between governed and ungoverned AI spend is widening.

## What "no guardrails" actually looks like

In most organizations without AI cost governance, the failure mode is the same: every request goes to a frontier model because nobody set up anything else.

The engineering team picks Claude Opus or GPT-4.5 during prototyping because it works best. The prototype becomes the production system. Six months later, 60% of API calls are formatting output, parsing errors, and answering basic questions, all hitting a $5-per-million-token model when a $0.25 model would produce identical results.

Nobody notices because there is no dashboard, no budget alert, no cost-per-task metric. The monthly bill arrives, someone says "AI is just expensive," and the cycle continues.

The FinOps Foundation data confirms this pattern. Organizations without AI guardrails reported that costs exceeded projections by 30 to 50%. Not occasionally. Sixty-five percent of IT leaders reported this as a recurring problem.

## The five practices that separate governed from ungoverned

We analyzed the FinOps Foundation data alongside field reports from Deloitte's 2026 Tech Trends, Gartner's AI spending forecasts, and cost breakdowns from teams running production AI workloads. Five practices consistently separated the teams with controlled AI spend from those without.

### 1. They measure cost per completed task, not cost per token

The old metric, cost per million tokens, tells you what you paid. It does not tell you what you got. A cheap model that fails and retries five times can cost more than an expensive model that succeeds on the first try.

Governed teams track cost per completed task. This metric captures the full picture: the successful call, the retries, the context accumulation, and the model that ultimately delivered the answer. It exposes waste that per-token metrics hide.

A team at a fintech company shared their numbers at a FinOps meetup in April 2026. When they switched from tracking cost-per-token to cost-per-completed-task, they discovered that 23% of their inference spend was going to retry loops. The retries were invisible in their per-token dashboard because each individual retry was cheap. In aggregate, they were burning $4,200 per month on failed attempts.

### 2. They set budgets per workload, not per team

Most organizations that budget for AI at all set a team-level monthly cap. Engineering gets $15,000 per month for AI. When the bill approaches the cap, someone manually throttles usage.

This is the cloud-computing equivalent of giving a department a gas card without tracking which vehicles are driving where. You know the total spend, but you cannot tell which workload is efficient and which is wasteful.

Governed teams set budgets per workload or per application. The coding assistant gets one budget. The customer support bot gets another. The data pipeline gets a third. When one workload spikes, the alert is specific enough to act on.

The FinOps Foundation found that organizations with workload-level budgets detected cost anomalies 4x faster than those with only team-level caps.

### 3. They route per request, not per application

This is the biggest lever. In a typical production workload, 60 to 70% of requests are low complexity: status checks, formatting, parsing, basic lookups. Another 20 to 30% are medium complexity. Only 5 to 15% genuinely need a frontier model.

Ungoverned teams send everything to one model. Governed teams route each request to the cheapest model that can handle it.

The price spread makes this consequential. Claude Haiku costs $1 per million input tokens. Claude Opus costs $5. That is a 5x difference on Anthropic's lineup alone. Across providers, the spread between the cheapest production-grade model and the most expensive is over 100x.

IDC published a report in early 2026 calling model routing "the future of AI." Their data shows 37% of enterprises already use five or more models in production. The fully optimized ones, those using trained classifiers for automatic routing, achieved blended costs of $2.31 per million tokens. Frontier-only deployments averaged $18.40. That is an 87% difference.

### 4. They monitor token distribution, not just total spend

A monthly bill tells you how much you spent. It does not tell you where the tokens went. Governed teams instrument their AI workloads to track token distribution: how many tokens per request, how many requests per task, and what percentage of tokens are productive versus overhead.

This is how teams discover structural waste. NavyaAI's May 2026 cost analysis found that in agentic workloads, only 20 to 30% of tokens directly contribute to solving the user's problem. The rest is context accumulation (35 to 45%), retry loops (15 to 25%), and tool schema overhead (10 to 15%).

You cannot optimize what you cannot see. Teams that monitor token distribution find and fix waste patterns like bloated system prompts, redundant tool schemas, and unnecessary conversation history. Teams that only see the monthly total cannot.

### 5. They treat model selection as infrastructure, not a developer choice

In ungoverned organizations, the model choice is embedded in application code. A developer writes \`model="claude-opus-4-6"\` during development, and that string stays in production forever. Changing it requires a code change, a review, a deploy. So nobody changes it.

Governed teams decouple model selection from application code. The application requests a completion with \`model="auto"\` or a capability level, and infrastructure handles the routing. When a cheaper model becomes available, or when a model's pricing changes, the routing layer adapts without touching application code.

This is not just about cost. It is about operational resilience. When Anthropic ships a new tokenizer that inflates token counts by 35% (as happened with Opus 4.7 in April 2026), teams with infrastructure-level routing adjust once. Teams with hardcoded model strings adjust in every application, if they notice at all.

## The cost of doing nothing

Gartner projects worldwide AI spending at $2.52 trillion in 2026. Their more sobering projection: 40% of agentic AI projects will be scaled back or canceled by 2027 due to escalating costs and unclear ROI.

The projects that get canceled are disproportionately the ungoverned ones. Not because the technology failed, but because the economics were never tracked well enough to demonstrate value. When the CFO asks "what are we getting for this $50,000 per month AI bill?" and the answer is "we are not sure," the project loses funding.

Governed teams can answer that question. They know cost per completed task. They know which workloads are efficient and which need optimization. They can show that routing saved $18,000 last month or that context compression cut token waste by 40%. The numbers make the case for continued investment.

## How to start this week

If you are in the 56% without guardrails, here is a practical starting point:

**Day 1: Instrument.** Pull a week of API logs. For each request, record the model, input tokens, output tokens, and whether the request was part of a retry. If your current setup does not log this, start logging it.

**Day 3: Analyze.** Bucket each request by complexity. Count how many are simple lookups, formatting, or parsing versus genuine reasoning tasks. Calculate what the bill would have been if simple requests went to Haiku ($1/M) and medium requests went to Sonnet ($3/M). The gap between actual and theoretical spend is your optimization opportunity.

**Day 5: Route.** Set up per-request routing. Nadir evaluates each request in under 10 ms and sends it to the cheapest model that can handle it. The integration is two lines: change the base URL and set \`model="auto"\`. The \`x-nadir-cost-saved\` response header shows the savings on every request, giving you the instrumentation from step 1 for free.

**Day 7: Set a budget.** Pick your highest-volume workload and set a weekly budget alert. Not a hard cap, just a notification. When you know the baseline, you can set meaningful thresholds. When a threshold fires, you have the per-request data to diagnose why.

The FinOps Foundation data is clear: organizations with AI cost governance spend less, detect problems faster, and keep their AI projects funded longer. The 44% that figured this out are pulling ahead. The gap will only grow as AI workloads scale.

---

*Sources: [FinOps Foundation, "State of FinOps 2026"](https://data.finops.org/) (2026, 1,192 organizations, $83B cloud spend surveyed). [Gartner, "Worldwide AI Spending Forecast"](https://www.gartner.com/en/newsroom/press-releases/2026-1-15-gartner-says-worldwide-ai-spending-will-total-2-point-5-trillion-dollars-in-2026) (January 2026). [Deloitte, "Tech Trends 2026: AI Infrastructure and Compute Strategy"](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends/2026/ai-infrastructure-compute-strategy.html) (2026). [IDC, "The Future of AI is Model Routing"](https://www.idc.com/resource-center/blog/the-future-of-ai-is-model-routing/) (2026). [NavyaAI, "Tokens got 99.7% cheaper. So why did your AI bill triple?"](https://www.navyaai.com/reports/ai-cost-report-token-prices-vs-ai-bill) (May 2026). Anthropic, OpenAI, Google model pricing as of May 2026.*`,

  "ai-jevons-paradox-token-costs": `## The Jevons Paradox, applied to tokens

In 1865, William Stanley Jevons observed that making coal engines more efficient did not reduce coal consumption. It increased it. Cheaper energy per unit made new uses viable, and total demand outpaced the efficiency gains.

The same thing happened to LLM tokens between 2024 and 2026.

Per-token prices fell by roughly 99.7% in two years. Anthropic dropped Opus from $15/$75 per million tokens to $5/$25. OpenAI released GPT-4o mini at a fraction of GPT-4's cost. Google pushed Gemini Flash below $0.10 per million tokens. DeepSeek and open-source models compressed the bottom end even further.

Enterprise AI spend tripled anyway. Global AI spending is on track to hit $2 trillion in 2026, according to Gartner. Inference now accounts for 85% of enterprise AI budgets, up from roughly 60% in 2024. The FinOps Foundation's 2026 State of FinOps report found that 73% of respondents said AI costs exceeded their original budget projections.

Cheaper tokens did not reduce the bill. They changed what was possible. And what became possible consumes far more tokens per task.

## What changed: the shift to agentic workloads

In 2024, most production LLM usage was single-turn: a user sends a prompt, the model responds, done. One API call per interaction, predictable token counts, manageable costs.

By 2026, the dominant pattern is agentic. A coding assistant reads a task, calls a tool, reads the output, decides what to do next, calls another tool, reads that output, retries if the test fails, and repeats. A single task that used to be one API call now triggers 10 to 50 calls, each carrying the full accumulated context.

Microsoft Research quantified this in April 2026. Their analysis of agentic coding tasks found:

- Agentic coding tasks consume **1,000x more tokens** than equivalent code chat tasks
- A typical session uses roughly **1 million input tokens and 40,000 output tokens**
- The same agent on the same task can vary by **up to 30x** in total token consumption between runs

Stanford's Digital Economy Lab confirmed the pattern from a different angle. Their research showed that input tokens, not output tokens, drive the cost. By turn 30 of an agentic session, every API call carries 25,000 to 35,000 tokens of accumulated context. By turn 50, each retry loop costs more than the first ten turns combined.

Gartner's March 2026 analysis put the multiplier at 5 to 30x more tokens per task for agentic workflows compared to single-turn chat. That range depends on the task complexity and the agent framework, but even the low end (5x) overwhelms a 10x price reduction.

## The math that explains your bill

Here is a simplified version of what happened to a typical enterprise between 2024 and 2026:

| Factor | 2024 | 2026 | Change |
|---|---|---|---|
| Average cost per million tokens | $15.00 | $5.00 | -67% |
| Average tokens per task (single-turn) | 2,000 | 2,000 | 0% |
| Average tokens per task (agentic) | N/A | 50,000 | New workload |
| Share of workload that is agentic | 5% | 45% | +40pp |
| Monthly API calls | 50,000 | 200,000 | +300% |

The per-token price dropped 67%. But the number of tokens per task grew 25x for nearly half the workload, and total call volume quadrupled as teams automated more with agents. The bill went up, not down.

This is the Jevons Paradox in action. Cheap tokens made it economically feasible to run agents on tasks that nobody would have automated at $15 per million tokens. Once the price crossed a threshold, usage exploded. The efficiency gain (cheaper tokens) was more than offset by the demand increase (more tokens per task, more tasks automated).

## Where the money actually goes

NavyaAI published a detailed cost analysis in May 2026 breaking down where enterprise AI budgets land. The finding that surprised most teams: 72% of costs hide outside the obvious inference line item.

The breakdown looks roughly like this for a team running agentic workloads:

- **Context accumulation (35-45% of cost).** Every turn in an agentic session re-sends the full conversation history. A 40-turn session where the agent reads files, runs tests, and retries failures can accumulate 40,000+ input tokens per call by the end. The last ten turns of a session often cost more than the first thirty.

- **Retry loops (15-25% of cost).** When an agent produces code that fails a test, it retries. Each retry carries the full accumulated context plus the error message. Three retries at turn 35 of a session cost more than the entire first ten turns. And retries happen on the premium model, because the agent does not know the fix is simple.

- **Tool schema overhead (10-15% of cost).** Agentic frameworks inject tool definitions into every API call. A coding agent with 20 tools might add 3,000 to 5,000 tokens of schema to every single request, regardless of whether those tools are relevant to the current step.

- **Actual productive reasoning (20-30% of cost).** The tokens that directly contribute to solving the user's problem represent less than a third of total spend.

This distribution is why "just negotiate a volume discount" does not fix the problem. The waste is structural, baked into how agentic workflows accumulate context. A 20% volume discount on a bill that is 70% waste still leaves most of the waste intact.

## Why cheaper models alone do not fix it

The intuitive response is to switch everything to the cheapest model. Run Haiku at $1 per million tokens instead of Opus at $5, and the 5x price difference should absorb the token growth.

In practice, this breaks on complex tasks. A coding agent using Haiku to architect a distributed system produces worse output, fails more tests, triggers more retries, and can end up costing more in wasted tokens than Opus would have. The retries compound: each failed attempt adds to the context, making subsequent attempts more expensive regardless of the model.

The real distribution of agentic work, based on production traces, looks like this:

- **60 to 70% of turns are low complexity.** File reads, status checks, formatting output, parsing errors. These are classification-grade tasks.
- **20 to 30% are medium complexity.** Writing a function, generating a test, explaining a bug.
- **5 to 15% are genuinely hard.** Architecture decisions, multi-file refactors, complex debugging.

Running everything on Opus means paying frontier rates for file reads. Running everything on Haiku means degrading quality on the 15% of turns that actually need reasoning power. Neither option addresses the structural problem.

## The lever that works: per-request model routing

If 65% of tokens in a session hit a model that is 5x more expensive than necessary, and you fix that, you cut the bill roughly in half without touching the complex tasks that need the expensive model.

This is what intelligent model routing does. A classifier evaluates each request (not each session, each individual API call) and sends it to the cheapest model that can handle that complexity level. The overhead is under 10 milliseconds per request.

Here is what routing does to a typical 40-turn agentic session:

| Segment | Turns | Model (no routing) | Model (routed) | Cost (no routing) | Cost (routed) |
|---|---|---|---|---:|---:|
| File reads, status checks | 25 | Opus ($5/M) | Haiku ($1/M) | $2.25 | $0.45 |
| Code generation, tests | 10 | Opus ($5/M) | Sonnet ($3/M) | $1.40 | $0.84 |
| Architecture, debugging | 5 | Opus ($5/M) | Opus ($5/M) | $0.88 | $0.88 |
| **Total** | **40** | | | **$4.53** | **$2.17** |

That is 52% savings. The five turns that genuinely need Opus still get Opus. The 25 turns that are reading files no longer pay frontier rates for it.

Scale this across a team running 200 sessions per week: the difference is roughly $19,000 per month. At 500 sessions per week, it crosses $47,000 per month. These are real numbers from production deployments.

## The industry is already moving

The shift is happening fast. In Q1 2025, the average enterprise used 2.1 models in production. One year later, that number is 4.7. Thirty-seven percent of enterprises now run five or more models. And 42% have deployed a routing or gateway layer to manage model selection.

The fully optimized enterprises (those using multi-model routing with trained classifiers) achieved blended costs of $2.31 per million tokens in Q1 2026, compared to $18.40 for frontier-only deployments a year earlier. That is an 87.4% reduction.

The LLM middleware and gateway market is growing at a 49.6% compound annual growth rate through 2034. Routing is becoming standard infrastructure. The question for most teams is not whether to adopt it, but when.

## What you can do this week

**1. Measure your actual token distribution.** Pull a week of API logs. Bucket each request by complexity (simple lookup vs. code generation vs. hard reasoning). Most teams discover that 60%+ of their calls do not need a frontier model.

**2. Calculate your theoretical savings.** Take the simple and medium requests from step 1 and price them at Haiku ($1/M) and Sonnet ($3/M) rates instead of Opus ($5/M). If the gap exceeds $500/month, routing pays for itself immediately.

**3. Start routing.** Nadir evaluates each request in under 10 ms and routes to the cheapest model that can handle it. The open-source core (NadirClaw) runs locally with zero data leaving your machine. The hosted platform adds trained classifiers, analytics, and billing. Both are OpenAI-compatible: change the base URL, set \`model="auto"\`, and routing starts on the next request.

The Jevons Paradox is not going away. Tokens will keep getting cheaper, and that will keep enabling new use cases that consume more of them. The only durable strategy is to make sure each token hits the right model for the job.

---

*Sources: [NavyaAI, "Tokens got 99.7% cheaper. So why did your AI bill triple?"](https://www.navyaai.com/reports/ai-cost-report-token-prices-vs-ai-bill) (May 2026). [Stanford Digital Economy Lab, "How are AI agents spending your tokens?"](https://digitaleconomy.stanford.edu/news/how-are-ai-agents-spending-your-tokens/) (May 2026). [Microsoft Research, "How Do AI Agents Spend Your Money?"](https://arxiv.org/abs/2604.22750) (April 2026). [FinOps Foundation, "State of FinOps 2026"](https://data.finops.org/) (2026). [Gartner, Worldwide AI Spending Forecast](https://www.gartner.com/en/newsroom/press-releases/2026-1-15-gartner-says-worldwide-ai-spending-will-total-2-point-5-trillion-dollars-in-2026) (January 2026). [VentureBeat, "Cheaper tokens, bigger bills"](https://venturebeat.com/orchestration/cheaper-tokens-bigger-bills-the-new-math-of-ai-infrastructure) (2026). Anthropic, OpenAI, Google model pricing as of May 2026.*`,

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

Multiple independent analyses put the savings from intelligent routing at 40 to 60% for mixed-complexity workloads. That aligns with our own held-out benchmark: Nadir's verifier-gated cascade cuts cost 60% versus always-Opus on 11,420 RouterBench held-out triples, preserving 98% of always-Opus quality. A calibrated verifier (AUROC 0.961) reads the cheap-model answer before we ship it, so the routing decision is recoverable rather than absorbed.

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

  "routerbench-cascade-benchmark": `## Setup

We ran 11,420 held-out triples from RouterBench through Nadir's verifier-gated cascade. The eval is public, the held-out split is disjoint from training (overlap_count=0), and the threshold sweep is reproducible from the open-source eval harness.

- **Benchmark model:** Claude Opus 4.6 (always-Opus baseline)
- **Cheap tier:** Claude Haiku 4.5; mid tier: Claude Sonnet 4.6
- **Pre-classifier:** trained wide_deep tier classifier (under 10 ms per prompt)
- **Verifier:** calibrated outcome scorer (CPU INT8, 180 ms when it runs)
- **Dataset:** RouterBench held-out, n=11,420 triples

## The architecture

Every prompt hits the pre-classifier first. If the pre-classifier is confident the prompt is cheap-tier, we skip the verifier entirely and ship the Haiku answer. That is the common path.

If confidence is borderline, the cheap model answers first. The verifier reads that answer and scores it. If it accepts, we ship cheap. If it rejects, we escalate to Sonnet, or to Opus on Sonnet rejection. The verifier never sees Opus output; it only decides whether the cheap output is good enough to leave alone.

The wedge against one-shot routers (Not Diamond, Martian) is the verification step. A predicted-cheap route can absorb a quality failure; a verified-cheap route surfaces it.

## Headline numbers

| Metric | Value |
|--------|-------|
| Cost reduction vs always-Opus | **60%** |
| Quality preserved vs always-Opus | **98%** |
| Catastrophic routes | 1.7% |
| Verifier AUROC | **0.961** |
| Verifier calibration (ECE) | **0.016** |
| Verifier latency, CPU INT8 | 180 ms |
| Pre-classifier overhead | < 10 ms |

"Quality preserved" is one minus catastrophic-route rate, on the same eval. We do not redefine the metric between sections.

## Threshold sweep

The verifier threshold tau is the operational knob. Higher tau means the verifier rejects more cheap answers, escalating more often: better quality, less savings. Lower tau is the opposite. Sweep below is precomputed from the same eval.

| tau | Accuracy | Cost reduction | Catastrophic | Wasted escalation |
|-----|---------:|---------------:|-------------:|------------------:|
| 0.3 | 88.2% | 73.2% | 8.8% | 3.0% |
| 0.4 | 89.9% | 68.5% | 5.3% | 4.7% |
| 0.5 | 90.3% | 67.0% | 4.4% | 5.3% |
| 0.7 | 89.8% | 62.8% | 2.4% | 7.9% |
| **0.8** | 89.2% | **60.9%** | **1.7%** | 9.2% |
| 0.9 | 88.1% | 59.1% | 1.1% | 10.8% |

The 60/98 headline numbers report tau=0.8. The shape of the curve matters more than the single operating point: cost reduction degrades gracefully as you tighten the quality guarantee. The cliff people fear is not there.

## How this beats prompt-only routing

A prompt-only classifier sees only the input. It cannot tell you whether the cheap model handled it. The strongest prompt-only baseline on the same held-out split delivers 96.6% quality at 4.8x cost (where always-Opus is 12.0x and always-Haiku is 1.0x). The cascade hits 98.3% quality at 4.7x cost. Same cost, fewer quality drops, because reading the answer is cheaper than guessing whether it will be good.

| Strategy | Cost (x) | Catastrophic | Quality preserved |
|---|---:|---:|---:|
| Always-Opus | 12.0x | 0% | 100% |
| Prompt-only classifier | 4.8x | 3.4% | 96.6% |
| Always-Haiku | 1.0x | 26.0% | 74.0% |
| **Verifier-gated cascade** | **4.7x** | **1.7%** | **98.3%** |

## What this means for your bill

If you spend $5,000/month on LLM APIs and your prompt mix is what RouterBench held-out roughly reflects, Nadir saves about $3,000/month gross. With the 25% on first $2K / 10% above fee structure that is $600 in variable fees, $9 base, net about $2,391/month back. Complex prompts still hit Opus when the verifier says they need to.

## Reproducibility

The eval harness, the held-out split, and the verifier weights ship with the image. Each release stamps a deterministic SHA on the classifier (visible per request as x-nadir-classifier-sha). Run the same triples; get the same numbers.

The composed eval JSON is at \`verifier/reports/eval_composed_20260526T191001.json\`. The verifier calibration eval is at \`verifier/reports/eval_20260526T184516.json\`. RouterBench train/test disjointness is at \`verifier/reports/routerbench_contamination_20260524T122849.json\`.`,

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

The binary classifier alone hits routing accuracy in the high 80s on small held-out evals. On RouterBench held-out (n=11,420), the prompt-only classifier preserves 96.6% of always-Opus quality. That is the ceiling for any router that sees only the input. To push past it, you have to read the cheap-model answer before you ship; that is what the verifier-gated cascade adds, taking quality preservation to 98%.

## What's next

We're training a confidence-aware analyzer that escalates uncertain classifications to a secondary check. If the primary classifier scores between 0.3-0.7, it runs a lightweight keyword analysis before committing to a tier. This should push accuracy above 98%.`,

  "nadir-vs-always-premium": `## When Nadir helps most

**High volume, mixed complexity:** If you're making 1000+ API calls/day and many are simple lookups, formatting, or basic Q&A, routing saves the most. On 11,420 RouterBench held-out triples, Nadir cuts cost 60% versus always-Opus while preserving 98% of always-Opus quality. Your savings will track that range when your prompt mix looks similar.

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
