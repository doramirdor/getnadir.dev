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
