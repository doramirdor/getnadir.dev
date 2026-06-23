/**
 * Build-time per-route meta injection + sitemap generation.
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
 * for each static marketing route AND each blog post, with the page's own
 * title, description, canonical, and Open Graph / Twitter tags baked into the
 * static HTML. Netlify serves an existing file before applying the non-forced
 * `/*` rewrite, so these win for crawlers while the React app still boots from
 * them and client-side routing is unchanged.
 *
 * Blog posts additionally get an `og:type=article` and a `BlogPosting`
 * JSON-LD block (headline, description, dates, author, and the full article
 * body as text) so the post is fully described in the static HTML even before
 * Google's JS-rendering pass runs. Without this, every `/blog/<slug>` URL
 * inherited the homepage's self-referencing `canonical=https://getnadir.com/`,
 * which tells Google each post is a duplicate of the homepage.
 *
 * This script also regenerates `dist/sitemap.xml` from the live blog data, so
 * every post is listed (the old hand-maintained `public/sitemap.xml` covered
 * only a stale subset and has been removed in favor of this generator).
 *
 * KEEP IN SYNC: the title/description values below mirror the `<SEO>` props
 * in the corresponding page components. If you change a page's SEO copy,
 * update it here too. (Google renders JS and will pick up the component
 * value regardless; this is the static fallback for everything that does
 * not run JS.) Blog post metadata is read from the source of truth
 * (`src/services/blogService.ts`) so posts never need manual entry here.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const BASE_URL = "https://getnadir.com";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const TEMPLATE = join(DIST, "index.html");
const BLOG_SERVICE = join(ROOT, "src", "services", "blogService.ts");

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
    path: "/producthunt",
    title: "Nadir: LLM router that cuts your AI bill 60% | Product Hunt",
    description:
      "Route every prompt to the cheapest model that can handle it. 60% cost savings, 98% quality preserved. Two-line integration, OpenAI compatible.",
  },
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
    path: "/switch",
    title: "Switch to Nadir | One-line migration from OpenAI, Bedrock & Anthropic",
    description:
      "Nadir is an OpenAI-compatible LLM router. Move your OpenAI, AWS Bedrock, or Anthropic calls onto Nadir by swapping the base URL and setting model=auto. See the exact diff.",
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

// Static (non-blog) URLs for the sitemap, with their crawl hints. Blog posts
// are appended from the live blog data below. Mirrors the public marketing
// surface; campaign-only routes (/producthunt, /switch) are intentionally
// omitted from the sitemap even though they get prerendered HTML.
const SITEMAP_STATIC = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pricing", changefreq: "monthly", priority: "0.9" },
  { path: "/calculator", changefreq: "monthly", priority: "0.9" },
  { path: "/solutions", changefreq: "monthly", priority: "0.8" },
  { path: "/solutions/routing", changefreq: "monthly", priority: "0.8" },
  { path: "/solutions/fallback", changefreq: "monthly", priority: "0.8" },
  { path: "/solutions/analytics", changefreq: "monthly", priority: "0.8" },
  { path: "/solutions/clustering", changefreq: "monthly", priority: "0.8" },
  { path: "/compare", changefreq: "monthly", priority: "0.8" },
  ...COMPARE.map(([slug]) => ({
    path: `/compare/${slug}`,
    changefreq: "monthly",
    priority: "0.8",
  })),
  { path: "/contact", changefreq: "monthly", priority: "0.6" },
  { path: "/openclaw", changefreq: "monthly", priority: "0.7" },
  { path: "/optimize", changefreq: "monthly", priority: "0.6" },
  { path: "/docs", changefreq: "weekly", priority: "0.8" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
];

// Build date stamps the static-page <lastmod> entries. Blog posts use their
// own publish date instead.
const BUILD_DATE = new Date().toISOString().slice(0, 10);

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

// Flatten the markdown blog body to readable plain text for the BlogPosting
// JSON-LD `articleBody`. This is not a full markdown renderer — it strips
// syntax so the prose is indexable, which is all `articleBody` needs.
function toPlainText(md) {
  if (!md) return "";
  let t = md;
  t = t.replace(/```[^\n]*\n?/g, ""); // fenced code fence/lang lines (keep inner text)
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"); // images -> alt
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links -> text
  t = t.replace(/^[ \t]*#{1,6}[ \t]+/gm, ""); // headings
  t = t.replace(/^[ \t]*>[ \t]?/gm, ""); // blockquotes
  t = t.replace(/^[ \t]*[-*+][ \t]+/gm, ""); // unordered list markers
  t = t.replace(/^[ \t]*\d+\.[ \t]+/gm, ""); // ordered list markers
  t = t.replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, ""); // horizontal rules
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1"); // bold
  t = t.replace(/\*([^*]+)\*/g, "$1"); // italic
  t = t.replace(/`([^`]+)`/g, "$1"); // inline code
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

// Build the BlogPosting JSON-LD <script> for a post. `<` is escaped to its
// unicode form so an article body containing `</script>` cannot break out of
// the script element.
function postJsonLdScript(post, url) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "Nadir",
      logo: { "@type": "ImageObject", url: `${BASE_URL}/logo.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: `${BASE_URL}/og-image.png`,
    keywords: (post.tags || []).join(", "),
    articleBody: toPlainText(post.content),
  };
  const json = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">\n${json}\n    </script>`;
}

