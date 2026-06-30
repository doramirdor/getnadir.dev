/**
 * Nadir — single technical guide (/tech).
 *
 * One page, read top to bottom, for an engineer who wants to understand the
 * product and wire it in. Consolidates four former pitch pages (architecture,
 * router internals, API reference, on-prem) into five anchored sections:
 *
 *   overview · architecture · routing · api · integration
 *
 * Same hand-drawn blueprint language as the rest of /pitch and /redesign. All
 * primitives come from @/components/brand/tech and motifs; the local diagram,
 * ladder, and topology helpers below are inlined here so this page is fully
 * self-contained (the four source pages are being deleted).
 *
 * Facts are canonical: 60% lower cost vs always-Opus, ~98% quality retained,
 * n=11,420 RouterBench held-out triples; verifier AUROC 0.961, ECE 0.016;
 * catastrophic ~1.7% at tau=0.8, 2.4% at tau=0.7. Always labelled HELD-OUT eval
 * and re-measured per deployment. Never claim "0% catastrophic routes".
 *
 * Escaping note: inside CodeBlock template literals, every literal ${ is written
 * as \${ and every backtick as \` so the Cloudflare frontend build does not break.
 */
import { Link } from "react-router-dom";
import { ReactNode } from "react";
import {
  TechShell, SideNav, Plate, SectionHead, Eyebrow, Annotation, Pill, Sheet,
  FeatureCard, Step, CodeBlock, SpecTable, Callout, HeroField,
} from "@/components/brand/tech";
import {
  Sparkle, SketchBox, DottedGrid, ContourLines, DataTicks, RoutePath,
  SketchStairs, DocCheck, SignalDots, Agave,
} from "@/components/brand/motifs";

/* ── Section registry (drives SideNav + the DOM ids) ─────────────────── */

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture", sub: [
    { id: "arch-ml", label: "ML stack" },
    { id: "arch-data", label: "Data model" },
    { id: "arch-deploy", label: "Deployment" },
  ] },
  { id: "routing", label: "Routing", sub: [
    { id: "route-scoring", label: "Complexity scoring" },
    { id: "route-ladder", label: "Capability ladder" },
    { id: "route-verify", label: "Verify & escalate" },
    { id: "route-knob", label: "Cost / quality knob" },
  ] },
  { id: "api", label: "API", sub: [
    { id: "api-auth", label: "Auth & base URL" },
    { id: "api-chat", label: "Chat completions" },
    { id: "api-recommend", label: "Recommendation" },
    { id: "api-errors", label: "Errors & streaming" },
  ] },
  { id: "integration", label: "Integration", sub: [
    { id: "int-deploy", label: "Deploy in your VPC" },
    { id: "int-models", label: "Your models" },
    { id: "int-gateway", label: "Your gateway" },
    { id: "int-privacy", label: "Data residency" },
  ] },
];

/* ── Local helper: blueprint flow node + connector (request lifecycle) ── */

function FlowNode({ k, label, sub, accent = false }: { k: string; label: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`relative w-full px-3 py-2.5 ${accent ? "bg-[var(--strawberry)]/[0.16]" : "bg-[var(--paper)]"}`}>
      <SketchBox color="var(--ink)" />
      <div className="relative flex items-center gap-2">
        <span className="font-mono text-[9px] font-semibold text-[var(--strawberry)]">{k}</span>
        <span className="font-mono text-[11px] font-semibold leading-tight text-[var(--ink)]">{label}</span>
      </div>
      {sub ? <div className="relative mt-0.5 pl-5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--ink)]/50">{sub}</div> : null}
    </div>
  );
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 pl-3">
      <svg viewBox="0 0 12 26" className="h-6 w-3 shrink-0" fill="none" aria-hidden="true">
        <path d="M6 1 L6 19" stroke="var(--ink)" strokeWidth="1.1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        <path d="M2.5 15 L6 21 L9.5 15" stroke="var(--strawberry)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label ? <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--ink)]/45">{label}</span> : null}
    </div>
  );
}

/* ── Local helper: capability-ladder specimen (routing section) ──────── */

type Rung = { tier: string; model: string; alt: string; task: string; cost: string; accent?: boolean };

const LADDER: Rung[] = [
  { tier: "reasoning", model: "claude-opus-4-6", alt: "o-series / Gemini Pro equivalents", task: "Multi-step reasoning, hard code, long-context synthesis.", cost: "$$$$" },
  { tier: "complex", model: "claude-opus-4-6", alt: "top-tier provider models", task: "Nuanced generation, careful judgement, tricky edge cases.", cost: "$$$" },
  { tier: "mid", model: "claude-sonnet-4-6", alt: "GPT-class mid models", task: "Drafting, structured extraction, most everyday generation.", cost: "$$" },
  { tier: "simple", model: "claude-haiku-4-5", alt: "Flash / mini equivalents", task: "Classification, tagging, short summaries, routine tool calls.", cost: "$", accent: true },
];

