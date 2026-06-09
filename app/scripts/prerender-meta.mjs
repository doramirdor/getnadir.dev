/**
 * Build-time per-route meta injection.
 *
 * This is a Vite SPA: the production build emits a single `dist/index.html`,
 * and Netlify's `/* -> /index.html 200` fallback serves that same file for
 * every route. That means non-JS consumers (AI crawlers like GPTBot /
 * ClaudeBot / PerplexityBot, social unfurlers, and any bot that does not
 * execute JS) see the HOMEPAGE title, description, and `canonical=https://
 * getnadir.com/` on every URL. Our per-page `<SEO>` component only patches
 * the head client-side, after JS runs, so those consumers never see it.
 *
 * This script runs after `vite build` and writes a `dist/<route>/index.html`
 * for each static marketing route, with the page's own title, description,
 * canonical, and Open Graph / Twitter tags baked into the static HTML.
 * Netlify serves an existing file before applying the non-forced `/*`
 * rewrite, so these win for crawlers while the React app still boots from
 * them and client-side routing is unchanged.
 *
 * KEEP IN SYNC: the title/description values below mirror the `<SEO>` props
 * in the corresponding page components. If you change a page's SEO copy,
 * update it here too. (Google renders JS and will pick up the component
 * value regardless; this is the static fallback for everything that does
 * not run JS.) Dynamic routes that are not enumerated here — blog posts,
 * docs sections, unknown compare slugs — fall through to the homepage
 * fallback, same as before.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://getnadir.com";
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const TEMPLATE = join(DIST, "index.html");

// Compare competitor pages: description == the page tagline (see
// services/compareService.ts), title == `Nadir vs <name> | Comparison`.
const COMPARE = [
  ["openrouter", "OpenRouter", "If your Opus bill is the problem, a model list is not the fix."],
  ["requesty", "Requesty", "A markup on inference is not a savings mechanism."],
  ["litellm", "LiteLLM", "Nadir is the routing brain. LiteLLM is how the call gets placed."],
  ["notdiamond", "Not Diamond", "One system that decides, executes, and adapts."],
  ["portkey", "Portkey", "Fees tied to savings, not to log lines."],
];

/** @type {{path:string,title:string,description:string}[]} */
const ROUTES = [
  {
    path: "/pricing",
    title: "Pricing - Nadir",
    description:
      "No base fee. Bring your own keys or use ours. Either way, you pay only on what we save you: 25% of the first $2K, 10% above. Self-host NadirClaw for free under MIT.",
  },
  {
    path: "/calculator",
    title: "Savings Calculator - Nadir | Estimate Your LLM Cost Reduction",
    description:
      "Estimate how much Nadir cuts your LLM bill. Interactive calculator defaulting to the 60% savings rate measured on the RouterBench held-out benchmark.",
  },
  {
    path: "/solutions",
    title: "Solutions - Nadir",
    description:
      "Nadir solutions: context optimization, LLM routing, provider fallback, analytics, and prompt clustering. Everything you need to cut LLM spend without giving up quality.",
  },
  {
    path: "/solutions/routing",
    title: "LLM Routing - Nadir",
    description:
      "Verifier-gated cascade: the cheap model answers first, the verifier scores it, escalate only when quality fails the bar. 60% cost reduction with 98% of always-Opus quality preserved on 11,420 RouterBench held-out triples.",
  },
  {
    path: "/solutions/fallback",
    title: "Fallback - Nadir",
    description:
      "Provider outages, rate limits, and 5xx errors happen. Nadir reroutes to a healthy model in the same tier so your app stays up.",
  },
  {
    path: "/solutions/analytics",
    title: "Analytics - Nadir",
    description:
      "Per-request logs, spend breakdowns, latency percentiles, routing accuracy, and catastrophic-route detection. Built into every Nadir account.",
  },
  {
    path: "/solutions/clustering",
    title: "Prompt Clustering (Coming Soon) - Nadir",
    description:
      "See the real shape of your LLM traffic. Prompt Clustering groups semantically similar prompts, surfaces duplicates, and tells you which workloads drive your bill.",
  },
  {
    path: "/compare",
    title: "Nadir vs alternatives | LLM router comparisons",
    description:
      "Deep-dive comparisons between Nadir and OpenRouter, Requesty, LiteLLM, Not Diamond, and Portkey.",
  },
  ...COMPARE.map(([slug, name, tagline]) => ({
    path: `/compare/${slug}`,
    title: `Nadir vs ${name} | Comparison`,
    description: tagline,
  })),
  {
    path: "/contact",
    title: "Contact Nadir | Talk to sales or support",
    description:
      "Get in touch with the Nadir team. Sales, enterprise plans, support, and partnership inquiries.",
  },
  {
    path: "/openclaw",
    title: "NadirClaw | Self-Host Your Own LLM Router | MIT Licensed",
    description:
      "Self-hosted LLM router that cuts API costs up to 40%. 4-tier routing, context optimization, fallback chains. MIT licensed, runs locally.",
  },
  {
    path: "/optimize",
    title: "Context Optimize - Nadir | Cut LLM Input Tokens 30-70%",
    description:
      "Lossless context optimization that trims bloated LLM payloads before they hit your bill. Safe mode free, aggressive mode on the hosted plan.",
  },
  {
    path: "/docs",
    title: "Documentation - Nadir | Setup, Config & API Reference",
    description:
      "Get started with Nadir in 2 commands. Full docs for routing, context optimization, and CLI.",
  },
  {
    path: "/blog",
    title: "Blog - Nadir | LLM Cost Optimization Guides",
    description:
      "Practical guides to cutting LLM API costs with intelligent routing and context optimization.",
  },
  {
    path: "/terms",
    title: "Terms of Service - Nadir",
    description: "Terms of service for Nadir Tech LLC.",
  },
  {
    path: "/privacy",
    title: "Privacy Policy - Nadir",
    description: "Privacy policy for Nadir Tech LLC.",
  },
];