function renderBlogPost(template, post) {
  const path = `/blog/${post.id}`;
  const url = `${BASE_URL}${path}`;
  // Mirror BlogPost.tsx's <SEO> props: title `${post.title} - Nadir Blog`,
  // description == excerpt.
  let html = renderRoute(template, {
    path,
    title: `${post.title} - Nadir Blog`,
    description: post.excerpt,
  });
  // Blog posts are articles, not the website root.
  html = replaceOnce(
    html,
    /<meta property="og:type" content="[\s\S]*?"\s*\/>/,
    () => `<meta property="og:type" content="article" />`,
    "og:type",
    path,
  );
  // Append the BlogPosting JSON-LD just before </head>.
  html = replaceOnce(
    html,
    /<\/head>/,
    () => `  ${postJsonLdScript(post, url)}\n  </head>`,
    "</head>",
    path,
  );
  return html;
}

function generateSitemap(posts) {
  const urls = [
    ...SITEMAP_STATIC.map((u) => ({ ...u, lastmod: BUILD_DATE })),
    ...posts.map((p) => ({
      path: `/blog/${p.id}`,
      lastmod: p.date,
      changefreq: "monthly",
      priority: "0.7",
    })),
  ];
  const body = urls
    .map(
      (u) =>
        `  <url>\n` +
        `    <loc>${BASE_URL}${u.path}</loc>\n` +
        `    <lastmod>${u.lastmod}</lastmod>\n` +
        `    <changefreq>${u.changefreq}</changefreq>\n` +
        `    <priority>${u.priority}</priority>\n` +
        `  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// Load the blog data from its TypeScript source of truth. The file has no real
// module imports (the `import ...` lines inside it live in markdown code-block
// strings), so esbuild bundles it to a self-contained ESM module we can import
// from a data: URL without touching the filesystem.
async function loadPosts() {
  const result = await build({
    entryPoints: [BLOG_SERVICE],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  const { BlogService } = mod;
  return BlogService.getAllPosts().map((meta) => BlogService.getPostById(meta.id));
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

const posts = await loadPosts();
for (const post of posts) {
  const html = renderBlogPost(template, post);
  const outDir = join(DIST, "blog", post.id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html, "utf8");
  count++;
}

writeFileSync(join(DIST, "sitemap.xml"), generateSitemap(posts), "utf8");

console.log(
  `prerender-meta: wrote ${count} per-route HTML files (${posts.length} blog posts) ` +
    `and sitemap.xml with ${SITEMAP_STATIC.length + posts.length} URLs into dist/`,
);
