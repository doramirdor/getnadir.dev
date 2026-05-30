// Post-build prerenderer.
//
// The site is a client-rendered React SPA: the built dist/index.html ships an
// empty <div id="root"></div>, so search engines that don't run JS — and most
// AI crawlers (GPTBot, ClaudeBot, PerplexityBot) — see no content. This script
// loads each public route in a real browser, lets it hydrate (which also runs
// the SEO component that injects per-page <title>, meta, and JSON-LD), then
// writes the fully-rendered HTML back to dist/<route>/index.html.
//
// The result: crawlers get real HTML per route, while users still get the same
// interactive SPA (the inline scripts re-hydrate on load). No app refactor, no
// SSR-safety requirements.
//
// Usage: node prerender/prerender.mjs  (run from app/, after `vite build`)

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { ROUTES } from "./routes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");
const PORT = 4317;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

// Static file server with SPA fallback: unknown paths (client routes) serve
// index.html so the in-browser router can take over, exactly like Netlify's
// redirect rule does in production.
function startServer() {
  const indexHtml = join(DIST, "index.html");
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      let filePath = join(DIST, urlPath);
      if (urlPath === "/" || !extname(urlPath)) filePath = indexHtml;
      if (!existsSync(filePath)) filePath = indexHtml;
      const body = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(body);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

// Strip runtime-only artifacts so the prerendered HTML is a clean starting
// point that the SPA re-hydrates over, rather than a frozen snapshot.
const CLEANUP = `
  // Remove the live region / toast portals and any transient overlays that
  // should not be baked into the static HTML.
  document.querySelectorAll('[data-sonner-toaster], [data-radix-portal]').forEach((n) => n.remove());
`;

async function prerender() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.error("dist/index.html not found. Run `vite build` first.");
    process.exit(1);
  }

  const server = await startServer();

  // Launching the browser is the one step that can fail for environmental
  // reasons (missing system libs / Chromium not installed in the CI image).
  // If it does, we must NOT break the deploy: fall back to shipping the CSR
  // build that already works in production today. Individual route failures
  // are handled separately below.
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    server.close();
    console.warn(
      `\n⚠ Prerender skipped: could not launch a browser (${err.message.split("\n")[0]}).` +
        "\n  Shipping the client-rendered build unchanged. SEO/GEO prerender did not run.",
    );
    process.exit(0);
  }

  const page = await browser.newPage();

  let ok = 0;
  let failed = 0;

  for (const route of ROUTES) {
    const url = `http://localhost:${PORT}${route.path}`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      // Wait for the app to mount real content into #root.
      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return root && root.children.length > 0 && root.innerText.trim().length > 50;
        },
        { timeout: 20000 },
      );
      // Give SEO.tsx's useEffect a tick to inject title/meta/JSON-LD.
      await page.waitForTimeout(400);
      await page.evaluate(CLEANUP);

      const html = "<!DOCTYPE html>\n" + (await page.evaluate(() => document.documentElement.outerHTML));

      const outDir = route.path === "/" ? DIST : join(DIST, route.path);
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, "index.html"), html, "utf-8");
      ok++;
      console.log(`  ✓ ${route.path}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${route.path} — ${err.message.split("\n")[0]}`);
    }
  }

  await browser.close();
  server.close();

  console.log(`\nPrerendered ${ok}/${ROUTES.length} routes (${failed} failed).`);
  // Only fail the build catastrophically: if nothing prerendered, something is
  // fundamentally broken (browser, server, or build output). A few individual
  // route failures degrade gracefully — those routes simply ship as the CSR
  // shell, exactly as the whole site does today.
  if (ok === 0) process.exit(1);
}

prerender();