const escapeAttr = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escapeText = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Replace a tag matched by `re` using a builder, asserting it matched once so
// a template change that breaks a selector fails the build loudly rather than
// silently shipping stale meta.
function replaceOnce(html, re, build, label, route) {
  let hit = 0;
  const out = html.replace(re, (m) => {
    hit++;
    return build(m);
  });
  if (hit !== 1) {
    throw new Error(
      `prerender-meta: expected exactly 1 "${label}" in template for ${route}, found ${hit}. The index.html head changed — update this script.`,
    );
  }
  return out;
}

function renderRoute(template, { path, title, description }) {
  const url = `${BASE_URL}${path}`;
  const t = escapeText(title);
  const ta = escapeAttr(title);
  const d = escapeAttr(description);
  let html = template;
  html = replaceOnce(html, /<title>[\s\S]*?<\/title>/, () => `<title>${t}</title>`, "title", path);
  html = replaceOnce(
    html,
    /<meta name="description" content="[\s\S]*?"\s*\/>/,
    () => `<meta name="description" content="${d}" />`,
    "meta description",
    path,
  );
  html = replaceOnce(
    html,
    /<link rel="canonical" href="[\s\S]*?"\s*\/>/,
    () => `<link rel="canonical" href="${url}" />`,
    "canonical",
    path,
  );
  html = replaceOnce(
    html,
    /<meta property="og:title" content="[\s\S]*?"\s*\/>/,
    () => `<meta property="og:title" content="${ta}" />`,
    "og:title",
    path,
  );
  html = replaceOnce(
    html,
    /<meta property="og:description" content="[\s\S]*?"\s*\/>/,
    () => `<meta property="og:description" content="${d}" />`,
    "og:description",
    path,
  );
  html = replaceOnce(
    html,
    /<meta property="og:url" content="[\s\S]*?"\s*\/>/,
    () => `<meta property="og:url" content="${url}" />`,
    "og:url",
    path,
  );
  html = replaceOnce(
    html,
    /<meta name="twitter:title" content="[\s\S]*?"\s*\/>/,
    () => `<meta name="twitter:title" content="${ta}" />`,
    "twitter:title",
    path,
  );
  html = replaceOnce(
    html,
    /<meta name="twitter:description" content="[\s\S]*?"\s*\/>/,
    () => `<meta name="twitter:description" content="${d}" />`,
    "twitter:description",
    path,
  );
  return html;
}

const template = readFileSync(TEMPLATE, "utf8");
let count = 0;
for (const route of ROUTES) {
  const html = renderRoute(template, route);
  const outDir = join(DIST, route.path);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html, "utf8");
  count++;
}
console.log(`prerender-meta: wrote ${count} per-route HTML files into dist/`);
