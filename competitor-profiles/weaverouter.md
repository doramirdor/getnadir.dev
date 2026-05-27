# Weave Router (Workweave) — Competitor Profile

**URL**: https://weaverouter.com
**Repo**: https://github.com/workweave/router
**Parent**: Workweave / Weave (https://workweave.dev) — "AI to measure engineers and agents"
**Generated**: 2026-05-23
**Depth**: Deep profile, technical focus

---

## At a Glance

| Metric | Value |
|--------|-------|
| Tagline | "One endpoint. Every model. Always the right one." |
| Marketing claim | "#1 Ranked Prompt Router In the World" |
| Repo created | 2026-04-27 (about 4 weeks old) |
| License | Elastic License v2 (ELv2, source-available, anti-SaaS) |
| Stars | 29 |
| Forks | 2 |
| Open issues | 9 |
| Contributors | 3 (lead: steventohme, 192 commits) |
| Commit velocity | ~5 commits/day, last commit 2026-05-23 |
| Primary language | Go (80%), TypeScript (12%), Shell, SQL |
| Latest cluster artifact | v0.54 (retrained ~weekly) |
| Parent customers cited | Robinhood, PostHog, Reducto, The Gap |
| Pricing | Not public. Credits against Weave account, or BYOK self-hosted |
| Stack | Go + Postgres + ONNX runtime |

---

## Positioning & Messaging

**Headline**: "Weave Router: #1 Ranked Prompt Router In the World"

**Subheadline**: "Automatically selects the most cost-effective LLM for each prompt, reducing token spend by up to 70% with negligible added latency."

**Positioning angle**: Engineer-tool-first. Drop-in proxy for **agentic coding tools** (Claude Code, Codex, Cursor, opencode) before general SDK use. Sells "1.95x token mileage at 10B tokens/month."

**Key messaging themes**:
- Per-request routing via a small on-box embedder, not heuristics ("not vibes-based")
- Single endpoint speaks Anthropic Messages + OpenAI Chat Completions + Gemini natively
- BYOK with Tink AES-256-GCM at rest, encryption on the box
- Academic-paper-backed routing (Avengers-Pro, arXiv:2508.12631)
- "#1 on RouterArena" (see Strengths & Weaknesses below — claim is unverifiable)

**Target audience**: Engineering teams using AI coding assistants. Pitch focuses on devtool users who already pay for Claude Code / Codex / Cursor.

---

## How Their Routing Model Works (Technical Deep Dive)

This is the centerpiece of the comparison. Their algorithm is a **cluster scorer derived from Avengers-Pro** (Zhang et al., arXiv:2508.12631).

### Pipeline

1. **Embed the prompt.**
   - Model: `jinaai/jina-embeddings-v2-base-code`, INT8-quantized ONNX, ~not-their-quantization (Jina's official export).
   - Tokenizer + ONNX assets shipped at `/opt/router/assets/`.
   - Cap: 1024 characters per prompt (O(n²) attention; truncates long prompts).
   - Default embeds **only the user-role message** of the last turn (configurable to whole turn).

2. **Score against frozen cluster centroids.**
   - `centroids.bin` — write-once binary, never edited by hand.
   - At runtime: **single argmax** of (embedding similarity × baked α-blend weights) per cluster.
   - The α-blend weights mix cost vs accuracy and are **frozen at training time**, not runtime-tunable. To change the cost/accuracy trade-off you must retrain and ship a new artifact version.

3. **Look up the winning model.**
   - `rankings.json` maps cluster → ranked model list.
   - `model_registry.json` maps model name → provider binding + pricing.
   - Cost-per-1K-input prices are **baked into training**, so the artifact must be rebuilt when Anthropic changes prices.

4. **Dispatch via provider-native API.**
   - Native handlers for Anthropic Messages, OpenAI Chat, Gemini.
   - OSS models routed via OpenRouter (DeepSeek, Kimi, GLM, Qwen, Llama, Mistral).
   - Session pinning: multi-turn conversations stick to the first-routed model (configurable; default on).
   - Sticky decisions: optional per-API-key TTL to reuse a decision.

5. **Fail loud.**
   - If the cluster scorer can't run (missing model, embed timeout, etc.), the router returns **HTTP 503**. No silent fallback to a default model. By design.

### Versioning

- `artifacts/v0.54/`, `artifacts/latest` pointer file selects default.
- Per-request header `x-weave-cluster-version: v0.X` overrides version for eval / A/B.
- Recent commits show TAU2-weighted retrains; cluster updated 1-2x weekly.

### Performance claims

- "Low single-digit milliseconds" overhead per request (homepage)
- "Under 50ms" routing (repo description)
- "1.95x token mileage at 10B tokens/month"
- "Reduce costs 40-70%" (repo)
- "#1 on RouterArena, Acc-Cost Arena 76.09"

---

## Product & Features

### Core capabilities
- Per-request cluster-scorer routing
- Anthropic Messages + OpenAI Chat + Gemini native APIs (no SDK swap for clients)
- OpenRouter integration for OSS models
- BYOK with Tink AES-256-GCM at rest
- Session pinning + sticky decisions
- Hard-pin override for debugging (env var)
- OTLP traces (Honeycomb, Datadog, Grafana)
- Self-hosted dashboard at `/ui/` (password-gated)
- `/v1/route` endpoint that returns decision without proxying (great for eval)
- Multi-version routing for live A/B between cluster artifacts

### Endpoints

| Endpoint | Format |
|---|---|
| `POST /v1/messages` | Anthropic Messages |
| `POST /v1/chat/completions` | OpenAI Chat |
| `POST /v1beta/models/:action` | Gemini |
| `POST /v1/route` | Decision only, no upstream call |
| `GET /v1/models`, `POST /v1/messages/count_tokens` | Anthropic passthrough |
| `GET /health`, `GET /validate` | Liveness + key check |

### Devtool integrations (the differentiator)

- **Claude Code**: `make install-cc` (self-host) or `npx @workweave/router --claude`
- **Codex (OpenAI CLI)**: `npx @workweave/router --codex` patches `~/.codex/config.toml` with a managed `[model_providers.weave]` block. Codex's `OPENAI_API_KEY` passes through; router key rides in `X-Weave-Router-Key` header.
- **opencode**: `npx @workweave/router --opencode` merges into `opencode.json`.
- **Cursor**: Manual base URL override to `http://localhost:8080/v1` ("early beta, performance may not be the best").

### Self-host

- `make full-setup` boots Postgres + router on `:8080`
- Requires Node ≥ 18 + Docker + Postgres
- Dashboard at `http://localhost:8080/ui/` (default password `admin`, warning at startup)

### Product direction signals (from commits)

- Active retraining (v0.52 → v0.54 in the last two days)
- Translation-layer fixes (OpenAI reasoning → Anthropic thinking blocks, May 23)
- Provider-specific patches (Qwen3 tool-call loops, force-model leading-line guard)
- Roadmap: Token-aware rate limiting (Redis sliding window), sub-installations for tenant hierarchies, speculative dispatch + hedging for tail latency

---

## Pricing

**Public pricing**: None on the marketing site. Pricing is gated behind dashboard signup.

| Model | Mechanism |
|---|---|
| Hosted | Unified credits against a Weave account, usage-based |
| Self-hosted | BYOK, you pay providers directly. Router is free for self-host under ELv2 (anti-SaaS clause forbids re-hosting it as a service) |

CTAs are "Get Started for Free" and "Book a Demo." No flat subscription, no published savings-fee schedule.

---

## Customers & Social Proof

- **Cited logos** (from README): Robinhood, PostHog, Reducto, "hundreds of others"
  - These are **Workweave (parent) customers**, not router-specific customers. The router is too new (4 weeks) for established case studies.
- "Engineering teams from seed stage to Fortune 500"
- The Gap, Fortune 100 cited on the parent site

**Reviews**: No G2, Capterra, or Product Hunt page found.

---

## SEO & Content Strategy

- Domain only ~4 weeks old. SEO footprint is negligible.
- No blog at `/blog`, no docs site, no public changelog.
- Discovery channels appear to be GitHub + direct sales via the parent (Workweave).
- README references academic papers (Avengers-Pro, RouterArena) — positioning to the research-aware engineer.

---

## Strengths

1. **Strong technical foundation in agentic coding tools.** First-class native installers for Claude Code, Codex, opencode is real engineering investment. Most gateways tell you to flip a base URL; Weave actually patches the config file.

2. **OSS model coverage is broad.** DeepSeek, Kimi, GLM, Qwen, Llama, Mistral via OpenRouter is more SKU coverage than Nadir's Anthropic-first stance. For teams that want to route to cheap OSS for simple work, this is a meaningful advantage.

3. **Multi-format proxy is real.** Native Anthropic Messages + OpenAI Chat + Gemini in one server, with cross-format wire translation (e.g., OpenAI reasoning → Anthropic thinking blocks). Clients keep using their existing SDK.

4. **Go runtime, not Python.** No Python GIL, easier ops, smaller container, no model serving stack. The classifier is a quantized ONNX embedder loaded in-process — true single-binary deploy.

5. **Multi-version cluster routing.** Shipping v0.52 and v0.54 simultaneously with per-request header A/B is genuinely good infra discipline. Lets them ship retrains safely.

6. **Loud failure.** Returning HTTP 503 when the scorer can't run, instead of silently picking a default, is the right call for an opinionated router. Easy to argue this is better than a silent fallback.

7. **Algorithm grounded in published research.** Avengers-Pro is a real, peer-reviewable approach. Easier to defend in a procurement conversation than "trained classifier."

8. **Parent company has real distribution.** Workweave already sells to 500+ orgs (Gap, Fortune 100). The router can ride that pipeline; this is the most concrete competitive threat.

---

## Weaknesses

1. **"#1 on RouterArena" claim is unverifiable.** The current RouterArena leaderboard ([github.com/RouteWorks/RouterArena](https://github.com/RouteWorks/RouterArena)) ranks **Sqwish Router #1 at 75.27**. Weave Router does **not appear** on the leaderboard at all. Their badge shows 76.09 which would beat Sqwish, but no third-party submission is published. Treat as a self-reported number unless they publish the eval log.

2. **Brand-new project.** Repo created 2026-04-27, 29 stars, 3 contributors, 9 open issues, 2 forks. No customer case studies for the router specifically. Anyone betting on them is betting on a 4-week-old codebase.

3. **No public pricing.** Forces a sales call. Bad for self-serve devtool users who are their stated audience.

4. **Restricted license.** Elastic License v2 forbids competing SaaS. NadirClaw (Nadir's OSS core) is MIT — strictly more permissive, especially for ML platform teams.

5. **No retraining loop tied to live response quality.** The α-blend is frozen at training time. Nadir's OCR (Outcome-Conditioned Routing) closes the loop on per-tier thresholds from observed response quality; Weave's cluster artifact is a static snapshot until the next manual retrain.

6. **No semantic cache.** Nadir caches near-identical prompts (85-90% similarity threshold) by default. Weave has no equivalent. Cheapest token is the one you don't send.

7. **No context optimization.** Nadir trims input tokens 30-70% on long prompts. Weave does not.

8. **1024-char prompt cap on the classifier input.** Long prompts get truncated before embedding. Reasonable for classification but a real ceiling on routing precision for long-context agent workloads.

9. **Self-host is heavy.** Postgres + Docker + Node 18 + ONNX runtime + Tink encryption setup. NadirClaw self-host is a single Python install with SQLite.

10. **Privacy story is okay, not better.** BYOK + on-box encryption is good. But the hosted version still proxies through their server. Nadir matches this and additionally supports prompt-hash-only logging (`store_prompts=false`).

---

## Competitive Implications for Nadir

Nadir is a **two-layer** offering:
- **NadirClaw** (MIT, `pip install nadirclaw`, Python, local CLI + FastAPI) — direct competitor to **Weave Router self-hosted**.
- **Nadir Pro / getnadir.com** (hosted SaaS, trained classifier, dashboard, billing) — direct competitor to **Weave Router hosted**.

This matters because the OSS-license argument, install path, and trust story differ at each layer.

### Self-hosted layer: NadirClaw vs Weave Router (self-hosted)

| | NadirClaw | Weave Router self-hosted |
|---|---|---|
| License | **MIT** | Elastic License v2 (anti-SaaS) |
| Install | `pip install nadirclaw` then `nadirclaw setup` | `make full-setup` (Postgres + Docker + Node 18) |
| Runtime | Python / FastAPI | Go + ONNX + Postgres |
| Storage | SQLite + JSONL (local files) | Postgres (required) |
| Dashboard | CLI (Rich) | Web dashboard at `/ui/` |
| BYOK | Local, keys in env / credentials.json | Local, Tink AES-256-GCM at rest in Postgres |
| Failure mode | Fallback chains | HTTP 503, loud-by-design |
| Self-host friction | Minimal (one process, no DB) | Heavy (DB + Docker + ONNX assets) |
| Re-host as SaaS | Allowed (MIT) | **Forbidden** (ELv2) |

NadirClaw wins on **install friction, license, and storage simplicity**. Weave wins on **encryption at rest, web dashboard, and Go performance**.

### Hosted layer: Nadir Pro vs Weave Router (hosted)

| | Nadir Pro | Weave Router hosted |
|---|---|---|
| Pricing | Public: $9/mo + 25/10% savings fee, free tier with hosted keys | Gated, "credits" against Weave account |
| Trained classifier | Yes (BERT/GBT/two-tower options) | Yes (cluster centroids, Jina ONNX embedder) |
| OCR (closed-loop retraining) | **Yes** | No — α-blend frozen at training |
| Semantic cache | **Yes** (85-90% threshold) | No |
| Context optimization | **Yes** (30-70% input token cuts) | No |
| Per-request observability | Response headers (`x-nadir-*`) | OTLP traces (Honeycomb/Datadog/Grafana) |
| Anthropic Messages native | No (OpenAI-compat only) | **Yes** |
| Gemini native | No | **Yes** |
| OSS model routing | No | **Yes** (DeepSeek/Kimi/GLM/Qwen/Llama/Mistral via OpenRouter) |
| Maturity | Months in production | 4 weeks old |
| Eval transparency | 50-prompt eval public | "#1 on RouterArena" — unverified |
| Devtool installers | Base URL docs for Claude Code/Cursor/Aider/Continue/Windsurf/Codex/OpenClaw/Open WebUI | `npx ... --claude / --codex / --opencode` patches config files |

### Where they're stronger

- **OSS model routing via OpenRouter** (DeepSeek/Qwen/Llama/etc.). Real gap on our side.
- **Native Anthropic Messages and Gemini endpoints.** Clients on the Anthropic SDK directly cannot point at NadirClaw or Nadir Pro without changing SDKs.
- **Devtool config-file installers.** `npx @workweave/router --codex` actually writes the Codex config. We list integrations in docs but don't ship installers that mutate config.
- **Go runtime.** Smaller image, no Python ops surface. NadirClaw being Python is a weak point for security-conscious self-host buyers.
- **Avengers-Pro citation.** Their algorithm has a paper. Our public technical writeup is thinner.
- **Workweave parent distribution.** Real channel risk — they sell into 500+ engineering orgs already.

### Where we're stronger

- **MIT license at the OSS layer.** NadirClaw is fully MIT. Weave Router is ELv2 — competitive SaaS is forbidden. For ML platform teams who want to embed or repackage, MIT wins decisively.
- **OCR closed loop.** Our retraining adapts to live response quality. Their α is frozen until next manual retrain.
- **Semantic cache + context optimization.** Two layers of savings they don't ship.
- **Public pricing + free tier with hosted keys.** Self-serve. They gate pricing.
- **Maturity.** NadirClaw is on PyPI with CI and a real changelog. Weave's router repo is 4 weeks old.
- **Lower self-host friction.** `pip install nadirclaw` vs `make full-setup` with Postgres + Docker.
- **Pay-on-savings model.** "If it doesn't save you money, you don't pay" is a stronger procurement story than usage-based credits.
- **Eval honesty.** Our 50-prompt eval is public with the λ=20 setting documented. Their RouterArena claim doesn't match the public leaderboard.

### What's genuinely missing in Nadir vs Weave

1. **Native Anthropic Messages + Gemini endpoints.** Biggest gap. Both NadirClaw and Nadir Pro are OpenAI-compatible only.
2. **OSS model routing.** No DeepSeek/Qwen/Llama story today. Hurts the cost-savings narrative on the low end.
3. **Devtool config-file installers** that edit `~/.codex/config.toml` and `opencode.json` like Weave's `npx` does.
4. **Public cluster-version A/B header** for live classifier rollouts.
5. **Cleaner published ML story.** Avengers-Pro is cited. We should publish our classifier architecture + eval with the same rigor.
6. **Web dashboard for self-host (NadirClaw).** Today it's CLI-only. Weave self-host ships a web UI.

### What Weave is missing that we should keep pushing on

1. **OCR closed loop.** Their α is frozen at training time. Ours adapts from live data.
2. **Semantic cache.** No equivalent in their codebase.
3. **Context optimization.** We compound savings via input-token trimming; they don't.
4. **MIT vs ELv2.** NadirClaw can be embedded/re-hosted. Their router cannot.
5. **Friction-free self-host.** `pip install nadirclaw` vs their Postgres + Docker + ONNX setup.
6. **Eval honesty.** Their "#1 on RouterArena" is unverified. Submit ours and publish.

---

## Threats and Opportunities

**Threats (real)**
- Workweave's distribution into 500+ engineering orgs is a credible channel risk. If they bundle the router with their engineering analytics product, they have a built-in upsell path we don't.
- Their native Anthropic Messages support hits exactly the Claude Code / agentic coding wedge we also chase.
- OSS model routing via OpenRouter is a feature gap they will use against us in head-to-head bake-offs.

**Threats (overstated)**
- "#1 on RouterArena" — currently unverifiable.
- Their stars/community — 29 stars, 3 contributors. Not a community yet.

**Opportunities**
- Publish a `/compare/weaverouter` page that documents: license (MIT vs ELv2), retraining loop (OCR vs frozen α), pricing (public vs gated), eval transparency (50-prompt eval published vs unlisted RouterArena claim).
- Add native Anthropic Messages + Gemini endpoints. Sized as a quarter of work; would neutralize their biggest technical pitch.
- Add OpenRouter passthrough so we can answer the OSS-routing question without changing core routing.
- Submit to RouterArena ourselves with the published 50-prompt eval as the eval set. Make our score public.

---

## Raw Data Sources

- `raw/weaverouter/2026-05-23/scrapes/` — homepage, README, CONFIGURATION.md, AGENTS.md, cluster scorer doc
- Live RouterArena leaderboard from [RouteWorks/RouterArena](https://github.com/RouteWorks/RouterArena) (2026-05-23)
- Repo metadata via `gh api repos/workweave/router`
- Avengers-Pro paper: [arXiv:2508.12631](https://arxiv.org/abs/2508.12631)
- RouterArena paper: [arXiv:2510.00202](https://arxiv.org/abs/2510.00202)
- Parent company site: https://workweave.dev (302 from workweave.ai)
