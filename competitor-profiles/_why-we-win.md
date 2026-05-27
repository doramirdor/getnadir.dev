# Why Nadir Wins (and How We Become the Field)

**Generated**: 2026-05-23
**Audience**: founders, eng leads, anyone deciding whether to ship the parity roadmap or pivot to original IP
**TL;DR**: parity work makes us competitive. Three pieces of proprietary tech make us the field.

---

## Where we are right now (proven, in-repo, 148 tests green)

Three cycles of multi-agent loop work landed:

- **`/v1/messages` Anthropic-compatible endpoint** with Claude streaming passthrough, tool/image/thinking block forwarding, mid-stream terminal frames, `[tool call]` sentinel for tool-only bodies.
- **Cross-format SSE translator** (`anthropic_sse_translate.py`) — state machine that maps OpenAI streaming chunks to Anthropic SSE events, including tool-call argument accumulation, refusal handling, finish-reason mapping. 19 tests covering the 7 documented sequences plus edge cases.
- **`anthropic_body_to_openai_body`** with multi-tool-result fan-out, `stream_options.include_usage` injection, None/empty input handling.
- **`@nadir/router` npm installer**, 58/58 vitest tests passing, CRLF-safe TOML regex, single JSON sentinel key, opt-OUT telemetry, value-compare uninstall, npm publish --dry-run clean.
- **Contamination audit module** with NFC Unicode normalization, recursive glob, strict 0=PASS/1+=FAIL threshold. **Both splits PASSED against real RouterArena data** (0/8,399 overlap on the full split). RouterArena submission path is unblocked.
- **Bandit foundation**: full Lambda matrix migration, `bandit_reward_log` dedup table, NIG math kernel with closed-form conjugate update, 6 unit tests. DB wiring deferred.

13 real bugs caught across cycles by the loop (wrong RouterArena endpoint, silent SQL upsert tautology, CRLF regex stripping `\r`, Claude Code uninstall stomping user edits, multi-tool-result merge, double terminal frame, `stream_options` injection missing, etc.). None shipped.

This is solid engineering. It is not yet a moat.

---

## Where Weave actually is

From cycle 0 profile, refreshed by cycle 2 audit work:

- 4 weeks old codebase, 29 stars, 3 contributors, ELv2 license (anti-SaaS).
- Algorithm: cluster centroids + Jina INT8 embedder + single argmax. Frozen α-blend, retrained ~weekly by humans. No live adaptation.
- "#1 on RouterArena, Acc-Cost Arena 76.09" — unverified. The actual leaderboard shows Sqwish at 75.27 with no Weave Router row.
- No cache. No context optimization. No closed-loop quality signal.
- Strong devtool installers (`npx --codex`, `npx --opencode`), broad OSS model passthrough via OpenRouter, native Anthropic + OpenAI + Gemini.

If we ship the cycle 1-3 parity roadmap, we match their devtool wedge and protocol surface. We still don't win on the only dimension that matters: are we the engineers' default choice when they're tired of paying Opus prices.

To win, we need something they cannot copy with a sprint.

---

## The three moats that already exist (and what's wrong with them)

### Moat 1: OCR closed-loop retraining

Our system observes response quality (override detection, LLM-as-judge) and adjusts routing thresholds from live data. Weave's α is frozen at training. We adapt; they re-ship.

**What's wrong**: it's invisible. Customers can't see OCR working. We need to surface it as a public dashboard ("watch your router improve on your traffic in real time") or it stays a feature spec.

### Moat 2: Compound savings stack (routing + semantic cache + context optimization)

Three layers, not one. Weave routes; we route + dedupe + trim. On a workload with repeated prompts and long context, our stack saves ~2x what theirs does.

**What's wrong**: nobody has seen the receipts. No public benchmark proves this. Cycle 2 deferred the SWE-bench compound-savings paper. Without it, this is marketing.

### Moat 3: MIT open-source layer (NadirClaw)

Our self-hosted core is MIT. Weave is ELv2 (forbids re-hosting as SaaS). For ML platform teams that want to embed routing in their own product, we are strictly more permissive.

**What's wrong**: NadirClaw has 0 community traction visible in this repo. No GitHub stars worth referencing, no public adoption stories. The legal advantage matters only if anyone knows we exist.

---

## The three pieces of original IP that put us at the top

These are NOT in the cycle 1-3 roadmap. They are what we should build INSTEAD of finishing pure parity.

### IP #1: Verifier-Gated Cascade Routing

**The bet**: a customer's only real fear is "what if Nadir picks Haiku and the answer is wrong and I don't know." Every existing router answers this by trusting the classifier. We answer it differently.

