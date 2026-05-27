# Path to Beat Weave Router

**Generated**: 2026-05-23
**Horizon**: 12 weeks
**Goal**: Win head-to-head deals against [Weave Router](weaverouter.md) in the agentic-coding-tool segment, publish a verified routing score that beats theirs, and neutralize their devtool-installer wedge.

---

## Execution log

### 2026-05-23 — Session 1 (foundation shipped)

Concrete work landed in this repo today, all reversible, no production deploys:

- **NadirClaw already has `/v1/messages`.** Discovered an existing implementation at `NadirClaw/nadirclaw/server.py:2195`. That partially closes the Phase 1.1 gap on the OSS side. Pro was the actual gap.
- **Pro `/v1/messages` endpoint scaffolded** (Phase 1.1):
  - `backend/app/services/anthropic_translate.py` — pure translation helpers (Anthropic Messages ↔ OpenAI Chat) with `UnsupportedAnthropicFeature` for image/tool_use blocks.
  - `backend/app/api/anthropic_messages.py` — `POST /v1/messages` route. Routes via existing `get_intelligent_model_recommendation_with_analysis`, coerces non-Claude recommendations to a Claude tier, forwards to api.anthropic.com.
  - Wired into `app/main.py`.
- **Tests**: `backend/tests/test_anthropic_translate.py` — 19 tests, all passing locally on Python 3.14 with pytest 9.0.2.
- **Phase 0 baseline script**: `eval/phase0_weave_baseline.py` — pulls our eval prompts, calls Weave's `/v1/route` and our `/v1/custom_recommendation`, writes side-by-side JSON. Ready to run once `WEAVE_ROUTER_KEY` is provisioned.

Scope of what's NOT done in this session:
- Streaming SSE passthrough for `/v1/messages` (returns 400 for `stream=true` today).
- Tool use / vision block translation (rejected with explicit error).
- Native Gemini endpoint (`/v1beta/models/:action`).
- OpenRouter passthrough.
- `npx @nadir/router` config-file installers.
- NadirClaw web dashboard.
- RouterArena submission (requires explicit founder approval before public action).
- Head-to-head benchmark page.
- `/compare/weaverouter` marketing page.

Files touched:
- `backend/app/services/anthropic_translate.py` (new)
- `backend/app/api/anthropic_messages.py` (new)
- `backend/app/main.py` (2 lines)
- `backend/tests/test_anthropic_translate.py` (new)
- `eval/phase0_weave_baseline.py` (new)
- `competitor-profiles/weaverouter.md` (new)
- `competitor-profiles/_plan-beat-weaverouter.md` (this file)

Next session priorities (in order):
1. Run Phase 0 baseline once a Weave router key is provisioned. Decide on aggressive vs. measured timeline based on the gap.
2. Streaming passthrough for `/v1/messages` (the highest-value feature gap; Claude Code uses streaming).
3. Tool use block translation (second-highest; agentic clients depend on it).
4. Gemini `/v1beta/models/*` endpoint (cheap, same pattern).
5. OpenRouter passthrough as opt-in BYOK feature.

### 2026-05-23 — Session 2 (multi-agent cycle 1)

5-stage agent loop ran: 3 researchers → 3 architects → 3 reviewers → 3 executors → 3 validators (15 agents total).

Shipped: contamination audit module (`eval/contamination_audit/`, 11 tests), W1 streaming + tool/image/thinking-block passthrough for `/v1/messages` (15 streaming tests, 19 translator tests still passing), bandit foundation (`backend/app/services/bandit_router.py` + 2 SQL migrations + 6 tests).

Bugs caught by loop that would have shipped otherwise: 8 at reviewer stage (including wrong endpoint, broken SQL upsert, silent contamination false-negative), 4 at validation stage (including .jsonl glob miss, CancelledError SDK-hang, COS weights drift). All patched. **51/51 tests passing.**

Full retro: [_cycle1-retro.md](_cycle1-retro.md). Cycle 2 plan: priorities 1-5 outlined in retro, starting with running the real contamination audit against RouterArena's HF dataset.

### 2026-05-23 — Session 3 (multi-agent cycle 2)

