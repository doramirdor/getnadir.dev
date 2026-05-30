// Single source of truth for the site's public, prerenderable routes.
// Consumed by prerender.mjs (static HTML generation) and gen-sitemap.mjs
// (sitemap.xml generation) so the two never drift apart.
//
// Keep auth-gated routes (/dashboard/*, /auth/*) OUT of this list: they
// require a session, have nothing useful for crawlers, and should not be
// prerendered or advertised in the sitemap.

// Competitor slugs backing /compare/:competitor (see compareService.ts).
export const COMPETITORS = [
  "openrouter",
  "requesty",
  "litellm",
  "notdiamond",
  "portkey",
];

// Blog post ids backing /blog/:id (see blogService.ts).
export const BLOG_POSTS = [
  "500m-claude-bill-spending-caps-wrong-fix",
  "gartner-inference-costs-drop-90-percent-routing-stronger",
  "datadog-69-percent-tokens-system-prompts",
  "routing-without-verification-dead-reckoning",
  "finops-ai-98-percent-manage-spend-visibility-gap",
  "microsoft-cancelled-claude-code-ai-coding-cost-crisis",
  "enterprise-seven-models-no-routing-layer",
  "uber-burned-ai-budget-four-months",
  "coding-agents-burn-1000x-tokens-research",
  "flat-rate-ai-over-metered-billing",
  "deepseek-v4-pricing-war-routing",
  "github-ai-agent-token-waste",
  "finops-for-ai-cost-governance",
  "ai-jevons-paradox-token-costs",
  "enterprise-ai-costs-routing-2026",
  "opus-4-7-tokenizer-hidden-cost",
  "agentic-ai-token-costs",
  "ocr-closed-loop-routing",
  "routerbench-cascade-benchmark",
  "context-optimize-savings",
  "why-we-built-nadir",
  "how-binary-classifier-works",
  "nadir-vs-always-premium",
];

// Static top-level routes with sitemap priority + change frequency hints.
const STATIC_ROUTES = [
  { path: "/", priority: 1.0, changefreq: "weekly" },
  { path: "/pricing", priority: 0.9, changefreq: "monthly" },
  { path: "/calculator", priority: 0.9, changefreq: "monthly" },
  { path: "/compare", priority: 0.8, changefreq: "monthly" },
  { path: "/solutions", priority: 0.8, changefreq: "monthly" },
  { path: "/solutions/routing", priority: 0.7, changefreq: "monthly" },
  { path: "/solutions/fallback", priority: 0.7, changefreq: "monthly" },
  { path: "/solutions/analytics", priority: 0.7, changefreq: "monthly" },
  { path: "/solutions/clustering", priority: 0.7, changefreq: "monthly" },
  { path: "/solutions/optimize", priority: 0.7, changefreq: "monthly" },
  { path: "/optimize", priority: 0.7, changefreq: "monthly" },
  { path: "/self-host", priority: 0.7, changefreq: "monthly" },
  { path: "/openclaw", priority: 0.6, changefreq: "monthly" },
  { path: "/docs", priority: 0.8, changefreq: "weekly" },
  { path: "/blog", priority: 0.8, changefreq: "weekly" },
  { path: "/contact", priority: 0.5, changefreq: "yearly" },
  { path: "/privacy", priority: 0.3, changefreq: "yearly" },
  { path: "/terms", priority: 0.3, changefreq: "yearly" },
];

// The full, expanded list of routes to prerender and to list in the sitemap.
export const ROUTES = [
  ...STATIC_ROUTES,
  ...COMPETITORS.map((slug) => ({
    path: `/compare/${slug}`,
    priority: 0.7,
    changefreq: "monthly",
  })),
  ...BLOG_POSTS.map((id) => ({
    path: `/blog/${id}`,
    priority: 0.6,
    changefreq: "monthly",
  })),
];

export const SITE_ORIGIN = "https://getnadir.com";