function CapabilityLadder() {
  return (
    <div className="relative bg-[var(--paper)] p-5">
      <SketchBox color="var(--ink)" />
      <div className="relative flex items-center justify-between">
        <span className="eyebrow text-[var(--ink)]/55">Capability ladder</span>
        <span className="font-mono text-[10px] text-[var(--ink)]/45">low → high</span>
      </div>
      <ul className="relative mt-4 space-y-2.5">
        {LADDER.map((r) => (
          <li key={r.tier} className={`relative px-3 py-3 ${r.accent ? "bg-[var(--strawberry)]/[0.12]" : "bg-[var(--shell)]/60"}`}>
            <SketchBox color="var(--ink)" />
            <div className="relative flex items-baseline gap-2">
              <span className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${r.accent ? "text-[var(--strawberry)]" : "text-[var(--ink)]/70"}`}>{r.tier}</span>
              <span className="font-mono text-[11px] text-[var(--ink)]">{r.model}</span>
              <span className="mx-1 hidden flex-1 translate-y-[-2px] border-b border-dotted border-[var(--ink)]/25 sm:block" />
              <span className="ml-auto font-mono text-[12px] tabular-nums text-[var(--ink)]/70 sm:ml-0">{r.cost}</span>
            </div>
            <p className="relative mt-1.5 text-[11.5px] leading-snug text-[var(--ink)]/60">{r.task}</p>
            <p className="relative mt-1 font-mono text-[9.5px] uppercase tracking-wide text-[var(--ink)]/40">also: {r.alt}</p>
          </li>
        ))}
      </ul>
      <Annotation className="absolute -bottom-7 right-2 rotate-2 text-[var(--ink)]/60">enter low, climb if rejected ↑</Annotation>
    </div>
  );
}

/* ── Local helper: gateway-topology boxes + connectors (integration) ──── */

function NodeBox({ label, sub, accent = false }: { label: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`relative min-w-[108px] px-3 py-2.5 text-center ${accent ? "bg-[var(--strawberry)]/[0.16]" : "bg-[var(--paper)]"}`}>
      <SketchBox color="var(--ink)" />
      <div className="relative font-mono text-[11px] font-semibold leading-tight text-[var(--ink)]">{label}</div>
      {sub ? <div className="relative mt-0.5 font-mono text-[8.5px] uppercase tracking-wide text-[var(--ink)]/50">{sub}</div> : null}
    </div>
  );
}

function Hop({ label }: { label?: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center px-1.5">
      <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--ink)]/45">{label ?? " "}</span>
      <svg viewBox="0 0 34 12" className="h-3 w-8" fill="none" aria-hidden="true">
        <path d="M1 6 L26 6" stroke="var(--ink)" strokeWidth="1.1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        <path d="M27 2.5 L33 6 L27 9.5" stroke="var(--strawberry)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

type TopoNode = { box: { label: string; sub?: string; accent?: boolean } } | { hop: { label?: string } };

function Topology({ nodes }: { nodes: TopoNode[] }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-y-3">
      {nodes.map((n, i) => ("box" in n ? <NodeBox key={i} {...n.box} /> : <Hop key={i} {...n.hop} />))}
    </div>
  );
}

/* ── Local helper: a small bullet row used in a few sections ─────────── */

function BulletRow({ items }: { items: [string, string][] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map(([h, b]) => (
        <li key={h} className="flex gap-3">
          <Sparkle className="mt-1 h-3.5 w-3.5 shrink-0" color="var(--strawberry)" />
          <div>
            <div className="font-editorial text-[16px] text-[var(--ink)]">{h}</div>
            <div className="text-[12.5px] leading-relaxed text-[var(--ink)]/65">{b}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Hero (full width, above the grid) ───────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <HeroField />
      <div className="relative mx-auto max-w-[1280px] px-6 pb-12 pt-14 lg:px-10 lg:pb-16 lg:pt-16">
        <div className="max-w-3xl">
          <h1 className="font-editorial text-[clamp(34px,4.8vw,60px)] font-semibold leading-[1.0] text-[var(--ink)]">
            Everything an engineer needs,{" "}
            <span className="italic text-[var(--strawberry)]">on one page</span>
            <Sparkle className="inline-block h-4 w-4 align-super" color="var(--strawberry)" />
            <span>.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--ink)]/75">
            What Nadir is, how the router decides, and how to integrate it. Read it top to bottom and
            you will know the architecture, the routing loop, the API surface, and how to deploy it
            inside your own perimeter.
          </p>
          <a href="/tech.md" target="_blank" rel="noopener"
            className="mt-7 inline-flex items-center gap-1.5 eyebrow text-[var(--ink)]/55 no-underline transition-colors hover:text-[var(--strawberry)]">
            Read as Markdown
            <span className="font-mono text-[10px] normal-case tracking-normal text-[var(--ink)]/45">for LLM agents ↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Section: Overview ───────────────────────────────────────────────── */

const LOOP_STEPS = [
  { n: "01", t: "Route", b: "A trained classifier scores the prompt and picks the lowest viable tier, the smallest model likely to answer. No LLM call, roughly a 10ms-class step.", motif: <RoutePath className="h-12 w-20" color="var(--ink)" /> },
  { n: "02", t: "Verify", b: "The candidate answer is scored against quality signals before it is ever returned to the caller. A weak cheap answer never ships unchecked.", motif: <DocCheck className="h-12 w-14" color="var(--ink)" /> },
  { n: "03", t: "Escalate", b: "If the answer fails the bar, Nadir steps up the ladder one rung and retries, only as far as it needs to. Pass the bar and it returns.", motif: <SketchStairs className="h-12 w-16" color="var(--ink)" /> },
];

const CAPABILITIES = [
  { t: "Lowest-viable routing", tags: ["Classifier"], b: "A trained classifier predicts the smallest model likely to satisfy each prompt rather than reaching for the most expensive one by default." },
  { t: "Verify & escalate", tags: ["Guardrail"], b: "A verifier catches weak cheap answers and escalates before the user sees them, so savings never come at the cost of a wrong answer slipping through." },
  { t: "Multi-provider", tags: ["OpenAI", "Anthropic", "Google", "Bedrock"], b: "One OpenAI-compatible surface over every major provider via LiteLLM. Add, swap, or pin models without touching app code." },
  { t: "Bring your own gateway", tags: ["Drop-in"], b: "Point Nadir at the LiteLLM or internal gateway you already run as its upstream, or place it in front. It composes, it does not replace." },
  { t: "Self-host in your VPC", tags: ["Docker", "On-prem"], b: "Ships as a single container. Your keys, your weights, your network perimeter. No prompt has to leave your environment." },
  { t: "Observability built in", tags: ["Logs", "Savings"], b: "Per-request logs, routed-vs-benchmark cost, latency, and escalation reason, with a privacy mode that hashes prompts at rest." },
];

function Overview() {
  return (
    <Plate n="01" label="Overview" id="overview">
      <SectionHead
        title={<>Routing infrastructure that picks the cheapest right answer.</>}
        sub={<>Nadir sits in front of your providers and, for every prompt, predicts the smallest model
          that can answer it, verifies the result, and escalates only when the cheap answer falls short.
          It runs as one OpenAI-compatible container you can deploy inside your own perimeter.</>}
      />

      <div className="mt-10">
        <Eyebrow>The loop, every call</Eyebrow>
        <div className="mt-5 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {LOOP_STEPS.map((s) => (
            <div key={s.t} className="relative">
              <div className="flex items-baseline gap-2.5">
                <span className="font-editorial text-[28px] leading-none text-[var(--strawberry)]">{s.n}</span>
                <span className="eyebrow text-[var(--ink)]">{s.t}</span>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--ink)]/65">{s.b}</p>
              <div className="mt-4 grid h-12 place-items-center">{s.motif}</div>
            </div>
          ))}
        </div>
        <Annotation className="mt-5 block -rotate-1 text-[var(--ink)]/60">route, verify, escalate, one decision ↘</Annotation>
      </div>

      <div className="mt-12">
        <Eyebrow>What you get</Eyebrow>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => <FeatureCard key={c.t} title={c.t} tags={c.tags} body={c.b} />)}
        </div>
      </div>
    </Plate>
  );
}

/* ── Section: Architecture ───────────────────────────────────────────── */

const STAGES = [
  { k: "01", t: "Client request", b: "An OpenAI-compatible POST to /v1/chat/completions hits the FastAPI app, served by Uvicorn under Gunicorn.", tag: "FastAPI" },
  { k: "02", t: "Auth", b: "The X-API-Key header is SHA-256 hashed and looked up against api_keys.key_hash. The dashboard uses a Supabase JWT instead.", tag: "X-API-Key → SHA-256" },
  { k: "03", t: "Subscription / rate-limit guard", b: "Middleware checks the subscription state, applies the rate limiter, and trips the circuit breaker on unhealthy upstreams before any model work runs.", tag: "Middleware" },
  { k: "04", t: "Complexity classifier", b: "The trained classifier scores the prompt. The centroid path is roughly 10ms; heavier analyzers run when configured.", tag: "COMPLEXITY_ANALYZER_TYPE=trained" },
  { k: "05", t: "Lowest-viable model select", b: "The score maps onto a 4-tier capability ladder. Nadir picks the smallest model likely to satisfy the prompt rather than the most expensive one.", tag: "4-tier ladder" },
  { k: "06", t: "Provider call", b: "The chosen model is invoked through LiteLLM, the single unified surface over OpenAI, Anthropic, and Google.", tag: "LiteLLM" },
  { k: "07", t: "Verify", b: "The candidate answer is scored against quality signals before it is returned. A weak cheap answer never reaches the caller unchecked.", tag: "Quality gate" },
  { k: "08", t: "Escalate or return", b: "Pass the bar and the answer returns. Fail it and Nadir steps one rung up the ladder and retries, only as far as it needs to.", tag: "Branch ↺" },
  { k: "09", t: "Log", b: "The request is written to usage_logs, and a routed-vs-benchmark cost row lands in savings_tracking. Background tasks run via Celery.", tag: "usage_logs + savings_tracking" },
];

const ANALYZERS = [
  { t: "Trained classifier", tags: ["Production default", "~10ms centroid"], b: "The shipped analyzer, selected with COMPLEXITY_ANALYZER_TYPE=trained. A trained model with a fast centroid path scores each prompt to pick a tier without a heavyweight forward pass on every call." },
  { t: "BERT analyzer", tags: ["Transformers", "Reference"], b: "A transformer encoder that reads the prompt directly. Heavier and more accurate per call, kept as a reference analyzer for offline comparison and harder routing splits." },
  { t: "Matrix factorization", tags: ["scikit-learn", "Reference"], b: "Learns latent prompt and model factors from historical prompt/model/score triples, predicting which model will satisfy a prompt from collaborative structure rather than text." },
  { t: "Two-tower", tags: ["PyTorch", "Reference"], b: "Separate prompt and model encoders meeting in a shared space, so model suitability is a dot product. A compact neural analyzer kept for benchmarking." },
  { t: "Ensemble", tags: ["Blend", "Reference"], b: "Combines the signals from the analyzers above into one routing score, trading inference cost for a steadier decision on ambiguous prompts." },
  { t: "OCR for images", tags: ["Vision", "Multimodal"], b: "Image prompts are run through OCR so their extracted text feeds the same complexity pipeline as plain-text prompts, keeping one routing path." },
];

const TABLES = [
  { t: "usage_logs", tag: "per request", cols: [["prompt", "text or sha256:<hex>"], ["response", "text, dropped when hashed"], ["model", "which model answered"], ["cost / latency", "numeric"], ["metadata", "jsonb"]] as [string, string][] },
  { t: "savings_tracking", tag: "one row per route", cols: [["routed_cost", "what Nadir spent"], ["benchmark_cost", "always-Opus baseline"], ["delta", "saved this request"]] as [string, string][] },
  { t: "savings_invoices", tag: "monthly", cols: [["period", "billing month"], ["gross_saved", "aggregate"], ["net", "after variable fee"]] as [string, string][] },
  { t: "profiles.model_parameters", tag: "jsonb settings", cols: [["layers", "routing · fallback · optimize"], ["privacy.store_prompts", "default true"]] as [string, string][] },
];

function TableCard({ t, tag, cols }: { t: string; tag: string; cols: [string, string][] }) {
  return (
    <div className="relative p-5">
      <SketchBox color="var(--ink)" />
      <div className="relative flex items-baseline justify-between gap-3">
        <code className="font-mono text-[14px] font-semibold text-[var(--ink)]">{t}</code>
        <Pill>{tag}</Pill>
      </div>
      <dl className="relative mt-3 divide-y divide-dashed divide-[var(--ink)]/15">
        {cols.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
            <dt className="font-mono text-[10.5px] text-[var(--ink)]/70">{k}</dt>
            <dd className="text-right font-mono text-[10px] uppercase tracking-wide text-[var(--ink)]/50">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Architecture() {
  return (
    <Plate n="02" label="Architecture" id="architecture" decals={false} className="bg-[var(--glacier)]/[0.18]">
      <SectionHead
        title={<>One request, end to end.</>}
        sub={<>Every call walks the same path. Authenticate, guard, classify, pick the lowest viable model,
          call it, verify the answer, escalate only if the answer fails, then log. No request skips the
          verifier, and no escalation goes further up the ladder than it must.</>}
      />

      {/* Request-flow diagram + lifecycle steps */}
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div className="relative">
          <Annotation className="absolute -top-7 right-2 rotate-2 text-[var(--ink)]/60">same loop, every call ↓</Annotation>
          <div className="space-y-0">
            <FlowNode k="01" label="Client request" sub="POST /v1/chat/completions" />
            <FlowArrow />
            <FlowNode k="02" label="Auth" sub="X-API-Key → key_hash" />
            <FlowArrow />
            <FlowNode k="03" label="Subscription / rate-limit guard" sub="middleware" />
            <FlowArrow />
            <FlowNode k="04" label="Complexity classifier" sub="trained, ~10ms centroid" accent />
            <FlowArrow />
            <FlowNode k="05" label="Lowest-viable model select" sub="4-tier ladder" accent />
            <FlowArrow />
            <FlowNode k="06" label="Provider call" sub="via LiteLLM" />
            <FlowArrow />
            <FlowNode k="07" label="Verify" sub="quality gate" accent />
            <div className="relative mt-1 grid grid-cols-2 gap-3 pl-3">
              <div>
                <FlowArrow label="fail" />
                <div className="relative bg-[var(--paper)] px-3 py-2">
                  <SketchBox color="var(--ink)" />
                  <div className="relative flex items-center gap-1.5">
                    <SketchStairs className="h-5 w-7 shrink-0" color="var(--strawberry)" />
                    <span className="font-mono text-[10px] font-semibold text-[var(--ink)]">Escalate ↺</span>
                  </div>
                  <div className="relative mt-0.5 font-mono text-[8px] uppercase tracking-wide text-[var(--ink)]/50">retry one rung up</div>
                </div>
              </div>
              <div>
                <FlowArrow label="pass" />
                <div className="relative bg-[var(--mint)]/50 px-3 py-2">
                  <SketchBox color="var(--ink)" />
                  <div className="relative flex items-center gap-1.5">
                    <DocCheck className="h-5 w-6 shrink-0" color="var(--ink)" />
                    <span className="font-mono text-[10px] font-semibold text-[var(--ink)]">Return</span>
                  </div>
                  <div className="relative mt-0.5 font-mono text-[8px] uppercase tracking-wide text-[var(--ink)]/50">answer to caller</div>
                </div>
              </div>
            </div>
            <FlowArrow label="always" />
            <FlowNode k="09" label="Log" sub="usage_logs + savings_tracking" />
          </div>
        </div>

        <div className="space-y-6 self-start">
          {STAGES.map((s) => (
            <Step key={s.k} n={s.k} title={s.t}>
              <p>{s.b}</p>
              <div className="mt-2"><Pill>{s.tag}</Pill></div>
            </Step>
          ))}
        </div>
      </div>

      <Callout kind="note" title="Escalation, bounded">
        Escalation is the only branch. The verifier either passes the cheap answer through, or steps the
        request one rung up the ladder and re-runs. A small share of routes still miss, and that
        catastrophic rate is bounded, measured, and reported in the routing section below.
      </Callout>

      {/* The ML stack */}
      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <SectionHead
          id="arch-ml"
          eyebrow="The ML stack"
          title={<>One analyzer ships. The rest are the bench.</>}
          sub={<>Routing turns on a complexity score, and the trained classifier produces it in production.
            The heavier analyzers exist for offline evaluation and harder splits, swappable through a single
            environment variable, so the production path stays fast.</>}
        />
        <div className="self-center">
          <Sheet tone="glacier">
            <Eyebrow>Stack</Eyebrow>
            <SpecTable
              className="mt-3"
              rows={[
                ["select via", <code className="font-mono text-[11px]">COMPLEXITY_ANALYZER_TYPE</code>],
                ["production", "trained"],
                ["frameworks", "PyTorch · Transformers"],
                ["classical", "scikit-learn"],
                ["embeddings", "sentence-transformers"],
                ["centroid path", "~10ms class"],
              ]}
            />
            <Annotation className="mt-4 block -rotate-1 text-[var(--ink)]/60">one env var flips the analyzer ↗</Annotation>
          </Sheet>
        </div>
      </div>

      <div className="mt-10">
        <Eyebrow>Analyzers</Eyebrow>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ANALYZERS.map((a) => <FeatureCard key={a.t} title={a.t} tags={a.tags} body={a.b} />)}
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr] lg:gap-12">
        <div className="relative flex flex-col p-5">
          <SketchBox color="var(--ink)" />
          <div className="relative flex items-start gap-2">
            <DottedGrid className="mt-0.5 h-8 w-11 shrink-0" color="var(--ink)" />
            <h3 className="font-editorial text-[19px] leading-tight text-[var(--ink)]">Embeddings &amp; semantic cache</h3>
          </div>
          <p className="relative mt-3 text-[12.5px] leading-relaxed text-[var(--ink)]/65">
            sentence-transformers produce prompt embeddings that feed a semantic cache. Near-duplicate
            prompts reuse a prior routing decision and result instead of paying for a fresh classify and call,
            cutting both latency and spend on repeated traffic.
          </p>
        </div>
        <div className="self-center">
          <DataTicks className="h-16 w-full opacity-60" color="var(--ink)" />
          <Annotation className="mt-2 block text-right rotate-1 text-[var(--ink)]/55">cache the obvious, classify the rest ↘</Annotation>
        </div>
      </div>

      {/* Data model */}
      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <SectionHead
          id="arch-data"
          eyebrow="Data model"
          title={<>Postgres, on Supabase. Four tables do the work.</>}
          sub={<>Every routed request leaves a per-request log and a savings row, aggregated monthly into
            invoices. Per-user routing settings live in a single jsonb column, so additive changes never
            need a migration.</>}
        />
        <div className="self-center">
          <RoutePath className="h-24 w-full opacity-60" color="var(--ink)" />
          <Annotation className="mt-1 block text-right rotate-1 text-[var(--ink)]/55">request in, two rows out ↗</Annotation>
        </div>
      </div>

      <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TABLES.map((tb) => <TableCard key={tb.t} {...tb} />)}
      </div>

      <Callout kind="note" title="Privacy contract">
        When <code className="font-mono text-[11px]">profiles.model_parameters.privacy.store_prompts</code> is
        false, the backend writes <code className="font-mono text-[11px]">sha256:&lt;hex&gt;</code> into the
        prompt column instead of the raw text and drops the response body, stamping
        <code className="font-mono text-[11px]"> metadata.prompt_hashed=true</code>. The frontend never selects
        the prompt column. Default is store on, so opt out and no raw prompt persists.
      </Callout>

      {/* Deployment topology */}
      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <SectionHead
            id="arch-deploy"
            eyebrow="Deployment topology"
            title={<>One container. Your boundary.</>}
            sub={<>A multi-stage Docker build compiles the React frontend with Node, then drops it into a
              Python 3.12 backend image. Gunicorn supervises a pool of Uvicorn workers serving both the API
              and the static assets.</>}
          />
          <BulletRow
            items={[
              ["Single image", "Node frontend build feeds a Python 3.12 backend stage. One artifact serves API and static assets on port 8000."],
              ["Gunicorn + Uvicorn", "Gunicorn manages a pool of Uvicorn workers, async FastAPI throughout, Celery for background tasks."],
              ["Supabase + Stripe", "Supabase Postgres is the data layer. Stripe handles billing on the hosted plan, not required when you self-host."],
              ["Runs where you do", "Push the same image to AWS App Runner, ECS, or your own Kubernetes. No managed control plane to depend on."],
            ]}
          />
        </div>

        <div className="relative self-start">
          <ContourLines className="pointer-events-none absolute -right-2 -top-7 hidden h-16 w-20 opacity-70 lg:block" color="var(--ink)" />
          <CodeBlock
            lang="dockerfile"
            filename="Dockerfile"
            caption="frontend builds, backend serves →"
            code={`# stage 1 · build the React frontend
FROM node:20 AS web
WORKDIR /app
COPY app/ .
RUN npm ci && npm run build

# stage 2 · Python 3.12 backend serves API + assets
FROM python:3.12-slim
WORKDIR /srv
COPY backend/ .
COPY --from=web /app/dist ./static
RUN pip install -r requirements.txt

# Gunicorn supervises Uvicorn workers
CMD ["gunicorn", "app.main:app", \\
     "-k", "uvicorn.workers.UvicornWorker", \\
     "-w", "4", "-b", "0.0.0.0:8000"]`}
          />
          <Annotation className="mt-3 block pl-1 -rotate-1 text-[var(--ink)]/60">same image, App Runner / ECS / k8s ↗</Annotation>
        </div>
      </div>
    </Plate>
  );
}

/* ── Section: Routing ────────────────────────────────────────────────── */

const SCORE_FEATURES: [string, string][] = [
  ["Prompt structure", "Message count, role pattern, presence of system constraints, tool / function-calling intent."],
  ["Length & shape", "Token length, code-block density, list and table structure, attachment / context size."],
  ["Task signal", "Inferred task type, summarise, classify, extract, rewrite, reason, generate, that the centroids were fit on."],
];

const LOOP = [
  { n: "01", t: "Answer cheap", b: "The current rung generates a candidate answer. On the first pass that is the tier the classifier predicted.", motif: <RoutePath className="h-10 w-20" color="var(--ink)" /> },
  { n: "02", t: "Score it", b: "A verifier scores the candidate and returns a calibrated pass probability, never showing the caller an unscored answer.", motif: <DocCheck className="h-11 w-14" color="var(--ink)" /> },
  { n: "03", t: "Clear or climb", b: "Clears the bar tau, it ships. Falls short, Nadir escalates exactly one rung and repeats the loop.", motif: <SketchStairs className="h-10 w-16" color="var(--ink)" /> },
];

const OUTCOME = [
  { v: "60", u: "%", k: "Lower cost vs always-Opus", note: "At the default bar, on held-out RouterBench triples.", c: "var(--strawberry)" },
  { v: "~98", u: "%", k: "Quality retained", note: "Versus the always-best-model baseline.", c: "var(--ink)" },
  { v: "11,420", u: "", k: "Held-out triples", note: "RouterBench prompt / model / score eval set.", c: "var(--sky)" },
];

function Routing() {
  return (
    <Plate n="03" label="Routing" id="routing">
      <SectionHead
        title={<>The lowest viable model, and how we prove it.</>}
        sub={<>Routing cheap is easy. Routing cheap without quietly shipping a worse answer is the hard part.
          A complexity score picks the smallest tier worth trying, a verifier scores the candidate before it
          ships, and Nadir escalates one rung at a time only when the answer falls short.</>}
      />

      {/* Complexity scoring */}
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div>
          <span id="route-scoring" className="block scroll-mt-24" aria-hidden /><Eyebrow>Complexity scoring</Eyebrow>
          <h3 className="mt-3 font-editorial text-[clamp(20px,2.4vw,28px)] font-semibold leading-tight text-[var(--ink)]">
            A trained classifier reads the prompt before any model does.
          </h3>
          <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-[var(--ink)]/70">
            Every request first passes through a trained complexity classifier on the fast path, a centroid
            plus gradient-boosted-tree class of model, roughly a 10ms-class step, no LLM call. It emits a
            complexity score from cheap features of the prompt, not from the answer.
          </p>
          <div className="mt-6">
            <Eyebrow>What the score is built from</Eyebrow>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {SCORE_FEATURES.map((f, i) => (
                <div key={f[0]} className="relative p-4">
                  <SketchBox color="var(--ink)" />
                  <div className="relative flex items-baseline gap-2">
                    <span className="font-mono text-[11px] font-semibold text-[var(--strawberry)]">{String(i + 1).padStart(2, "0")}</span>
                    <span className="eyebrow text-[var(--ink)]">{f[0]}</span>
                  </div>
                  <p className="relative mt-2.5 text-[11.5px] leading-relaxed text-[var(--ink)]/65">{f[1]}</p>
                </div>
              ))}
            </div>
          </div>
          <Callout kind="note" title="It predicts a tier, not a verdict">
            The classifier does not answer "hard or easy". It predicts the <em>minimal capability tier</em> likely
            to satisfy the prompt, the lowest rung worth trying first. The verify-then-escalate loop is what
            confirms that guess was right before anything ships.
          </Callout>
        </div>

        <div className="relative self-center">
          <DataTicks className="pointer-events-none absolute -right-2 -top-9 hidden h-12 w-24 opacity-60 lg:block" color="var(--ink)" />
          <Sheet tone="glacier">
            <div className="flex items-center justify-between">
              <span className="eyebrow text-[var(--ink)]/60">Score, then start point</span>
              <span className="font-mono text-[10px] text-[var(--ink)]/45">~10ms · no LLM</span>
            </div>
            <div className="mt-4 flex items-center justify-center">
              <SignalDots className="h-16 w-24 opacity-80" />
            </div>
            <SpecTable
              className="mt-4"
              rows={[
                ["prompt", <span className="text-[var(--ink)]/70">"tag the sentiment"</span>],
                ["complexity", "0.18 / 1.0"],
                ["predicted task", "classify"],
                ["start tier", <span className="font-semibold text-[var(--strawberry)]">simple</span>],
              ]}
            />
            <Annotation className="mt-3 block -rotate-1 text-[var(--ink)]/60">cheap signal, cheap to compute ↘</Annotation>
          </Sheet>
        </div>
      </div>

      {/* Capability ladder */}
      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
        <div>
          <SectionHead
            id="route-ladder"
            eyebrow="Four tiers, one direction"
            title={<>A ladder of capability, climbed only as far as needed.</>}
            sub={<>The router maps every prompt onto four tiers, simple, mid, complex, reasoning. The default
              router, <span className="font-mono text-[12px]">wide_deep_asym</span> plus the cascade verifier,
              starts at the predicted rung and climbs only on a failed check. The benchmark we measure against
              is always-Opus 4.6, the top of the ladder for every prompt.</>}
          />
          <BulletRow
            items={[
              ["Start low", "Most traffic enters at simple or mid, where the predicted tier already satisfies."],
              ["Climb on demand", "A rung is only spent when the verifier rejects the rung below it."],
              ["Provider-agnostic", "The Claude tiers shown are the defaults. OpenAI and Google equivalents slot into the same rungs."],
            ]}
          />
          <Annotation className="mt-6 block -rotate-2 text-[var(--ink)]/60">benchmark = always-Opus 4.6 ↗</Annotation>
        </div>

        <div className="relative self-center">
          <SketchStairs className="pointer-events-none absolute -left-9 bottom-2 hidden h-20 w-16 opacity-50 lg:block" color="var(--ink)" />
          <CapabilityLadder />
        </div>
      </div>

      {/* Verify then escalate */}
      <div className="mt-16">
        <SectionHead
          id="route-verify"
          eyebrow="Verify then escalate"
          title={<>The core loop: score the cheap answer, escalate only on a miss.</>}
          sub={<>This is the difference between Nadir and naive routing. A cheap guess is never returned on
            faith. The verifier scores it against a calibrated bar, the threshold tau, and the router climbs
            the ladder one rung at a time until an answer clears, or it reaches the top.</>}
        />

        <div className="mt-9 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {LOOP.map((s) => (
            <div key={s.t} className="relative">
              <div className="flex items-baseline gap-2.5">
                <span className="font-editorial text-[28px] leading-none text-[var(--strawberry)]">{s.n}</span>
                <span className="eyebrow text-[var(--ink)]">{s.t}</span>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--ink)]/65">{s.b}</p>
              <div className="mt-4 grid h-12 place-items-center">{s.motif}</div>
            </div>
          ))}
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <div>
            <Eyebrow>Held-out eval, verifier behaviour</Eyebrow>
            <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-[var(--ink)]/65">
              Measured on the held-out RouterBench evaluation, not on live production traffic. The verifier is
              the part that decides whether a cheap answer is good enough, so its calibration is what bounds risk.
            </p>
            <Sheet className="mt-5" tone="paper">
              <span className="eyebrow text-[var(--ink)]/55">Verifier metrics (held-out eval)</span>
              <SpecTable
                className="mt-3"
                rows={[
                  ["AUROC", "0.961"],
                  ["ECE (calibration error)", "0.016"],
                  ["catastrophic @ tau=0.8", <span className="text-[var(--strawberry)]">~1.7%</span>],
                  ["catastrophic @ tau=0.7", <span className="text-[var(--strawberry)]">2.4%</span>],
                  ["eval set", "11,420 triples"],
                ]}
              />
              <Annotation className="mt-3 block -rotate-1 text-[var(--ink)]/60">held-out, not a production guarantee ↘</Annotation>
            </Sheet>
          </div>

          <div className="self-start">
            <div className="eyebrow mb-4 text-[var(--ink)]/45">Lower tau, looser bar, more savings and more risk</div>
            <div className="space-y-4">
              {[
                { label: "tau = 0.8 (default)", catastrophic: 1.7, posture: "safer bar" },
                { label: "tau = 0.7", catastrophic: 2.4, posture: "more savings" },
              ].map((c) => (
                <div key={c.label} className="relative p-4">
                  <SketchBox color="var(--ink)" />
                  <div className="relative flex items-center justify-between">
                    <span className="font-mono text-[11px] text-[var(--ink)]/70">{c.label}</span>
                    <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--ink)]/45">{c.posture}</span>
                  </div>
                  <div className="relative mt-3 flex items-center gap-3">
                    <span className="w-32 shrink-0 font-mono text-[9.5px] uppercase tracking-wide text-[var(--ink)]/55">catastrophic rate</span>
                    <span className="relative h-3 flex-1 rounded-[2px] bg-[var(--ink)]/8">
                      <span className="absolute inset-y-0 left-0 rounded-[2px] bg-[var(--strawberry)]" style={{ width: `${c.catastrophic * 12}%` }} />
                    </span>
                    <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink)]/70">{c.catastrophic}%</span>
                  </div>
                </div>
              ))}
            </div>
            <Annotation className="mt-5 block text-right rotate-1 text-[var(--ink)]/60">tau trades savings against misses ↗</Annotation>
          </div>
        </div>

        <Callout kind="warn" title="These are held-out eval figures, read them honestly">
          AUROC 0.961, ECE 0.016, and the catastrophic rates above all come from the held-out RouterBench eval,
          not from any single live deployment. Reference-free production behaviour is re-measured per deployment,
          since real traffic and prompt mix differ from the eval set. Nadir tunes tau to trade savings against the
          catastrophic-route rate for your workload, which stays low but is never zero.
        </Callout>
      </div>

      {/* The cost/quality knob */}
      <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <SectionHead
            id="route-knob"
            eyebrow="The cost/quality knob"
            title={<>One knob: how much quality you insist on.</>}
            sub={<>All of the above collapses to a single operator-set trade-off. Raise the bar, the verifier
              rejects more cheap answers, you escalate more, you spend more, and you carry less risk. Lower it
              and the inverse holds. The knob is the quality floor, expressed as the verifier threshold tau.</>}
          />
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative p-4">
              <SketchBox color="var(--ink)" />
              <div className="relative eyebrow text-[var(--strawberry)]">Lower the bar</div>
              <p className="relative mt-2 text-[12px] leading-relaxed text-[var(--ink)]/65">
                More savings, more escalation skipped, slightly more risk of a weak answer clearing.
              </p>
            </div>
            <div className="relative p-4">
              <SketchBox color="var(--ink)" />
              <div className="relative eyebrow text-[var(--ink)]">Raise the bar</div>
              <p className="relative mt-2 text-[12px] leading-relaxed text-[var(--ink)]/65">
                Safer, fewer catastrophic routes, less savings as more prompts climb to the top tier.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-5">
            {OUTCOME.map((p) => (
              <div key={p.k}>
                <div className="font-editorial text-[clamp(26px,3.2vw,40px)] leading-none tabular-nums" style={{ color: p.c }}>
                  {p.v}<span className="text-[0.5em]">{p.u}</span>
                </div>
                <div className="mt-2 eyebrow text-[var(--ink)]/70">{p.k}</div>
                <p className="mt-2 text-[11px] leading-snug text-[var(--ink)]/55">{p.note}</p>
              </div>
            ))}
          </div>
          <Annotation className="mt-6 block -rotate-1 text-[var(--ink)]/60">default setting, held-out eval ↘</Annotation>
        </div>

        <div className="relative self-center">
          <ContourLines className="pointer-events-none absolute -right-2 -top-10 hidden h-16 w-20 opacity-50 lg:block" color="var(--ink)" />
          <CodeBlock
            lang="json"
            filename="routing.layer.json"
            caption="one threshold sets the whole posture →"
            code={`{
  "router": "wide_deep_asym",
  "verifier": "cascade",
  "tiers": ["simple", "mid", "complex", "reasoning"],
  "benchmark_model": "claude-opus-4-6",

  // the knob: quality floor as the verifier threshold.
  // higher = safer + pricier, lower = cheaper + riskier.
  "quality_floor": 0.8,        // tau, default posture
  "max_escalations": 3,        // climb at most this many rungs
  "catastrophic_guard": true   // never silently ship a failed check
}`}
          />
        </div>
      </div>
    </Plate>
  );
}

/* ── Section: API ────────────────────────────────────────────────────── */

const UTIL = [
  { m: "POST", p: "/v1/estimate_cost", b: "Estimate routed vs benchmark cost for a prompt, no LLM call." },
  { m: "GET", p: "/v1/models/available", b: "List the models available to your account, with provider and tier." },
  { m: "GET", p: "/health", b: "Liveness probe. Returns status and version. No auth required." },
];

const ERRORS: [string, ReactNode][] = [
  ["401 Unauthorized", "Missing or bad key. Check X-API-Key / bearer token."],
  ["402 Payment Required", "Quota or credit exhausted on the account."],
  ["403 Forbidden", "Subscription guard. Plan does not allow this route."],
  ["429 Too Many Requests", "Rate limited. Honour the Retry-After header."],
  ["5xx Provider error", "Upstream provider failed. Circuit breaker trips."],
];

function Api() {
  return (
    <Plate n="04" label="API" id="api" decals={false} className="bg-[var(--glacier)]/[0.18]">
      <SectionHead
        title={<>OpenAI-compatible. Change one line.</>}
        sub={<>Nadir speaks the OpenAI Chat Completions wire format. Point your existing SDK at the base URL,
          set the model to <span className="font-mono text-[13px]">auto</span>, and the router picks the
          smallest model that can answer. Same request body, same response shape, plus a small routing metadata
          object.</>}
      />

      {/* Auth & base URL */}
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <span id="api-auth" className="block scroll-mt-24" aria-hidden /><Eyebrow>Authentication &amp; base URL</Eyebrow>
          <h3 className="mt-3 font-editorial text-[clamp(20px,2.4vw,28px)] font-semibold leading-tight text-[var(--ink)]">
            One base URL, one header.
          </h3>
          <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-[var(--ink)]/70">
            Authenticate with your Nadir key in the <span className="font-mono text-[13px]">X-API-Key</span> header.
            For drop-in OpenAI SDK compatibility, an <span className="font-mono text-[13px]">Authorization: Bearer</span> header
            is also accepted, so SDKs that only know how to send a bearer token just work.
          </p>
          <div className="mt-6">
            <SpecTable
              rows={[
                ["Base URL", <span className="text-[var(--strawberry)]">https://api.getnadir.com/v1</span>],
                ["Self-host", "http://nadir.internal:8000/v1"],
                ["Auth header", "X-API-Key: NADIR_API_KEY"],
                ["Also accepts", "Authorization: Bearer NADIR_API_KEY"],
                ["Content-Type", "application/json"],
                ["Compatible with", "OpenAI Chat Completions"],
              ]}
            />
          </div>
          <Callout kind="note" title="How keys resolve">
            Your key is hashed with SHA-256 and matched against{" "}
            <span className="font-mono text-[11px]">api_keys.key_hash</span> on every request. The raw key is
            never stored. Rotate keys from the dashboard without redeploying.
          </Callout>
        </div>

        <div className="relative self-start">
          <Annotation className="absolute -top-7 right-2 rotate-2 text-[var(--ink)]/60">same header, every call ↓</Annotation>
          <CodeBlock
            lang="bash"
            filename="auth.sh"
            caption="health check with your key →"
            code={`# set once, reuse everywhere
export NADIR_API_KEY="sk-nadir-..."

# verify the key + reach the API
curl https://api.getnadir.com/health \\
  -H "X-API-Key: \${NADIR_API_KEY}"

# -> { "status": "ok", "version": "1.x" }`}
          />
          <div className="mt-5">
            <CodeBlock
              lang="bash"
              filename="bearer.sh"
              caption="or the OpenAI-style bearer header"
              code={`# identical effect, for SDKs that only send a bearer token
curl https://api.getnadir.com/v1/models/available \\
  -H "Authorization: Bearer \${NADIR_API_KEY}"`}
            />
          </div>
        </div>
      </div>

      {/* Chat completions */}
      <div className="mt-16">
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <Pill accent>POST</Pill>
          <span className="font-mono text-[15px] text-[var(--ink)]">/v1/chat/completions</span>
        </div>
        <SectionHead
          id="api-chat"
          eyebrow="The main endpoint"
          title={<>Send an OpenAI request. Get the lowest viable model back.</>}
          sub={<>The request body is the OpenAI Chat Completions body you already write. Set{" "}
            <span className="font-mono text-[13px]">model</span> to <span className="font-mono text-[13px]">auto</span> to
            let the router choose, or pin a specific model name to bypass routing for that call. The response is the
            OpenAI shape, with the model that actually answered in <span className="font-mono text-[13px]">model</span> and a{" "}
            <span className="font-mono text-[13px]">nadir</span> metadata object alongside.</>}
        />

        <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div>
            <CodeBlock
              lang="bash"
              filename="completions.sh"
              caption="curl: route, then answer →"
              code={`curl https://api.getnadir.com/v1/chat/completions \\
  -H "X-API-Key: \${NADIR_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [
      { "role": "user",
        "content": "Summarise this thread and tag the sentiment." }
    ]
  }'`}
            />
            <div className="mt-5">
              <CodeBlock
                lang="json"
                filename="response.json"
                caption="OpenAI shape, plus a nadir block"
                code={`{
  "id": "chatcmpl_8f2a...",
  "object": "chat.completion",
  "model": "claude-haiku-4-5",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 412, "completion_tokens": 88, "total_tokens": 500 },
  "nadir": {
    "requested_model": "auto",
    "routed_tier": "simple",
    "verifier": { "score": 0.94, "passed": true },
    "escalated": false,
    "cost_vs_benchmark": -0.71
  }
}`}
              />
            </div>
          </div>

          <div>
            <Eyebrow>Key request parameters</Eyebrow>
            <div className="mt-4">
              <SpecTable
                rows={[
                  ["model", <span><span className="text-[var(--strawberry)]">auto</span> or pinned</span>],
                  ["messages", "OpenAI message array"],
                  ["temperature", "0 to 2, optional"],
                  ["max_tokens", "int, optional"],
                  ["stream", "bool, SSE when true"],
                  ["routing", "obj, optional passthrough"],
                  ["quality_floor", "0 to 1, optional"],
                ]}
              />
            </div>
            <Callout kind="tip" title="Optional Nadir extras">
              <span className="font-mono text-[11px]">routing</span> and{" "}
              <span className="font-mono text-[11px]">quality_floor</span> are optional passthrough fields. Leave
              them off and Nadir uses your account defaults. Set{" "}
              <span className="font-mono text-[11px]">quality_floor</span> higher to make the verifier stricter
              for a given call, raising the bar a cheap answer must clear before it ships.
            </Callout>
            <div className="relative mt-6 bg-[var(--paper)] p-4">
              <SketchBox color="var(--ink)" />
              <div className="relative flex items-start gap-2">
                <DottedGrid className="mt-0.5 h-6 w-9 shrink-0" color="var(--ink)" />
                <p className="text-[12.5px] leading-relaxed text-[var(--ink)]/70">
                  Pin a model anytime. Send{" "}
                  <span className="font-mono text-[11px]">"model": "claude-opus-4-6"</span> to skip routing for
                  that call. Available pinned ids: claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-6.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <Eyebrow>Same call, your SDK</Eyebrow>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CodeBlock
              lang="python"
              filename="route.py"
              caption="Python: openai SDK with base_url override →"
              code={`import os
from openai import OpenAI

client = OpenAI(
    base_url="https://api.getnadir.com/v1",
    api_key=os.environ["NADIR_API_KEY"],   # sent as the bearer token
)

resp = client.chat.completions.create(
    model="auto",                    # let Nadir choose the tier
    messages=[
        {"role": "user", "content": "Classify this ticket: ..."},
    ],
)

print(resp.choices[0].message.content)
print(resp.model)                          # which model actually answered
print(resp.nadir["routed_tier"])           # "simple" | "mid" | "complex"`}
            />
            <CodeBlock
              lang="typescript"
              filename="route.ts"
              caption="TypeScript: the openai npm package"
              code={`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.getnadir.com/v1",
  apiKey: process.env.NADIR_API_KEY,       // sent as the bearer token
});

const resp = await client.chat.completions.create({
  model: "auto",                     // let Nadir choose the tier
  messages: [
    { role: "user", content: "Extract the line items as JSON." },
  ],
});

console.log(resp.choices[0].message.content);
console.log(resp.model);                    // model that actually answered
// @ts-expect-error nadir is a Nadir-specific field on the response
console.log(resp.nadir.routed_tier);`}
            />
          </div>
        </div>
      </div>

      {/* Recommendation-only */}
      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <div className="mb-6 flex flex-wrap items-baseline gap-3">
            <Pill accent>POST</Pill>
            <span className="font-mono text-[15px] text-[var(--ink)]">/v1/public/recommendation</span>
          </div>
          <SectionHead
            id="api-recommend"
            eyebrow="Route in your own gateway"
            title={<>Get the routing decision without the LLM call.</>}
            sub={<>Recommendation-only returns the model Nadir <span className="italic">would</span> pick for a
              prompt, plus the reasoning, without making the completion. Teams that already own a gateway can keep
              their own provider calls and just ask Nadir which tier to use.</>}
          />
          <BulletRow
            items={[
              ["No spend", "It runs the classifier, not the model. You pay nothing for the inference you don't make."],
              ["Your provider call", "Take the top recommended model id and fire the call through your own gateway, with your keys and quotas."],
              ["Send a prompt", "Post a prompt and get ranked models back, with provider, tier, and a cost estimate for each."],
            ]}
          />
        </div>

        <div className="relative self-start">
          <DocCheck className="pointer-events-none absolute -right-1 -top-9 hidden h-16 w-14 opacity-80 lg:block" />
          <CodeBlock
            lang="bash"
            filename="recommend.sh"
            caption="ask which model, then call it yourself →"
            code={`curl https://api.getnadir.com/v1/public/recommendation \\
  -H "X-API-Key: \${NADIR_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Draft a release note for v2.3."
  }'`}
          />
          <div className="mt-5">
            <CodeBlock
              lang="json"
              filename="recommendation.json"
              caption="the decision, no completion"
              code={`{
  "recommendations": [
    { "model": "claude-sonnet-4-6", "provider": "anthropic",
      "confidence": 0.82, "tier": 2, "cost_estimate": 3.0 },
    { "model": "claude-haiku-4-5", "provider": "anthropic",
      "confidence": 0.61, "tier": 1, "cost_estimate": 0.8 }
  ],
  "task_complexity": 3,
  "complexity_reasoning": "Short structured generation, mid tier is enough."
}`}
            />
          </div>
        </div>
      </div>

      <div className="mt-12">
        <Eyebrow>Utility endpoints</Eyebrow>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {UTIL.map((u) => (
            <div key={u.p} className="relative p-4">
              <SketchBox color="var(--ink)" />
              <div className="relative flex items-baseline gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase text-[var(--strawberry)]">{u.m}</span>
                <span className="font-mono text-[12px] text-[var(--ink)]">{u.p}</span>
              </div>
              <p className="relative mt-2.5 text-[12px] leading-relaxed text-[var(--ink)]/65">{u.b}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Responses, errors & streaming */}
      <div className="mt-16">
        <SectionHead
          id="api-errors"
          eyebrow="Responses, errors & streaming"
          title={<>What comes back, and what to do when it doesn't.</>}
          sub={<>The success body is the OpenAI completion shape plus a <span className="font-mono text-[13px]">nadir</span> object
            describing the routing decision. Errors use standard HTTP status codes so your existing client-side
            handling already covers most of them.</>}
        />

        <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr] lg:gap-10">
          <div>
            <Eyebrow>Success response schema</Eyebrow>
            <div className="mt-4">
              <SpecTable
                rows={[
                  ["choices[].message.content", "the answer text"],
                  ["choices[].finish_reason", "stop | length | ..."],
                  ["model", "model that answered"],
                  ["usage", "prompt / completion tokens"],
                  ["nadir.routed_tier", "simple | mid | complex"],
                  ["nadir.verifier", "{ score, passed }"],
                  ["nadir.escalated", "true if stepped up"],
                ]}
              />
            </div>
            <Callout kind="note" title="The nadir metadata object">
              <span className="font-mono text-[11px]">routed_tier</span> tells you which rung answered,{" "}
              <span className="font-mono text-[11px]">verifier</span> carries the quality score and its pass/fail,
              and <span className="font-mono text-[11px]">escalated</span> is true when a cheap answer failed the
              bar and Nadir stepped up the ladder before returning.
            </Callout>
          </div>

          <div>
            <Eyebrow>HTTP error codes</Eyebrow>
            <div className="mt-4">
              <SpecTable rows={ERRORS} />
            </div>
            <Callout kind="warn" title="Circuit breaker & retries">
              On repeated upstream <span className="font-mono text-[11px]">5xx</span>, the breaker opens for that
              provider and Nadir fails over or sheds load rather than hammering it. On{" "}
              <span className="font-mono text-[11px]">429</span>, back off using the{" "}
              <span className="font-mono text-[11px]">Retry-After</span> header instead of retrying immediately.
            </Callout>
          </div>
        </div>

        <div className="mt-10">
          <Eyebrow>Streaming</Eyebrow>
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-[var(--ink)]/70">
            Set <span className="font-mono text-[12px]">"stream": true</span> to receive Server-Sent Events in the
            OpenAI delta format. Tokens arrive as <span className="font-mono text-[12px]">choices[].delta.content</span> chunks,
            terminated by a <span className="font-mono text-[12px]">[DONE]</span> sentinel. Routing still happens up
            front, so the chosen model is fixed before the first chunk streams.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CodeBlock
              lang="bash"
              filename="stream.sh"
              caption="SSE: stream the deltas →"
              code={`curl -N https://api.getnadir.com/v1/chat/completions \\
  -H "X-API-Key: \${NADIR_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "stream": true,
    "messages": [{ "role": "user", "content": "Write a haiku." }]
  }'

# data: {"choices":[{"delta":{"content":"Quiet"}}]}
# data: {"choices":[{"delta":{"content":" router"}}]}
# data: [DONE]`}
            />
            <CodeBlock
              lang="python"
              filename="stream.py"
              caption="same flag, openai SDK"
              code={`stream = client.chat.completions.create(
    model="auto",
    stream=True,
    messages=[{"role": "user", "content": "Write a haiku."}],
)

for chunk in stream:
    delta = chunk.choices[0].delta
    if delta.content:
        print(delta.content, end="", flush=True)`}
            />
          </div>
        </div>
      </div>
    </Plate>
  );
}

/* ── Section: Integration ────────────────────────────────────────────── */

const SOURCES = [
  { t: "Hosted provider keys", tags: ["OpenAI", "Anthropic", "Google"], b: "Drop in your OpenAI, Anthropic, and Google keys. Nadir calls each provider through LiteLLM and routes across the ladder you map onto them." },
  { t: "Bedrock in your AWS account", tags: ["AWS", "Bedrock"], b: "Point Nadir at models in your own Bedrock account. The calls stay inside your AWS boundary and your existing IAM and billing keep owning them." },
  { t: "Self-hosted / OSS weights", tags: ["vLLM", "TGI", "Ollama"], b: "Serve open weights behind an OpenAI-compatible endpoint with vLLM, TGI, or Ollama and register them as tiers. The routing intelligence is identical whether a model is hosted or local." },
];

const RESIDENCY = [
  { t: "Prompts stay in your VPC", tags: ["No egress"], b: "The routing engine runs inside your perimeter against your own keys and weights. Raw prompts and responses are never sent to Nadir, there is no managed routing service in the path." },
  { t: "Hash at rest", tags: ["store_prompts=false"], b: "With prompt storage off, the backend writes sha256:<hex> into usage_logs.prompt instead of the text and drops the response body at the log site, stamping metadata.prompt_hashed=true." },
  { t: "Bring your own database", tags: ["Postgres"], b: "Logs, savings rows, and settings land in a Supabase project or a Postgres instance you run. The data layer is yours, so retention and access are governed by your own policies." },
  { t: "No calls home", tags: ["Self-contained"], b: "No telemetry, no license check, no phone-home at request time. The container needs your provider endpoints and your database, nothing else." },
];

function Integration() {
  return (
    <Plate n="05" label="Integration" id="integration">
      <SectionHead
        title={<>Your model. Your infra. Your gateway.</>}
        sub={<>Nadir runs as one container inside your perimeter, routes across the models you already pay for
          or host yourself, and slots in beside the LLM gateway your team built. Nothing has to leave your
          network. No call goes home.</>}
      />

      {/* Deploy in your VPC */}
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <span id="int-deploy" className="block scroll-mt-24" aria-hidden /><Eyebrow>Deploy in your VPC</Eyebrow>
          <h3 className="mt-3 font-editorial text-[clamp(20px,2.4vw,28px)] font-semibold leading-tight text-[var(--ink)]">
            One container, inside your boundary.
          </h3>
          <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-[var(--ink)]/70">
            A multi-stage Docker build compiles the React frontend with Node 20, then drops it into a Python 3.12
            backend image. Gunicorn supervises four Uvicorn workers serving both the API and the static assets on
            port 8000. Run it with docker-compose, push it to AWS App Runner or ECS, or drop the same image into
            your own Kubernetes.
          </p>

          <div className="mt-7 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <Step n="1" title="Pull the image">
              One artifact. Frontend build and Python backend ship together, no separate web tier to stand up.
            </Step>
            <Step n="2" title="Set the env">
              Provider keys, your data layer, and the analyzer type. Stripe is only needed for hosted billing, omit it when you self-host.
            </Step>
            <Step n="3" title="Point at your data layer">
              Use a Supabase project, or run Postgres yourself and supply the connection details. The data never leaves your account.
            </Step>
            <Step n="4" title="Route traffic to it">
              Send OpenAI-compatible calls to port 8000 with model auto, or register it as a model in the gateway you already operate.
            </Step>
          </div>

          <div className="mt-8">
            <Eyebrow>Deploy targets</Eyebrow>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>docker-compose</Pill>
              <Pill>AWS App Runner</Pill>
              <Pill>AWS ECS</Pill>
              <Pill>Kubernetes</Pill>
              <Pill accent>your VPC</Pill>
            </div>
          </div>
        </div>

        <div className="relative self-start">
          <Agave className="pointer-events-none absolute -right-1 -top-9 hidden h-20 w-14 opacity-80 lg:block" />
          <CodeBlock
            lang="yaml"
            filename="docker-compose.yml"
            caption="one service, your keys never leave this file →"
            code={`services:
  nadir:
    image: nadir/router:latest
    ports: ["8000:8000"]               # Gunicorn + 4 Uvicorn workers
    restart: unless-stopped
    environment:
      # provider keys (use whichever you route across)
      ANTHROPIC_API_KEY: \${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: \${OPENAI_API_KEY}
      GOOGLE_API_KEY: \${GOOGLE_API_KEY}
      # data layer (Supabase project, or run Postgres yourself)
      SUPABASE_URL: \${SUPABASE_URL}
      SUPABASE_SERVICE_KEY: \${SUPABASE_SERVICE_KEY}
      SUPABASE_ANON_KEY: \${SUPABASE_ANON_KEY}
      # the shipped analyzer
      COMPLEXITY_ANALYZER_TYPE: trained
      # self-host can omit all STRIPE_* (hosted billing only)
      # prompt privacy is set per profile, not by env:
      # model_parameters.privacy.store_prompts=false hashes at rest`}
          />
          <Annotation className="mt-3 block pl-1 -rotate-1 text-[var(--ink)]/60">same image, App Runner / ECS / k8s ↗</Annotation>
        </div>
      </div>

      <div className="mt-12">
        <Eyebrow>Required environment</Eyebrow>
        <div className="mt-4 grid grid-cols-1 gap-x-12 gap-y-2 lg:grid-cols-2">
          <SpecTable
            rows={[
              ["SUPABASE_URL", "your project URL"],
              ["SUPABASE_SERVICE_KEY", "server-side key"],
              ["SUPABASE_ANON_KEY", "public key"],
              ["data layer", "or run Postgres yourself"],
            ]}
          />
          <SpecTable
            rows={[
              ["OPENAI_API_KEY", "if routing OpenAI"],
              ["ANTHROPIC_API_KEY", "if routing Claude"],
              ["GOOGLE_API_KEY", "if routing Gemini"],
              ["COMPLEXITY_ANALYZER_TYPE", "trained"],
            ]}
          />
        </div>
      </div>

      <Callout kind="note" title="No managed control plane">
        Nadir does not phone home to run. Self-hosting needs no Stripe keys, those gate hosted billing only.
        Bring your own provider keys and your own data layer and the whole routing engine runs inside your account.
      </Callout>

      {/* Bring your own models */}
      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <SectionHead
          id="int-models"
          eyebrow="Bring your own models"
          title={<>Route across whatever you give it.</>}
          sub={<>Nadir does not care where a model lives. Hand it hosted provider keys, Bedrock in your own
            account, or open weights behind an OpenAI-compatible endpoint, and it routes across all of them the
            same way. The capability ladder is configurable to your model lineup, so the tiers are yours to define.</>}
        />
        <div className="self-center">
          <Sheet tone="glacier">
            <Eyebrow>Capability ladder</Eyebrow>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink)]/65">
              Map each tier to a model you run. Simple prompts try the small one first, and only the prompts that
              need it climb to your frontier model.
            </p>
            <SpecTable
              className="mt-4"
              rows={[
                ["simple", "your small model"],
                ["mid", "your mid model"],
                ["complex", "your frontier model"],
                ["example", "haiku-4.5 · sonnet-4.6 · opus-4.6"],
              ]}
            />
            <Annotation className="mt-4 block -rotate-1 text-[var(--ink)]/60">your lineup, your tiers ↗</Annotation>
          </Sheet>
        </div>
      </div>

      <div className="mt-10">
        <Eyebrow>Where models can live</Eyebrow>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SOURCES.map((s) => <FeatureCard key={s.t} title={s.t} tags={s.tags} body={s.b} />)}
        </div>
      </div>

      {/* Connect to your existing gateway — the two topology diagrams */}
      <div className="mt-16">
        <SectionHead
          id="int-gateway"
          eyebrow="Connect to your existing gateway"
          title={<>Drop in beside the gateway you already built.</>}
          sub={<>Your dev team already runs a gateway, LiteLLM, Portkey, or something internal that owns keys,
            quotas, logging, and fallbacks. Nadir composes with it, it does not replace it. Pick the topology that
            fits your control plane.</>}
        />

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Topology A · Nadir behind your gateway */}
          <Sheet tone="glacier">
            <div className="flex items-center justify-between">
              <span className="eyebrow text-[var(--ink)]/60">Topology A · Behind your gateway</span>
              <Pill accent>recommended</Pill>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink)]/70">
              Register Nadir as one more model entry in the gateway you already run. Calls to{" "}
              <span className="font-mono text-[11px]">model: auto</span> get routed across the ladder, everything
              else flows exactly as before. Your gateway keeps owning keys, quotas, logging, and fallbacks. This
              is the smallest change to an existing setup.
            </p>
            <Topology
              nodes={[
                { box: { label: "your app", sub: "sdk" } },
                { hop: {} },
                { box: { label: "your gateway", sub: "litellm" } },
                { hop: { label: "auto" } },
                { box: { label: "Nadir", sub: "routes", accent: true } },
                { hop: {} },
                { box: { label: "providers" } },
              ]}
            />
            <Annotation className="mt-4 block -rotate-1 text-[var(--ink)]/60">one more model in the list ↗</Annotation>
          </Sheet>

          {/* Topology B · Nadir in front (standalone) */}
          <Sheet tone="strawberry">
            <div className="flex items-center justify-between">
              <span className="eyebrow text-[var(--ink)]/60">Topology B · Nadir in front</span>
              <Pill>standalone</Pill>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink)]/70">
              No gateway yet? Nadir is the entrypoint. Point your app at it with{" "}
              <span className="font-mono text-[11px]">model: auto</span>, and it classifies, routes, verifies, and
              calls the providers directly through LiteLLM with your keys.
            </p>
            <Topology
              nodes={[
                { box: { label: "your app", sub: "sdk" } },
                { hop: { label: "auto" } },
                { box: { label: "Nadir", sub: "routes + verifies", accent: true } },
                { hop: {} },
                { box: { label: "providers" } },
              ]}
            />
            <Annotation className="mt-4 block -rotate-1 text-[var(--ink)]/60">Nadir owns the call ↗</Annotation>
          </Sheet>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CodeBlock
            lang="yaml"
            filename="config.yaml · topology A"
            caption="add auto to your gateway's model_list →"
            code={`# LiteLLM-style gateway config. Add one model entry
# that points at the Nadir base URL; leave the rest as-is.
model_list:
  - model_name: auto
    litellm_params:
      model: openai/auto          # OpenAI-compatible
      api_base: http://nadir.internal:8000/v1
      api_key: os.environ/NADIR_API_KEY

  # ... your existing models stay exactly as they were
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY`}
          />
          <CodeBlock
            lang="python"
            filename="app.py · topology B"
            caption="point your app straight at Nadir →"
            code={`from openai import OpenAI

# No separate gateway. Your app talks to Nadir directly,
# same OpenAI wire format, one base_url change.
client = OpenAI(
    base_url="http://nadir.internal:8000/v1",
    api_key=NADIR_API_KEY,
)

resp = client.chat.completions.create(
    model="auto",                 # Nadir classifies + routes
    messages=[{"role": "user", "content": prompt}],
)
print(resp.model)                 # which model actually answered`}
          />
        </div>

        <Callout kind="note" title="OpenAI wire format on both sides">
          Nadir speaks the OpenAI chat-completions format as both a server and a client, and so does your gateway.
          Whichever topology you pick, no application code is rewritten, the only change is a base URL or a single
          new model entry.
        </Callout>
      </div>

      {/* Data residency & privacy */}
      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <SectionHead
          id="int-privacy"
          eyebrow="Data residency & privacy"
          title={<>What leaves your network: nothing you don't choose.</>}
          sub={<>The privacy contract is a code path, not a promise. When prompt storage is disabled the backend
            hashes the prompt and drops the response before it is ever written, so even your own log table holds
            no raw text.</>}
        />
        <div className="self-center">
          <DataTicks className="h-16 w-full opacity-60" color="var(--ink)" />
          <Annotation className="mt-2 block text-right rotate-1 text-[var(--ink)]/55">hashed in, never out ↘</Annotation>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {RESIDENCY.map((r) => <FeatureCard key={r.t} title={r.t} tags={r.tags} body={r.b} />)}
      </div>

      {/* CTA */}
      <div className="relative mt-12 overflow-hidden">
        <div className="relative flex flex-col items-start gap-4 bg-[var(--paper)] p-6 sm:flex-row sm:items-center sm:justify-between">
          <SketchBox color="var(--ink)" />
          <ContourLines className="pointer-events-none absolute -right-2 -top-6 hidden h-16 w-20 opacity-60 lg:block" color="var(--ink)" />
          <div className="relative max-w-xl">
            <h3 className="font-editorial text-[clamp(20px,2.4vw,28px)] font-semibold leading-tight text-[var(--ink)]">
              Shadow-deploy against a slice of your traffic.
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink)]/70">
              We will help you stand it up inside your own environment, mirror a slice of real prompts through it,
              and show you the routed-vs-baseline cost on your data before anything touches production. For the
              full product story, read the <Link to="/pitch" className="ed-link text-[var(--strawberry)] no-underline">pitch deck</Link>.
            </p>
          </div>
          <a href="/contact?reason=partner" className="relative inline-flex shrink-0 items-center gap-2 rounded-[2px] bg-[var(--strawberry)] px-6 py-3 font-mono text-[12px] font-semibold uppercase tracking-wider text-[var(--ink)] no-underline">
            Talk to us <Sparkle className="h-3 w-3" color="var(--ink)" />
          </a>
        </div>
      </div>
    </Plate>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function Tech() {
  return (
    <TechShell
      title="Nadir · Technical guide"
      description="Everything an engineer needs on one page: what Nadir is, the request architecture and ML stack, how the router scores, verifies, and escalates, the OpenAI-compatible API, and how to deploy it inside your own VPC beside the gateway you already run."
      path="/tech"
      track="tech_guide"
    >
      <Hero />
      <div className="mx-auto max-w-[1280px] px-6 lg:px-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
          <SideNav items={SECTIONS} />
          <div>
            <Overview />
            <Architecture />
            <Routing />
            <Api />
            <Integration />
          </div>
        </div>
      </div>
    </TechShell>
  );
}
