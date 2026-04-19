export interface CompareRow {
  feature: string;
  nadir: string;
  them: string;
}

export interface CompareSection {
  heading: string;
  body: string;
}

export interface KeyAdvantage {
  title: string;
  body: string;
  proof?: string;
}

export interface ComparePage {
  slug: string;
  competitor: string;
  competitorUrl: string;
  tagline: string;
  oneLiner: string;
  category: string;
  updatedAt: string;
  readingTime: string;

  tldr: string[];
  keyAdvantages: KeyAdvantage[];
  positioning: string;
  theirPricing: string;
  nadirPricing: string;

  table: CompareRow[];
  sections: CompareSection[];
  verdict: string;
  whenToPickThem: string[];
  whenToPickNadir: string[];
}

export interface NadirPillar {
  title: string;
  body: string;
  proof: string;
}

export const NADIR_PILLARS: NadirPillar[] = [
  {
    title: "Decide, don't configure",
    body: "A DistilBERT classifier reads every prompt in under 10 ms and picks Haiku, Sonnet, or Opus automatically. You do not pick the tier per call. You do not write routing rules.",
    proof: "96% agreement with human labels on our public 50-prompt eval. Zero catastrophic routes.",
  },
  {
    title: "A router that adapts",
    body: "Outcome-conditioned routing watches live responses, updates on quality failures fast and cost signals slow, and runs calibration probes when a cheaper tier closes the gap. Static routers rot. This one does not.",
    proof: "Calibration closes the gap within a few thousand requests at 2.16% overhead.",
  },
  {
    title: "Privacy that survives audit",
    body: "Opt-in hash-only prompt storage writes SHA-256 instead of prompt text. Responses are dropped. The redaction runs on both the primary and fallback log paths, so nothing leaks on the unhappy path.",
    proof: "store_prompts=false stamps metadata.prompt_hashed=true across every log row.",
  },
  {
    title: "Reliability built in",
    body: "Circuit breakers with rolling health scoring, provider health monitoring, and zero-completion insurance. Empty responses do not bill. Failed providers drop out of the pool before the next call hits them.",
    proof: "Closed → Open after 5 failures → Half-Open at 60s. Health scores weighted 40/30/20/10 on success, latency, trend, volume.",
  },
  {
    title: "Savings that compound",
    body: "Semantic cache at 85 to 90% similarity and Context Optimize input compression fire before the router does. Cheap models on compressed inputs is multiplicative, not additive. Nobody bundles both pre-route.",
    proof: "29 to 71% input token reduction measured on our benchmark workload.",
  },
  {
    title: "Open core, no lock-in",
    body: "NadirClaw is MIT. Self-host the classifier plus four-tier routing plus fallback chains for free. Run Nadir Pro when you want the trained classifier, OCR, quality scoring, and the savings dashboard. Move between them without rewriting anything.",
    proof: "OpenAI compatible endpoint. Same SDK, same base URL, BYOK.",
  },
];