5-stage agent loop ran again. 12 agents: 1 audit-runner + 2 architects + 2 reviewers + 2 executors + 2 validators + 3 inline patches.

**Headline**: contamination audit PASS on both splits (0/8,399 overlap on full). RouterArena submission path unblocked.

Shipped: W2 cross-format SSE translator (`anthropic_sse_translate.py` + `anthropic_body_to_openai_body`, 44 new W2 tests), W3 npm installer (`@nadir/router` 15 files + 53 vitest tests, dry-run publish clean).

Bugs caught: 8 at reviewer stage (state machine gaps, multi-tool-result merge, double terminal frame, stream_options missing, TOML CRLF regex, Claude Code uninstall stomping user edits, TTY hang, homedir Docker bug); 5 at validator stage (`end_turn` instead of `error` on httpx failure, fragile `.replace`, two test-coverage gaps, undocumented npm fallback). All patched.

**148 total tests passing** (11 audit + 84 backend + 53 npm).

Full retro: [_cycle2-retro.md](_cycle2-retro.md). Cycle 3 plan: WS-1 RouterArena adapter + `/v1/route_only` endpoint + actual submission PR (requires founder review); WS-2.5 Gemini; bandit DB wiring; npm publish (`@nadir` org check).

---

---

## North-star outcomes

By 2026-08-15:

1. Nadir and NadirClaw speak **Anthropic Messages + Gemini natively**, not just OpenAI-compat.
2. Nadir routes to **OpenRouter OSS models** (DeepSeek, Qwen, Llama, GLM, Kimi, Mistral) on opt-in.
3. `npx nadir --claude / --codex / --opencode` patches the user's actual config file.
4. **Nadir is on the RouterArena leaderboard** with a published Acc-Cost score. Target: beat 76.09.
5. A public head-to-head benchmark page shows Nadir's routing + semantic cache + context optimization beats Weave's routing alone on a shared eval set. Target delta: 10+ percentage points of additional savings.
6. `/compare/weaverouter` page is live and ranks for the comparison query.
7. NadirClaw self-host has a web dashboard at `localhost:8856/ui/`.

If we hit 1-3 we have **parity**. If we hit 4-5 we have **proof**. If we hit 6-7 we have **distribution**.

---

## Phase 0 — Baseline (Week 0, this week)

Lock the measurements that every later phase will reference.

| Task | Output | Owner | Done when |
|---|---|---|---|
| Snapshot Weave's `/v1/route` decisions on our 50-prompt eval | JSON of their decision per prompt | Backend | Saved to `eval/weave-decisions-2026-05-23.json` |
| Run our current router on the same 50-prompt eval | Cost + accuracy numbers | Backend | Numbers in `eval/baseline-2026-05-23.md` |
| Compute the headline gap | Single table: their cost, our cost, our cost + cache, our cost + cache + context opt | PMM | Saved to `competitor-profiles/_baseline.md` |
| Confirm RouterArena submission rules | Email RouteWorks, get their go-ahead | Founders | Reply in inbox |

**Exit criteria**: We know our current number, their number, and how much our two extra layers (cache + context-opt) add. No code changes yet.

**Kill switch**: If our baseline already beats them on cost-per-quality at every λ setting, deprioritize Phase 3.5 (compound-savings benchmark) and accelerate Phase 4 (distribution).

---

## Phase 1 — Protocol parity (Weeks 1-3)

Without this, agentic-coding clients on the Anthropic SDK literally cannot point at us. This is the single biggest gap.

### 1.1 Native Anthropic Messages endpoint

- New route: `POST /v1/messages` in [backend/app/api/](../backend/app/api/)
- Translate Anthropic Messages request → our internal routing decision → dispatch via LiteLLM
- Translate response back to Anthropic Messages format (including `tool_use`, `thinking` blocks, streaming SSE)
- Translation logic isolated in `backend/app/services/anthropic_translate.py` (pure, no I/O, testable)
- Reference Weave's [internal/translate](https://github.com/workweave/router/tree/main/internal/translate) for edge cases (OpenAI reasoning → Anthropic thinking is non-obvious)

