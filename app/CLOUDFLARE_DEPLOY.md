# Frontend hosting: Netlify → Cloudflare (Workers Static Assets)

Goal: drop the ~$9/mo Netlify cost. Cloudflare serves the static Vite SPA for
**$0** with unlimited bandwidth, commercial use allowed.

The Cloudflare project is a **Workers** project (its deploy step runs
`npx wrangler deploy`), so this uses **Workers Static Assets**, not the classic
Pages product. Both are free with unlimited bandwidth; the config differs.

## Files in this repo

- `app/wrangler.jsonc`   — assets-only Worker: serves `dist/`, SPA fallback via
  `not_found_handling`. **This is what makes the deploy work** (see below).
- `app/public/_headers`  — security headers + `/assets/*` immutable cache.
  Honored natively by Workers static assets (same syntax as Netlify/Pages).
- `app/.node-version`    — pins Node 20 for the Cloudflare builder.

There is no `_redirects` file: SPA routing is handled by
`not_found_handling: "single-page-application"` in `wrangler.jsonc`, which only
fires for paths that don't match a built asset (so it never shadows JS/CSS).

## Why the first deploys failed (and the fix)

The build succeeded but `npx wrangler deploy` errored:

```
The version of Vite used in the project ("5.4.10") cannot be automatically
configured. Please update the Vite version to at least "6.0.0".
```

With no wrangler config, wrangler auto-detects the framework and tries to set up
the Workers **Vite plugin**, which requires Vite ≥ 6. This app is on Vite 5.4.
`app/wrangler.jsonc` declares an explicit assets-only deploy, so wrangler skips
the plugin auto-config entirely — **no Vite upgrade needed**. Verified locally
with `npx wrangler deploy --dry-run` (reads 227 assets, exits clean).

## Project settings (Cloudflare dashboard → Workers & Pages → getnadir)

- Root directory: `app`
- Build command: `npm ci && npm run build`
- Deploy command: `npx wrangler deploy` (default; now succeeds with the config file)
- Environment variables (Production **and** Preview — Vite bakes these at build time):
  - `VITE_SUPABASE_URL=https://cxqmqnlouozrhsprtdcb.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=sb_publishable_61_pO9Hq4wpWLerMy-5J3w_hXj3x_CM`
  - `VITE_API_URL=https://api.getnadir.com`
  (All three are public — they ship in the client bundle. Never put backend
  secrets here; they would be exposed.)

## Verify before DNS cutover

After a green deploy, test on the `*.workers.dev` URL (production stays on
Netlify until DNS changes, so this is zero-risk):

```bash
# security headers applied?
curl -sI https://<url>/ | grep -iE 'content-security|strict-transport|x-frame'
# SPA fallback? deep link must return 200, not 404
curl -s -o /dev/null -w '%{http_code}\n' https://<url>/dashboard/settings
```

Also load it in a browser and confirm network calls hit `api.getnadir.com` +
`*.supabase.co` (proves the `VITE_` vars were set at build time).

## DNS cutover (current state verified 2026-06-23)

| Record | Value | Action |
|---|---|---|
| Nameservers | `dns{1..4}.p02.nsone.net` (**Netlify DNS / NS1**) | Move to Cloudflare, or keep + add a custom domain to the Worker |
| apex `getnadir.com` / `www` | Netlify anycast | Repoint to the Worker |
| `api.getnadir.com` | App Runner (`cgmuqcg2di.us-east-1.awsapprunner.com`) | **Leave untouched** |
| MX | `1 smtp.google.com` (Google Workspace) | **Must recreate if moving DNS** |
| TXT | 2× `google-site-verification` (+ any SPF/DKIM/DMARC) | **Must recreate if moving DNS** |

Cleanest: add `getnadir.com` to Cloudflare as a zone, verify the records above
carried over (especially MX + api), switch nameservers at the registrar, then
add the custom domain to the Worker (Workers & Pages → getnadir → Settings →
Domains & Routes). After it serves from Cloudflare and is verified, cancel the
Netlify plan. Rollback at any point = revert nameservers to Netlify.
