// Generates dist/sitemap.xml from the same route list used by the prerenderer,
// so the sitemap can never drift from what actually ships. Run after build.
//
// Usage: node prerender/gen-sitemap.mjs  (run from app/, writes into dist/)

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ROUTES, SITE_ORIGIN } from "./routes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "dist");

const lastmod = new Date().toISOString().slice(0, 10);

const urls = ROUTES.map((r) => {
  const loc = `${SITE_ORIGIN}${r.path === "/" ? "/" : r.path}`;
  return [
    "  <url>",
    `    <loc>${loc}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${r.changefreq}</changefreq>`,
    `    <priority>${r.priority.toFixed(1)}</priority>`,
    "  </url>",
  ].join("\n");
}).join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

await writeFile(join(DIST, "sitemap.xml"), xml, "utf-8");
console.log(`Wrote dist/sitemap.xml with ${ROUTES.length} URLs (lastmod ${lastmod}).`);