**Tests**: claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-6 all work end-to-end via `/v1/messages`. Streaming + tools + vision all pass.

**Effort**: 2-3 weeks one backend engineer.

### 1.2 Native Gemini endpoint

- New route: `POST /v1beta/models/:action`
- Translate Gemini → routing → dispatch
- Gemini's native API is OpenAI-compat-ish via `https://generativelanguage.googleapis.com/v1beta/openai`, so this is mostly mapping `generateContent` requests, less work than 1.1

**Effort**: 3-5 days.

### 1.3 OpenRouter passthrough for OSS models

- New env: `OPENROUTER_API_KEY` enables routing to DeepSeek, Qwen, Llama, GLM, Kimi, Mistral
- Add a new tier in the classifier output: `simple_oss` (when user opts in)
- Profile setting `model_parameters.layers.routing.allow_oss = true` in [profiles table](../backend/app/services/)
- Per-API-key opt-in only. Default off so existing customers don't get surprised by routing to a model they haven't audited.
- Models added to [backend/app/pricing/](../backend/app/pricing/) cost table

**Effort**: 1 week.

### Exit criteria for Phase 1

- Claude Code, Codex, opencode all work pointing at `https://api.getnadir.com/v1/messages` with `model="auto"`.
- A Gemini SDK client works pointing at `https://api.getnadir.com/v1beta/models/gemini-2.0-flash:generateContent`.
- BYOK customers with an OpenRouter key can opt into OSS routing and see decisions go to DeepSeek for simple prompts.

**Risk**: Anthropic Messages format is moving (tool_use_id, server_tools, computer_use). Lock onto the version Claude Code uses today; iterate later.

---

## Phase 2 — Installers + dashboard (Weeks 3-5)

Parity is necessary but not sufficient. Their `npx` installer flow is genuinely better UX. Match it.

### 2.1 `npx @nadir/router` config-file installer

New package, lives in `getnadir.dev/install/npm/`. Mirrors Weave's [install/npm](https://github.com/workweave/router/tree/main/install/npm) structure.

```bash
npx @nadir/router              # interactive picker
npx @nadir/router --claude     # Claude Code
npx @nadir/router --codex      # patches ~/.codex/config.toml
npx @nadir/router --opencode   # merges into opencode.json
npx @nadir/router --cursor     # writes Cursor's base-url override
```

Each flag mutates the actual config file with a managed block (idempotent re-install, clean `--uninstall`).