const pages: ComparePage[] = [
  {
    slug: "openrouter",
    competitor: "OpenRouter",
    competitorUrl: "https://openrouter.ai",
    category: "Aggregator gateway",
    tagline: "If your Opus bill is the problem, a model list is not the fix.",
    oneLiner:
      "Nadir routes every prompt to the cheapest model that can handle it. OpenRouter gives you a list of models and a unified key. The list does not lower your bill. Routing does.",
    updatedAt: "2026-04-19",
    readingTime: "5 min read",

    tldr: [
      "Nadir makes the tier decision per prompt in under 10 ms. OpenRouter leaves the tier pinned to whatever you set in your SDK.",
      "OCR closed-loop routing adapts as providers ship silent upgrades. A model catalogue is frozen the moment you choose.",
      "Semantic cache and Context Optimize fire before the router, so cheap models run on compressed inputs. Neither ships bundled with OpenRouter.",
      "NadirClaw (MIT) self-hosts the classifier and 4-tier routing for free. No lock-in if you outgrow the hosted product.",
    ],

    keyAdvantages: [
      {
        title: "Routing, not a model list",
        body: "A classifier picks Haiku, Sonnet, or Opus per request. You do not pick the tier in your code. You do not maintain routing rules.",
        proof: "96% oracle agreement on our 50-prompt public eval. Zero catastrophic routes.",
      },
      {
        title: "OCR closed-loop adaptation",
        body: "Live response quality and cost feed back into the router. Calibration probes test whether a cheaper tier can now handle traffic pinned to an expensive one. A catalogue has no equivalent.",
        proof: "Gap closes inside a few thousand requests at 2.16% overhead.",
      },
      {
        title: "Pre-route optimizations",
        body: "Semantic cache at 85 to 90% similarity. Context Optimize compresses inputs before dispatch. Both fire before the tier decision, so savings multiply rather than add.",
        proof: "29 to 71% input token reduction on our benchmark.",
      },
      {
        title: "Open core hybrid",
        body: "NadirClaw is MIT and self-hosts the classifier plus 4-tier routing plus fallback chains. Use it standalone or in front of OpenRouter. Upgrade to Nadir Pro for the trained classifier and OCR without touching your SDK.",
        proof: "OpenAI compatible endpoint. Same base URL, BYOK, no SDK changes.",
      },
    ],

    positioning:
      "Nadir makes the cost decision per request. The router classifies, ranks, and calls. If you want the widest model catalogue, OpenRouter is a catalogue. If you want a lower bill without changing your code, that is a routing problem, which is the one Nadir solves.",

    theirPricing:
      "Pass-through on inference, with a credit top-up fee and a small BYOK percentage above a free monthly threshold.",

    nadirPricing:
      "$9/month base. Variable fee of 25% on the first $2,000 of gross savings, 10% above. No fee on dollars we did not save. BYOK included at every tier.",

    table: [
      {
        feature: "Automatic complexity-based routing",
        nadir: "Yes. Classifier picks Haiku, Sonnet, or Opus per prompt.",
        them: "No. You pick the tier.",
      },
      {
        feature: "Closed-loop learning from responses",
        nadir: "OCR adjusts routing from live response quality and cost.",
        them: "No.",
      },
      {
        feature: "Semantic cache",
        nadir: "Built in. 85 to 90% similarity thresholds with TTL.",
        them: "Not bundled.",
      },
      {
        feature: "Context Optimize (token minification)",
        nadir: "Yes. 29 to 71% input token reduction on our bench.",
        them: "No.",
      },
      {
        feature: "Savings dashboard with gross and net",
        nadir: "Yes, routed versus always-Opus.",
        them: "Spend dashboard, no benchmark delta.",
      },
      {
        feature: "Self-host open source",
        nadir: "Yes. MIT via NadirClaw.",
        them: "No.",
      },
    ],

    sections: [
      {
        heading: "The cost decision is the problem",
        body: "Most teams land on OpenRouter and pin a premium model for everything, because picking a tier per call is work. The bill grows. Agentic loops make it grow faster. A unified key does not change any of that.\n\nNadir makes the tier decision automatically. A DistilBERT classifier scores complexity in about 50 ms. A ranker picks the cheapest model in the right tier. Simple prompts land on Haiku. Hard prompts stay on Opus. Your code does not change.",
      },
      {
        heading: "Under the hood",
        body: "Nadir is OpenAI compatible. Swap your base URL, set model to auto, keep your SDK. A quality floor per API key keeps regressions off the expensive work. Failover chains handle provider outages. BYOK means your keys, your rate limits, your contracts.\n\nClosed-loop learning, what we call OCR, watches live responses. Binary quality failures update fast. Cost signals update slow. Calibration probes check whether a cheaper tier can now handle traffic routed to an expensive one. The router does not stay frozen the day you trained it.",
      },
      {
        heading: "The numbers to weigh",
        body: "On a $5,000/month mixed workload, the shape usually lands near $1,900 saved, $475 variable fee, $9 base. Net about $1,415/month back with Claude still handling the hard prompts. Agreement with human labels on our 50-prompt public eval is 96%, with zero catastrophic routes.\n\nIf you already use OpenRouter, run Nadir in front of it. Nadir picks the tier, OpenRouter executes. Your credit balance drops by less each day.",
      },
    ],

    verdict:
      "Nadir lowers the underlying bill by picking the model for each prompt. A gateway list does not.",

    whenToPickThem: [
      "You want the widest model catalogue behind one key.",
      "You are fine choosing the tier per call.",
    ],
    whenToPickNadir: [
      "Your premium-model bill is the problem you need solved.",
      "You want the router to pick the tier automatically, per request.",
      "You want a savings number against an always-Opus baseline on a dashboard.",
      "You want the router to adapt when models change, without a retrain.",
    ],
  },

  {
    slug: "requesty",
    competitor: "Requesty",
    competitorUrl: "https://requesty.ai",
    category: "AI gateway",
    tagline: "A markup on inference is not a savings mechanism.",
    oneLiner:
      "Nadir lowers the underlying model bill by picking the cheapest model that can handle each prompt. Requesty charges 5% on top of inference. Those numbers go in different directions.",
    updatedAt: "2026-04-19",
    readingTime: "5 min read",

    tldr: [
      "Nadir classifies each prompt and picks Haiku, Sonnet, or Opus per request. Requesty runs failover and rules. Pinning the tier is still on you there.",
      "OCR closed-loop routing adapts when providers change. A rules engine does not.",
      "Privacy ships as hash-only prompt storage, not just PII redaction. The prompt text never touches the DB when the flag is on.",
      "NadirClaw is MIT and self-hostable. Requesty has no open core equivalent.",
    ],

    keyAdvantages: [
      {
        title: "Decision engine, not a gateway with rules",
        body: "A classifier picks the tier in under 10 ms. Requesty routes through fallback and load balance rules you write. Different job entirely.",
        proof: "96% oracle agreement on our public eval, zero catastrophic routes.",
      },
      {
        title: "OCR closed-loop adaptation",
        body: "Quality failures update routing fast. Cost signals update slow. Calibration probes rerun traffic against cheaper tiers to find new headroom as models ship.",
        proof: "Gap closes inside a few thousand requests at 2.16% overhead.",
      },
      {
        title: "Hash-only prompt storage",
        body: "With store_prompts=false, the backend writes sha256 of the prompt and drops the response before any log row lands. The redaction runs on the primary path and the fallback path, so nothing leaks on errors.",
        proof: "metadata.prompt_hashed=true stamps every redacted row.",
      },
      {
        title: "Open core you can run yourself",
        body: "NadirClaw is MIT. Self-host the classifier, routing, and fallback chains for free. Ship Nadir Pro when you want OCR and the trained classifier.",
        proof: "OpenAI compatible endpoint. Same SDK, BYOK.",
      },
    ],

    positioning:
      "Nadir is a routing decision engine. A gateway with rules is a different category. The router classifies, ranks, calls, and adapts. A flat markup per call does none of that.",

    theirPricing:
      "Flat 5% markup on inference. BYOK supported. Enterprise volume discounts via contact.",

    nadirPricing:
      "$9/month base, then 25% of the first $2,000 in savings and 10% above. Variable fee only applies to dollars actually saved versus an always-premium baseline.",

    table: [
      {
        feature: "Complexity-based routing",
        nadir: "Per-prompt classifier, 3 to 4 tiers.",
        them: "Failover and rules. You pick the tier.",
      },
      {
        feature: "Fee structure",
        nadir: "Percent of savings. Zero fee if no savings.",
        them: "5% markup on all inference.",
      },
      {
        feature: "Semantic cache",
        nadir: "Yes.",
        them: "Yes.",
      },
      {
        feature: "PII redaction",
        nadir: "Yes, plus opt-in hash-only prompt storage.",
        them: "Yes.",
      },
      {
        feature: "Savings report versus always-Opus baseline",
        nadir: "Yes. It is the headline metric.",
        them: "Spend analytics, no benchmark delta.",
      },
      {
        feature: "Open source core",
        nadir: "Yes. MIT.",
        them: "No.",
      },
    ],

    sections: [
      {
        heading: "Where your money goes",
        body: "Nadir moves traffic off the premium tier when the prompt does not need it. That is the savings lever on a mixed workload. A semantic cache helps on repeated prompts. A markup on inference does not help at all.\n\nOn a $5,000/month workload, the typical shape with Nadir is about $1,900 saved, $475 variable fee, $9 base. Net near $1,415/month back. A 5% discount-via-markup math on the same $5,000 is $250 in a different direction.",
      },
      {
        heading: "What Nadir ships",
        body: "OpenAI compatible. Swap your base URL, set model to auto. BYOK. Failover chain. Quality floor per API key. Semantic cache at 85 to 90% similarity. PII redaction with opt-in hash-only prompt storage. A savings dashboard that compares routed cost against always-Opus, so the number is not a claim, it is a row.\n\nOCR closes the loop: live responses adjust future routing, calibration probes test whether a cheaper tier has closed the gap. The router does not freeze on day one.",
      },
      {
        heading: "If you want a full gateway",
        body: "Nadir is narrower than a governance platform and deeper on the routing decision. If you need geo residency, SSO, and a single vendor for gateway, guardrails, and observability, that is a different shopping list. Nadir focuses on the dollars you would otherwise hand to the premium tier.",
      },
    ],

    verdict:
      "Nadir is a router billed on savings. A 5% markup is billed on spend. Pick the one whose incentives match yours.",

    whenToPickThem: [
      "You need a single vendor for gateway, guardrails, and observability.",
      "You already have the right model pinned per call.",
    ],
    whenToPickNadir: [
      "Your premium-model spend is the single largest AI line item.",
      "You want fees that only exist when savings exist.",
      "You want the system to make the tier decision for you.",
      "You want a gross-versus-net savings number against always-Opus on your dashboard.",
    ],
  },

  {
    slug: "litellm",
    competitor: "LiteLLM",
    competitorUrl: "https://www.litellm.ai",
    category: "OSS SDK + proxy",
    tagline: "Nadir is the routing brain. LiteLLM is how the call gets placed.",
    oneLiner:
      "Nadir decides which model to call. LiteLLM is plumbing. These are not competitors, they are layers. Nadir runs LiteLLM inside its backend.",
    updatedAt: "2026-04-19",
    readingTime: "5 min read",

    tldr: [
      "Nadir is the routing brain. LiteLLM is the execution layer. Nadir runs LiteLLM inside its backend.",
      "You do not write model_list, routing rules, or the eval loop. The classifier, ranker, and OCR ship trained and ready.",
      "OCR closed-loop routing is a system, not a library feature. Self-rolled routing on LiteLLM has to rebuild this from scratch.",
      "Nadir Open (NadirClaw) is MIT and self-hostable, same as LiteLLM, but it ships the decision engine instead of just the surface.",
    ],

    keyAdvantages: [
      {
        title: "Ships the routing decision",
        body: "Classifier, ranker, OCR, Context Optimize, semantic cache, quality floors, failover, and the savings dashboard as one product. On LiteLLM you assemble the same stack yourself and maintain it forever.",
        proof: "Classifier overhead under 10 ms. 96% oracle agreement on our public eval.",
      },
      {
        title: "OCR closed-loop adaptation",
        body: "A library executes. It does not learn. Nadir watches live responses, updates quality signals fast and cost signals slow, and runs calibration probes as providers change. The router does not freeze on day one.",
        proof: "Gap closes inside a few thousand requests at 2.16% overhead.",
      },
      {
        title: "Benchmarked savings",
        body: "The savings dashboard compares every routed call against an always-Opus baseline. The number is a row in your DB, not a claim in a deck.",
        proof: "Routed cost versus always-Opus shown per request in usage_logs.",
      },
      {
        title: "Layers, not competitors",
        body: "Your app calls Nadir. Nadir classifies and ranks. LiteLLM executes the provider call inside Nadir. If you already run a LiteLLM proxy, Nadir plugs in as the router and hands calls back. Keep what works.",
        proof: "OpenAI compatible, BYOK, swap base URL.",
      },
    ],

    positioning:
      "The honest comparison is self-rolled routing on LiteLLM versus Nadir on LiteLLM. Nadir ships the classifier, the ranker, OCR, Context Optimize, semantic cache, and the savings dashboard as one product. You get the routing decision without owning the pipeline.",

    theirPricing:
      "OSS is free. Enterprise license is custom.",

    nadirPricing:
      "$9/month base, variable 25%/10% on savings. Nadir Open (self-host) is MIT, free, and ships the classifier plus 4-tier routing.",

    table: [
      {
        feature: "Pick the model automatically per prompt",
        nadir: "Yes. Classifier-driven.",
        them: "No. You write model_list and rules.",
      },
      {
        feature: "Unified OpenAI compatible API",
        nadir: "Yes.",
        them: "Yes.",
      },
      {
        feature: "Semantic cache built in",
        nadir: "Yes.",
        them: "Available as an integration.",
      },
      {
        feature: "Closed-loop routing update",
        nadir: "OCR adjusts from live responses.",
        them: "Not the job of the library.",
      },
      {
        feature: "Savings benchmark versus always-Opus",
        nadir: "Yes.",
        them: "No.",
      },
      {
        feature: "Open source core",
        nadir: "Yes. MIT.",
        them: "Yes. MIT.",
      },
    ],

    sections: [
      {
        heading: "What you save by not building it",
        body: "A self-rolled router on LiteLLM is a classifier, a ranker, an eval loop, a calibration system, a semantic cache, a savings dashboard, and a lot of glue. Each piece is tractable. Maintaining all of them is the product.\n\nNadir ships that stack. You get classifier-driven routing, OCR for drift, Context Optimize for token reduction, semantic cache with TTL, failover chains, quality floors per key, and a dashboard that shows routed cost versus always-Opus. Your job is the app.",
      },
      {
        heading: "How the layers fit",
        body: "Your app calls Nadir. Nadir classifies and ranks. LiteLLM executes the provider call inside the Nadir backend. You do not wire LiteLLM yourself.\n\nIf you already run LiteLLM and like the spend attribution, keep it. Nadir plugs in as the router and hands calls back to your LiteLLM proxy. The routing decision is the piece we add.",
      },
      {
        heading: "The numbers that matter to you",
        body: "Classifier overhead is under 10 ms. Agreement with human labels on our 50-prompt public eval is 96%, with zero catastrophic routes. On a $5,000/month mixed workload, the shape usually lands near $1,900 saved, $475 variable fee, $9 base.",
      },
    ],

    verdict:
      "Nadir is the routing decision you would otherwise build on top of LiteLLM. Skip the build.",

    whenToPickThem: [
      "You want a self-hosted OpenAI compatible proxy and are fine writing the routing rules yourself.",
    ],
    whenToPickNadir: [
      "You want a classifier to pick the tier automatically.",
      "You want the savings number as the KPI, not a stretch goal.",
      "You would rather not maintain model_list, eval loop, and calibration yourself.",
      "You want OCR to keep the router honest as models change.",
    ],
  },

  {
    slug: "notdiamond",
    competitor: "Not Diamond",
    competitorUrl: "https://www.notdiamond.ai",
    category: "ML routing recommender",
    tagline: "One system that decides, executes, and adapts.",
    oneLiner:
      "Nadir picks the model and places the call. Not Diamond returns a recommendation and asks your code to place the call through a separate gateway. One vendor versus two, and the billing unit is different.",
    updatedAt: "2026-04-19",
    readingTime: "5 min read",

    tldr: [
      "Nadir decides AND executes. Not Diamond returns a recommendation and hands execution back to your gateway.",
      "OCR adapts the router from live responses. A trained recommender is static per version until you retrain it.",
      "The classifier ships trained. No labeling project, no cold start, no sample collection phase.",
      "Semantic cache, Context Optimize, failover, and quality floors are bundled, not separate products.",
    ],

    keyAdvantages: [
      {
        title: "One product decides and executes",
        body: "Nadir classifies, ranks, and places the call. A recommender needs a gateway underneath, which is two vendors, two contracts, two failure modes. Nadir is one URL, one key, one dashboard.",
        proof: "OpenAI compatible endpoint. BYOK. Failover chains included.",
      },
      {
        title: "OCR instead of retrain cycles",
        body: "A trained router is as good as it was the day you trained it. Providers ship silent upgrades, Haiku gets smarter, Opus gets cheaper. Nadir's OCR watches every response and calibrates against the new reality. No retrain ticket.",
        proof: "Calibration closes the gap inside a few thousand requests at 2.16% overhead.",
      },
      {
        title: "No labeling project to start",
        body: "The classifier ships trained with 96% oracle agreement on our public eval. You plug in and route immediately. No sample collection, no human labels, no model training runway.",
        proof: "Classifier overhead under 10 ms. Zero catastrophic routes on the eval.",
      },
      {
        title: "Bundled, not a la carte",
        body: "Semantic cache, Context Optimize, quality floors, PII redaction, hash-only prompt storage, failover chains, and the savings dashboard come with the router. Not Diamond charges separately for prompt optimization.",
        proof: "29 to 71% input token reduction from Context Optimize alone.",
      },
    ],

    positioning:
      "Nadir is one product that makes the decision and places the call. It adapts to model drift without a retrain. You do not need a separate gateway underneath, and you do not need a labeling phase to start.",

    theirPricing:
      "Pay-as-you-go per routing recommendation, with a separate charge per prompt optimization.",

    nadirPricing:
      "$9/month base plus 25%/10% variable on savings. Routing decisions are not metered separately.",

    table: [
      {
        feature: "Executes the LLM call",
        nadir: "Yes.",
        them: "No. You pair it with a gateway.",
      },
      {
        feature: "Billing unit",
        nadir: "Base plus percent of savings.",
        them: "Per-recommendation.",
      },
      {
        feature: "Routing approach",
        nadir: "DistilBERT classifier plus ranker, with OCR closed-loop.",
        them: "Trained router per customer, static per version.",
      },
      {
        feature: "Adapts when providers change silently",
        nadir: "Yes. OCR plus calibration probes.",
        them: "Requires a retrain.",
      },
      {
        feature: "Semantic cache",
        nadir: "Yes.",
        them: "No.",
      },
      {
        feature: "Context Optimize (token compression)",
        nadir: "Yes, included.",
        them: "Separate paid product.",
      },
      {
        feature: "Open source option",
        nadir: "Yes. MIT, NadirClaw.",
        them: "No.",
      },
    ],

    sections: [
      {
        heading: "One product, not two",
        body: "A routing recommender needs a gateway underneath to actually place calls. That is two vendors, two contracts, two failure modes, and two billing units stacked on top of inference.\n\nNadir ships the decision and the execution. OpenAI compatible endpoint, BYOK, failover chain, quality floor per key, semantic cache, and Context Optimize are all in the same product. One URL, one API key, one dashboard.",
      },
      {
        heading: "Static routers rot",
        body: "A trained router is as good as it was the day you trained it. Providers ship silent upgrades. Haiku gets smarter. Opus gets cheaper. A fine-tune changes behavior. A static artifact does not know.\n\nNadir's OCR layer watches every response. Binary quality failures update fast. Cost signals update slow. Calibration probes test whether a cheaper tier can now handle traffic routed to an expensive one. In simulation, calibration closes the gap inside a few thousand requests at 2.16% overhead.",
      },
      {
        heading: "Billing that matches incentives",
        body: "Per-decision fees scale with traffic whether or not the routing saved you anything. Nadir's variable fee is a percentage of dollars saved versus an always-Opus baseline. If we do not save you money, you do not pay the variable. The math is a row on your dashboard.",
      },
    ],

    verdict:
      "Nadir is a full router billed on savings with live adaptation. You do not need a second product to place the call.",

    whenToPickThem: [
      "You have a narrow, labeled, stable workload and already run your own gateway.",
    ],
    whenToPickNadir: [
      "You want one system that both decides and executes.",
      "You want the router to adapt when provider models change.",
      "You prefer percent-of-savings to per-decision fees.",
      "You do not want to run a labeling project to get started.",
    ],
  },

  {
    slug: "portkey",
    competitor: "Portkey",
    competitorUrl: "https://portkey.ai",
    category: "AI gateway + observability + MCP",
    tagline: "Fees tied to savings, not to log lines.",
    oneLiner:
      "Nadir lowers your underlying model bill by routing each prompt to the cheapest model that can handle it. The billing unit is savings. It is not per-log-line, so the fee does not grow because your traffic did.",
    updatedAt: "2026-04-19",
    readingTime: "5 min read",

    tldr: [
      "Nadir is a router. Portkey is a governance platform. One decides which model to call, one logs and audits what was called. Different jobs.",
      "A DistilBERT classifier picks the tier in under 10 ms with 96% oracle agreement. Portkey leaves the tier to your fallback config.",
      "OCR closed-loop routing adapts when providers change. A gateway cannot do this, because it does not own the decision.",
      "Hash-only prompt storage, circuit breakers, provider health scoring, and zero-completion insurance ship in-box. The reliability layer is not an add-on.",
    ],

    keyAdvantages: [
      {
        title: "A router, not a logger",
        body: "The classifier decides Haiku, Sonnet, or Opus per prompt. Portkey does fallbacks, load balancing, and retries. Those are execution policies, not routing decisions. The cost lever is the decision, not the retry.",
        proof: "96% oracle agreement on our 50-prompt public eval, zero catastrophic routes, classifier overhead under 10 ms.",
      },
      {
        title: "OCR closed-loop adaptation",
        body: "Live quality failures update the router fast. Cost signals update slow. Calibration probes rerun traffic against cheaper tiers when providers ship upgrades. A gateway has no opinion about what the right model was.",
        proof: "Gap closes inside a few thousand requests at 2.16% overhead.",
      },
      {
        title: "Privacy that survives audit",
        body: "Opt-in hash-only prompt storage writes SHA-256 of the prompt instead of the text, drops the response, and stamps metadata.prompt_hashed=true. The redaction runs on the primary log path and the fallback path, so nothing leaks on errors.",
        proof: "Both paths run through _redact_for_privacy before any write.",
      },
      {
        title: "Reliability layer built in",
        body: "Circuit breakers trip after 5 failures, re-probe at 60 seconds. Provider health is scored on a rolling window weighted 40/30/20/10 on success, latency, trend, and volume. Zero-completion insurance: empty responses do not bill, they retry on fallback.",
        proof: "Three states, Closed to Open to Half-Open, with automatic recovery.",
      },
    ],

    positioning:
      "Nadir is the decision engine: classify, rank, call, adapt. Portkey is the oversight layer: log, audit, govern. Smart teams run both. If you already run Portkey and the premium-model bill is still climbing, that is the routing decision, which is the piece Nadir solves.",

    theirPricing:
      "Tiered on recorded log lines, with Enterprise contracts above the log caps.",

    nadirPricing:
      "$9/month base, 25% on the first $2,000 of savings, 10% above. BYOK included. Self-host (NadirClaw) is free and MIT. Logs are not billed separately.",

    table: [
      {
        feature: "Automatic complexity-based routing",
        nadir: "Yes, per prompt.",
        them: "No. Fallbacks and load balancing only.",
      },
      {
        feature: "Billing unit",
        nadir: "Percent of savings. No per-log billing.",
        them: "Dollars per 100K log lines.",
      },
      {
        feature: "Guardrails (PII, content)",
        nadir: "PII redaction, opt-in hash-only prompt storage.",
        them: "Broader guardrail surface.",
      },
      {
        feature: "Semantic cache",
        nadir: "Yes.",
        them: "Yes, above a tier.",
      },
      {
        feature: "Savings versus always-Opus dashboard",
        nadir: "Yes. Headline metric.",
        them: "Spend dashboards, no benchmark delta.",
      },
      {
        feature: "Open source core",
        nadir: "Yes. MIT.",
        them: "No.",
      },
    ],

    sections: [
      {
        heading: "Billing on savings versus billing on logs",
        body: "Per-log pricing grows with traffic. An agent at 50 calls per session and 10K sessions per day is 15M log lines a month. That is a contract, not a line item.\n\nNadir's variable fee is 25% on the first $2,000 of savings and 10% above. If routing saves nothing, the variable is zero. If traffic scales and the routing keeps working, the fee scales with the benefit, not with log volume.",
      },
      {
        heading: "What Nadir ships",
        body: "OpenAI compatible endpoint. Swap your base URL, set model to auto. BYOK. Failover chain. Quality floor per API key. Semantic cache at 85 to 90% similarity. PII redaction with opt-in hash-only prompt storage. Context Optimize for token reduction on the input. A dashboard that compares routed cost against always-Opus.\n\nClassifier overhead is under 10 ms. Agreement with human labels on our 50-prompt public eval is 96%, with zero catastrophic routes.",
      },
      {
        heading: "If you need a full governance platform",
        body: "Nadir is narrow on purpose. The routing decision is the piece we make better. If you also need MCP governance, prompt studio, and full observability under one contract, that is a larger platform purchase. Nadir runs alongside it and targets the underlying model spend.",
      },
    ],

    verdict:
      "Nadir is vertical on cost and billed on savings. If the premium-model bill is the problem, that is the shape of the fix.",

    whenToPickThem: [
      "You need MCP governance and a prompt studio under one contract.",
      "You are in a regulated industry that needs BAA or HIPAA up front.",
    ],
    whenToPickNadir: [
      "Your premium-model spend is the problem you actually need solved.",
      "You do not want per-log-line pricing.",
      "You want the routing decision made for you, not configured by you.",
      "You want a router that adapts as models change.",
    ],
  },
];

export class CompareService {
  static getAll(): ComparePage[] {
    return pages;
  }

  static get(slug: string): ComparePage | null {
    return pages.find((p) => p.slug === slug) ?? null;
  }
}