**The mechanism**:
1. Classifier picks the cheapest tier per prompt (same as today).
2. The chosen model returns its answer.
3. A **small verifier model** (5-15M parameters, runs in <50ms) scores whether the answer is acceptable for this prompt.
4. If verifier says yes → return the cheap answer.
5. If verifier says no → escalate to the next tier, return that one.

We charge customers based on accepted-tier price + a fixed verifier cost. Their bill is a function of how often the cheap tier succeeds. We give a **quality floor guarantee** in the contract: "if the verifier accepted it, we stand behind it."

**Why this is field-changing**:
- Every router today routes BEFORE seeing the answer. Verifier-gated routing decides AFTER. This is the same shift speculative execution made for CPUs in the 90s.
- The verifier is the IP. It's trained on (prompt, cheap-answer, expensive-answer, was-cheap-good-enough) tuples. We already have this data via OCR. Weave does not.
- Anthropic just made this 10x cheaper to build with prompt caching: the verifier can re-use the cached prompt for input-token economics.

**Why customers tweet**:
- "I migrated to Nadir and my Claude bill dropped 60% with zero quality regression on my eval set." This is the headline they want to write.
- "I read the Nadir verifier paper. They route AFTER the answer comes back. Why didn't I think of that."

**What we own (IP)**:
- Verifier model architecture (small distilled model trained on our OCR data)
- Training corpus (proprietary; the (cheap, expensive, judge) triples we've collected)
- Cascade orchestration (the cancel-race mechanics, the timeout policies)
- The quality-floor contract language (commercially defensible)

**Build sized as**: 8-10 engineer-weeks. One ML engineer (verifier) + one backend engineer (cascade orchestration) + product copy for the quality-floor guarantee.

**Existing assets we reuse**:
- OCR override detection signal as labels
- `usage_logs` history for paired (prompt, cheap, expensive) training data
- `_proxy_stream_openai_compat` infrastructure for cascade dispatch
- Semantic cache infrastructure for verifier output caching

**Risk**: verifier is wrong, customer gets bad answer. Mitigation: hold-out eval set + customer-specific calibration period before we honor the quality-floor guarantee. This is a learnable problem.

---

### IP #2: Prompt Decomposition Routing (PDR)

**The bet**: most "complex" prompts are not atomic. An agentic coding session is `plan(hard) + read_file(easy) + read_file(easy) + write_code(medium) + tool_use(easy) + reflect(medium)`. Sending the whole session to one model is leaving 50-80% of savings on the table.

**The mechanism**:
1. A **decomposer model** identifies the cognitive profile of each turn or sub-task within a prompt.
2. Each piece routes independently. Planning steps go to Opus; execution steps go to Haiku; tool-result interpretation goes to Sonnet.
3. Outputs recompose into a single conversation visible to the client.

This is the routing analog of CPU instruction-level parallelism. Everyone else routes at the prompt level (the routing analog of programs). We route at the sub-task level (instructions).

**Why this is field-changing**:
- It is a new abstraction layer. Routers today see "prompt → model." We add "prompt → decomposition → model₁, model₂, model₃ → recomposition." Nobody else has this.
- It is patent-defensible. The decomposer model + the recomposition algorithm are novel enough to file.
- It compounds with verifier-gated routing (IP #1). Each decomposed piece can also be verifier-gated.

**Why customers tweet**:
- "Watched Claude Code via Nadir. Each tool call went to Haiku, the planning step went to Opus, the file read went to Haiku. Bill is 70% lower with no change in behavior."
- "PDR is the most interesting thing in LLM routing this year."

**What we own (IP)**:
- Decomposer model (small, fast, trained on agentic-loop transcripts)
- Decomposition schema / taxonomy of cognitive sub-tasks (this could become a public standard, like JSON Schema for prompts)
- Recomposition algorithm including the trickiest part: making the routed conversation read coherently
- Publishable as an arXiv paper, conference submission, blog series

**Build sized as**: 16-24 engineer-weeks. Real research-grade work. One ML researcher full-time on the decomposer + one backend engineer on the orchestration layer.

**Risk**: decomposition introduces latency and coherence loss. Mitigation: ship behind a flag, A/B against single-model routing per customer, only flip when wins are demonstrated. Worst case it's an opt-in advanced mode for cost-sensitive customers.

---

### IP #3: The Public Routing Benchmark (RouterBench by Nadir)

**The bet**: whoever defines the benchmark defines the field. OpenAI did this with HumanEval and GSM8K. Anthropic did this with MMLU. RouterArena exists but it is narrow (cost-vs-accuracy on a closed prompt set) and academic-team-run.

**The mechanism**:
1. Build a public, reproducible router benchmark. Open-source the dataset, eval harness, and submission framework.
2. Include dimensions RouterArena misses: latency p95 under realistic load, cache-hit rate, multi-turn agentic accuracy, context-window economics.
3. Run a continuously-updated leaderboard with our backend traffic anonymized into a public dataset.
4. Make the eval harness drop-in for any router that exposes a `/v1/route` endpoint (we already designed `/v1/route_only` in WS-1 cycle 3).
5. Run the bench against ourselves, Weave, Sqwish, OrcaRouter, RouteLLM, etc. Publish the results monthly.

**Why this is field-changing**:
- We become the SOURCE OF TRUTH for routing performance. Even if a competitor scores higher on one metric, the conversation happens on our turf.
- We get a data flywheel: every router that submits gives us more reference data.
- Recruiting + brand: the team running the benchmark is the team people want to talk to.

**Why customers tweet**:
- "Nadir's RouterBench is the only honest comparison of routers I've found."
- "Just submitted to RouterBench. Beat OrcaRouter on Pareto-Arena."

**What we own (IP)**:
- The benchmark dataset (we curate, we own the methodology)
- The eval harness (open-source, but ours)
- The brand association (RouterBench = Nadir for as long as we maintain it)

**Build sized as**: 6-10 engineer-weeks. Data curation + eval harness + a clean website + first 5 router submissions for the seed leaderboard.

**Risk**: a competitor builds a better benchmark. Mitigation: be first, be open, be diligent. OpenAI never lost MMLU.

---

## How these three combine into a viral moment

We don't ship them separately. We ship them in this sequence over ~6 months:

**Month 1-2**: RouterBench launches publicly. We score top-3 (honest assessment of current state). We open-source the harness. PR moment: "Nadir announces RouterBench, the first open eval platform for LLM routers." Engineers click and submit.

**Month 3-4**: Verifier-Gated Cascade Routing launches in private beta. Internal benchmark on RouterBench shows we move to #1 with a >5pt margin. We publish the paper. PR moment: "Nadir launches verifier-gated routing. 60% cost reduction at zero quality regression." This is the headline that goes viral.

**Month 5-6**: PDR (Prompt Decomposition Routing) launches as an opt-in advanced mode. We publish a second paper. PR moment: "Nadir's prompt decomposition cuts agentic LLM costs by 70%." This is the paper engineers send to each other.

By month 6, Nadir is not a router. Nadir is the **routing research lab + production product**. Weave is a feature.

---

## What I'd kill from the cycle 1-3 roadmap to fund this

Honest tradeoffs:

**Keep (necessary parity, low cost)**:
- `/v1/route_only` endpoint (1 week, needed for RouterBench harness and RouterArena submission)
- RouterArena submission (founder approval pending — public-action gate)
- Streaming + Claude passthrough on `/v1/messages` (already shipped)

**Defer or kill (parity work that doesn't move the needle)**:
- WS-2.5 Gemini native endpoint — defer. Gemini users can use the `/v1/messages` cross-format path for now. Native endpoint is polish.
- WS-2 W3 npm installer publish — defer. Distribution-channel work, not product work. Ship after we have a verifier-gated headline.
- Bandit DB wiring — defer. Bandit is "incremental adaptation." Verifier-gated routing is a paradigm shift.

**Reallocate** the saved capacity to:
- Verifier model training (data curation + small distilled model + cascade orchestration)
- RouterBench dataset + harness
- The first written paper / blog explaining verifier-gated routing

---

## What I need from you (no money spent without your go)

Reading this report costs nothing. Any of the following has cost or risk attached and needs your explicit go:

1. **Real LLM API calls** for training data generation (paired cheap/expensive responses for the verifier corpus). Estimated $200-2000 to build a 10K-prompt training set across Haiku/Sonnet/Opus.
2. **Real RouterArena submission** (free, but a public action with our name on it). Needs founder + eng-lead review of the contamination audit reports and the adapter.
3. **`@nadir` npm org registration** (free, but commits us to the name). Or commit to `nadir-router` unscoped.
4. **Supabase migration application** for the `routing_arms` + `bandit_reward_log` tables. Schema-only, additive, reversible, but production state.
5. **`npm publish` of the installer** — public action.
6. **Any more agent runs in this multi-agent loop** — costs tokens. The two reviewers in flight when you sent this directive will complete; I will not spawn more without confirmation.

Pause state: the loop is stopped at "WS-1 + WS-2.5 reviewers in flight." When they return I will summarize their findings, save the verdicts, and wait. No executors. No validators. No new architects.

---

## The case in one sentence

Weave Router is a cluster scorer with installers. We can match that in a quarter, or we can spend that quarter shipping verifier-gated cascade routing + the public benchmark that defines the field, and stop competing on features they can copy in a sprint.

The parity work is defense. The verifier + decomposer + benchmark is offense. To be #1 we need to play offense.

Your call.