**Effort**: 1 week per integration. Start with Codex + opencode (Weave's strongest wedge), then Claude Code, then Cursor.

### 2.2 NadirClaw web dashboard

- Currently CLI-only (Rich-based). Weave self-host ships a web UI.
- Build a minimal React dashboard served by NadirClaw's FastAPI at `localhost:8856/ui/`
- Shows: recent routing decisions, cost saved today/week/month, per-model breakdown, fallback chain status
- Read-only first. Write actions (edit routing rules) in v2.

**Effort**: 2 weeks one frontend engineer. Reuse components from [app/src/components/](../app/src/components/).

### Exit criteria for Phase 2

- `npx @nadir/router --codex` published to npm, installs Nadir as the Codex provider in under 30 seconds.
- NadirClaw users see a web dashboard when they run `nadirclaw serve`.

---

## Phase 3 — Public proof (Weeks 5-7)

Three artifacts that turn "we have more features" into "we have a public number that beats them."

### 3.1 RouterArena submission

- Build a Nadir adapter for [RouterArena's `router_inference` framework](https://github.com/RouteWorks/RouterArena/tree/main/router_inference)
- Config file in `router_inference/config/nadir.json`
- Submit on the `full` dataset for official leaderboard inclusion
- Run the `sub_10` subset locally first to debug
- **Caveat**: RouterArena rules forbid training on their data. Our classifier must not have been trained on RouterArena prompts. Audit our training set before submission.

**Effort**: 1 week.

**Target**: Acc-Cost Arena score > 76.09 (Weave's claimed number). Even if we land at 75-76 we still publicly beat the verified leaderboard top of 75.27 (Sqwish Router).

### 3.2 Head-to-head benchmark page

- New page: `/compare/weaverouter/benchmark`
- Same 200-prompt workload (expanded from our 50-prompt eval) run through three configurations:
  1. Weave Router (their `/v1/route` decisions)
  2. Nadir routing only
  3. Nadir routing + semantic cache + context optimization
- Publish the cost-per-quality curve. Publish the raw decision logs.
- Target headline: "Nadir saves N percentage points more than Weave Router on the same workload, with the same quality floor."

**Effort**: 2 weeks (workload curation + running both routers + writing up).

### 3.3 Classifier writeup

- A real technical doc: `/docs/router/architecture` and a companion blog post.
- Cover: classifier architecture (BERT/GBT/two-tower options), training set construction, OCR closed loop, weekly retrain pipeline, per-tier threshold tuning.
- Match Avengers-Pro's intellectual seriousness. Cite our 50-prompt eval, cite OCR.
- Goal: research-aware engineer reads this and concludes Nadir is the more mature ML system.

**Effort**: 1 week (writeup only; the system already exists).

### Exit criteria for Phase 3

- Nadir is on the RouterArena leaderboard with a published score.
- `/compare/weaverouter/benchmark` is live with raw logs linked.
- `/docs/router/architecture` is live and linkable.

---

## Phase 4 — Distribution (Weeks 7-12)

Now amplify.

### 4.1 `/compare/weaverouter` page

- Standard comparison-page format. Honest table. Link the benchmark.
- Hit the queries: "weaverouter alternative", "weave router vs nadir", "workweave router pricing".
- Target indexed in Google Search Console within 4 weeks of publish.

**Effort**: 3-5 days using the [competitor-alternatives skill](../../../.claude/skills/).

### 4.2 RouterArena win amplification

If we land above 76.09:
- Blog post: "We submitted Nadir to RouterArena. Here's the score."
- Tweet thread referencing the leaderboard URL and Weave's unverified claim.
- Update the homepage stat from "47% on our 50-prompt eval" to "76.X on RouterArena (public, verified)."

If we land below 76.09 but above 75.27 (the actual verified #1):
- Blog post: "We're #1 on the verified RouterArena leaderboard. Here's what Weave's #1 claim actually says."
- Same amplification, sharper framing.

### 4.3 Devtool partner outreach

- Direct outreach to Claude Code, Codex, opencode, Aider, Continue, Windsurf, Cursor teams. Goal: get listed as a recommended router in their docs.
- Weave is doing this via `npx` installers. We need both the installer (Phase 2) and the partner conversation.
- This is the same channel Workweave's parent uses to reach 500+ orgs. We have to compete on it.

**Effort**: Ongoing, founder time.

### 4.4 Pricing-page polish

- Public pricing is already a win vs their gated pricing. Make it louder.
- Add a "Compare to Weave" section on `/pricing` that calls out: public pricing vs credits, MIT OSS vs ELv2, pay-on-savings vs usage credits.

**Effort**: 2-3 days.

### Exit criteria for Phase 4

- `/compare/weaverouter` indexed and ranking page 1 for "weaverouter alternative" within 60 days.
- 2+ devtool partners list Nadir in their official docs.
- One inbound deal cites the RouterArena score as the deciding factor.

---

## Layer ownership

Almost every routing primitive lives in **NadirClaw** (the open-source core). Pro extends NadirClaw via the `nadirclaw` PyPI dependency and adds the SaaS surface (billing, dashboard, organizations, hosted keys). The plan executes by building down (NadirClaw) and presenting up (Pro).

| Task | NadirClaw | Pro (getnadir.dev) | Notes |
|---|:-:|:-:|---|
| 0.1 Snapshot Weave decisions on 50-prompt eval | ✅ | ✅ | Eval set is shared. Store in `eval/` of whichever repo runs it; both consume. |
| 0.2 Baseline our router on the same eval | ✅ | ✅ | Run twice: NadirClaw's binary/cascade classifier, and Pro's trained classifier. Publish both. |
| 0.3 Confirm RouterArena rules | shared | shared | Founders / one email. |
| 1.1 Native Anthropic Messages endpoint | ✅ | ✅ | **Build the translation package in NadirClaw** (`nadirclaw/translate/anthropic.py`, pure functions, no I/O). NadirClaw exposes `POST /v1/messages` on `localhost:8856`. Pro imports the same package and exposes it at `api.getnadir.com/v1/messages`. One implementation, two surfaces. |
| 1.2 Native Gemini endpoint | ✅ | ✅ | Same pattern. `nadirclaw/translate/gemini.py`. |
| 1.3 OpenRouter passthrough for OSS models | ✅ | ✅ | NadirClaw already has provider abstraction. Add OpenRouter as a provider in `nadirclaw/providers/openrouter.py`. Pro reads `model_parameters.layers.routing.allow_oss` from profiles and forwards the per-user opt-in. |
| 2.1 `npx @nadir/router` installer | shared | shared | Lives in a new repo (`@nadir/router` npm package) outside both. It calls into `nadirclaw setup` for local installs and uses Pro's onboarding link for hosted. Effectively a third surface that fronts both. |
| 2.2 NadirClaw web dashboard | ✅ | — | NadirClaw-only. Closes the "no GUI for self-host" gap. Pro already has [app/](../app/). |
| 3.1 RouterArena submission | ✅ | ✅ | Submit **both** routers: NadirClaw's classifier and Pro's trained classifier. Publish both scores. Two leaderboard rows is stronger than one. |
| 3.2 Head-to-head benchmark page | — | ✅ | Pro publishes it at `getnadir.com/compare/weaverouter/benchmark`. Data references decisions from both routers. |
| 3.3 Classifier writeup | shared | shared | One doc lives in [NadirClaw/docs/](../../NadirClaw/docs/) (canonical, open-source-readable). Pro page at `/docs/router/architecture` is a marketing wrapper that links to it. |
| 4.1 `/compare/weaverouter` page | — | ✅ | Pro / marketing site. |
| 4.2 RouterArena amplification | — | ✅ | Pro / marketing site + founder Twitter. |
| 4.3 Devtool partner outreach | — | ✅ | Founder time, Pro-side commercial. |
| 4.4 Pricing page polish | — | ✅ | Pro only (NadirClaw has no pricing). |

### Why this layering wins

1. **One translation implementation, two surfaces.** Building Anthropic Messages + Gemini in NadirClaw means our open-source self-host gets protocol parity at the same time as Pro. That's both a competitive feature and a community lever (anyone running NadirClaw becomes a Nadir Messages-API endpoint for free).
2. **NadirClaw is the algorithmic showcase.** RouterArena, the classifier paper, and the OpenRouter integration are all things engineers want to read the code for. Build them in MIT-licensed code so the technical credibility is publicly auditable.
3. **Pro is the SaaS surface.** Billing, dashboard, hosted keys, comparison pages, partner outreach. Pro's job is presentation, conversion, and revenue, not core algorithm work.
4. **Weave cannot match this layering.** ELv2 forbids re-hosting their router as a SaaS, so they cannot build a community-friendly OSS layer with a paid hosted upsell. We can.

### Repos touched

- `NadirClaw/` — protocol endpoints, translation packages, OpenRouter provider, dashboard, doc rewrite
- `getnadir.dev/backend/` — Pro's API forwards through the new endpoints (mostly inherited; minor wiring)
- `getnadir.dev/app/` — comparison page, benchmark page, pricing polish
- New repo `@nadir/router` (npm) — `npx` installers

### Shared code contract

Cross-repo, the contract is:

- All routing decisions return a `RouteDecision` dataclass with `model`, `provider`, `tier`, `reason`, `cost_estimate_usd`. Defined in `nadirclaw.types`. Pro consumes; never redefines.
- All translation is pure (`request_in -> request_out`, no I/O). Lives in `nadirclaw.translate`. Pro tests don't reimplement; they import.
- All OCR feedback writes go through `nadirclaw.feedback.record_outcome()`. Pro's analytics service calls this; NadirClaw self-host writes to local SQLite via the same call.

This keeps the two layers from drifting.

---

## Sequencing rationale

```
Week 0      | Baseline measurements
Weeks 1-3   | Protocol parity  ──────────────┐
Weeks 3-5   | Installers + dashboard         │
Weeks 5-7   | Public proof (RouterArena, benchmark, paper)
Weeks 7-12  | Distribution                   │
                                              │
            ▲ Parity unlocks installers      │
            ▲ Installers unlock devtool partners
            ▲ Public proof unlocks comparison content
            ▲ Comparison content unlocks SEO + partner outreach
```

Protocol parity blocks installers. Installers block partner conversations. Public proof blocks the comparison page (no point publishing a page that says "trust us"). Distribution blocks revenue.

---

## What we deliberately do NOT do

- **Do not rewrite in Go.** Their Go runtime is nice. It's not worth a 6-month rewrite. Python is fine; we win on features and proof, not on container size.
- **Do not train on RouterArena prompts.** Bans us from the leaderboard. Worth pointing out: Avengers-Pro authors explicitly disallow this.
- **Do not try to copy Weave's cluster-centroid algorithm.** Ours works. Our public credibility problem is documentation, not algorithm.
- **Do not match their "credits" pricing.** Pay-on-savings is a stronger procurement story; double down on it.
- **Do not chase their ELv2 license restrictions.** MIT is strictly better; lean on it.

---

## Success metrics by week 12

| Metric | Today | Target | Source |
|---|---|---|---|
| Native protocols supported | 1 (OpenAI) | 3 (OpenAI, Anthropic, Gemini) | API endpoints |
| OSS models routable | 0 | 6+ (via OpenRouter) | Profile config |
| Devtool installers (config-file mutating) | 0 | 4 (Codex, opencode, Claude Code, Cursor) | npm package |
| RouterArena leaderboard rank | not listed | top 3 | RouteWorks/RouterArena |
| Head-to-head benchmark page live | no | yes | `/compare/weaverouter/benchmark` |
| `/compare/weaverouter` indexed on page 1 | no | yes | GSC |
| Devtool partners listing us | 0 | 2+ | Partner docs |
| NadirClaw self-host web UI | no | yes | localhost:8856/ui |

---

## Risk register

| Risk | Mitigation |
|---|---|
| RouterArena evaluation methodology disadvantages our routing style | Run sub_10 first; iterate before full submission. If we can't beat 76.09 on RouterArena, ship the head-to-head benchmark as primary proof. |
| Anthropic Messages format moves (server_tools, computer_use) | Pin to today's Claude Code version. Add a versioning layer in the translate package. |
| Workweave's parent company bundles the router for free with their engineering analytics product | Hard to defend against. Counter with self-serve + MIT OSS + lower self-host friction. Aggressive PLG. |
| Our classifier is over-fit to Anthropic and underperforms on OSS prompts | Start with OSS routing as opt-in only. Collect data. Retrain. |
| Phase 1 takes longer than 3 weeks because of translation edge cases | Cut scope: ship `/v1/messages` without server_tools / computer_use first. Iterate. |

---

## Decision points

1. **End of Week 0**: Does our baseline already beat Weave on the 50-prompt eval? If yes, accelerate Phase 4. If no, Phase 1-3 stand.
2. **End of Week 3**: Is `/v1/messages` working end-to-end with Claude Code? If no, Phase 2 installers are blocked.
3. **End of Week 7**: What's our RouterArena score? Triggers either "we won" or "we're verified top-3" messaging.
4. **End of Week 12**: Retrospective. If `/compare/weaverouter` is not ranking and partner conversations stalled, the parent company's distribution is winning and we need a different counter-strategy (likely a paid-ads push or a Workweave-specific positioning shift).

---

## TL;DR

**Three weeks of protocol work, two weeks of installers, two weeks of public proof, five weeks of distribution.** Ship native Anthropic Messages + Gemini + OpenRouter passthrough. Ship `npx @nadir/router` config installers. Submit to RouterArena and publish a head-to-head benchmark. Then amplify on `/compare/weaverouter` and direct devtool-partner outreach. Our durable moat (OCR + semantic cache + context optimization + MIT license + pay-on-savings + maturity) holds; we just need to remove the three things they have that we don't, and prove the rest in public.
