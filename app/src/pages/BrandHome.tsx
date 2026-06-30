/**
 * Nadir — Blueprint / specimen homepage (brand redesign).
 *
 * A hand-drawn architectural-sketch surface: pencil construction lines,
 * strawberry-pink accents, rectangular frames, wavy hand underlines, and the
 * signature three-panel specimen — 01 Prompt Specimen → 02 Routing Path →
 * 03 Verification Receipt. Mediterranean architecture illustration anchors the
 * hero. Lives at /redesign; production `/` is untouched. The editorial collage
 * variant is preserved at /redesign-editorial.
 *
 * Numbers match the design reference verbatim (user directive "keep website
 * numbers"): 68% / 97.6% / 620ms, the routing-path price ladder, win rates,
 * and the median-cost-savings chart. Reconcile against real evals before any
 * promotion to the live homepage.
 */
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { SEO } from "@/components/SEO";
import { trackPageView } from "@/utils/analytics";
import {
  Sparkle, Sailboat, Scribble, CrossMarks, SketchStairs,
  VerifierSeal, DottedGrid, Agave, Birds, ContourLines,
  WaveContours, FloraSprig, SeedCluster, DocCheck,
  SketchBox, SketchRule, ConstructionField, SweepLines,
  CompassBurst, OrbitTrails, SignalDots, SunDisc, CoralBranch,
  RoutePath, InkSweep, Shell,
} from "@/components/brand/motifs";
import { HeroRampArt, SelfHostArt } from "@/components/brand/illustrations";
import { RedesignLayout } from "@/components/brand/redesign";

/* ── Specimen panels ─────────────────────────────────────────────────── */

function PanelLabel({ n, title }: { n: string; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="font-mono text-[11px] font-semibold text-[var(--strawberry)]">{n}</span>
      <span className="eyebrow text-[var(--ink)]/55">{title}</span>
    </div>
  );
}

function PromptSpecimen() {
  return (
    <div>
      <PanelLabel n="01." title="Prompt Specimen" />
      <div className="relative bg-[var(--glacier)]/25 p-4">
        <SketchBox color="var(--ink)" />
        <span className="absolute right-3 top-2 font-editorial text-[28px] text-[var(--strawberry)]/70">N</span>
        <div className="eyebrow text-[var(--ink)]/45">User prompt</div>
        <p className="mt-2 max-w-[15rem] font-hand text-[20px] leading-snug text-[var(--ink)]">
          Draft a short email to confirm a summer offsite with the team.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-[var(--ink)]/15 pt-2 font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink)]/55">
          <span>Context: 0 tokens</span>
          <span>Tone: friendly</span>
          <span>Length: short</span>
        </div>
      </div>
    </div>
  );
}

const ROUTE_LADDER = [
  { model: "Haiku 4.5", price: "$0.0006", picked: true },
  { model: "Sonnet 4.6", price: "$0.0019" },
  { model: "Opus 4.6", price: "$0.0096" },
  { model: "+ GPT-5, Gemini", price: "BYOK" },
];

function RoutingPath() {
  return (
    <div>
      <PanelLabel n="02." title="Routing Path" />
      <div className="relative bg-[var(--paper)]/60 p-4">
        <SketchBox color="var(--ink)" />
        <ul className="relative space-y-2.5">
          {ROUTE_LADDER.map((r) => (
            <li key={r.model} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${r.picked ? "border-[var(--strawberry)] bg-[var(--strawberry)] pulse-ring" : "border-[var(--ink)]/40 bg-transparent"}`} />
              <span className={`font-mono text-[12px] ${r.picked ? "font-semibold text-[var(--strawberry)]" : "text-[var(--ink)]/75"}`}>{r.model}</span>
              <span className="mx-1 flex-1 translate-y-[-2px] border-b border-dotted border-[var(--ink)]/25" />
              <span className={`font-mono text-[12px] tabular-nums ${r.picked ? "font-semibold text-[var(--strawberry)]" : "text-[var(--ink)]/60"}`}>{r.price}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-1.5 border-t border-dashed border-[var(--ink)]/15 pt-2.5">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--ink)] text-[9px] text-[var(--shell)]">✓</span>
          <span className="eyebrow text-[var(--ink)]/70">Verified</span>
        </div>
      </div>
    </div>
  );
}

const RECEIPT_ROWS: [string, string][] = [
  ["Model used", "Haiku 4.5"],
  ["Verifier", "accept · 0.91"],
  ["Cost", "$0.0006"],
  ["Latency", "290 ms"],
  ["Escalated", "No"],
];

function VerificationReceipt() {
  return (
    <div>
      <PanelLabel n="03." title="Verification Receipt" />
      <div className="relative">
        {/* soft pink watercolour wash peeking behind the receipt */}
        <span className="pointer-events-none absolute -right-2.5 left-8 top-4 bottom-1 rotate-[1.4deg] bg-[var(--strawberry)]/[0.18] torn-b" aria-hidden />
        <div className="relative torn-b bg-[var(--paper)] px-4 pb-6 pt-4">
        <SketchBox color="var(--ink)" />
        <div className="relative flex justify-center">
          <VerifierSeal className="h-16 w-16" color="var(--ink)" label="LOWEST VIABLE MODEL · VERIFIED · " />
        </div>
        <dl className="mt-3 space-y-1.5">
          {RECEIPT_ROWS.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink)]/50">{k}</dt>
              <dd className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex items-center gap-1.5 border-t border-dashed border-[var(--ink)]/15 pt-2.5">
          <span className="font-mono text-[12px] font-semibold text-[var(--strawberry)]">Verified ✓</span>
        </div>
        <p className="mt-2 font-mono text-[9px] leading-snug text-[var(--ink)]/45">accept · 0.91 = the verifier's confidence the cheap answer holds. Below the bar, Nadir re-routes up.</p>
        </div>
      </div>
    </div>
  );
}

function SpecimenBoard() {
  return (
    <div className="relative">
      {/* architecture watercolour backdrop, behind the lower-centre of the row */}
      <HeroRampArt
        className="pointer-events-none absolute left-[24%] top-[150px] hidden h-[270px] w-[400px] opacity-90 lg:block"
        style={{
          WebkitMaskImage: "radial-gradient(125% 105% at 52% 62%, #000 52%, transparent 100%)",
          maskImage: "radial-gradient(125% 105% at 52% 62%, #000 52%, transparent 100%)",
        }}
      />
      {/* dashed route connectors threading 01 → 02 (GPT-4o mini) → 03, flowing */}
      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" viewBox="0 0 100 64" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path className="flow-dash" d="M31 30 C 33.5 30, 33.5 40, 36 40" stroke="var(--ink)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" opacity="0.5" />
        <path className="flow-dash" d="M64 40 C 66.5 40, 66.5 33, 69 33" stroke="var(--strawberry)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />
      </svg>
      {/* three specimen panels in a staggered row, rising in */}
      <div className="relative grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-4">
        <div className="rise lg:pt-10" style={{ ["--d" as string]: "260ms" }}><PromptSpecimen /></div>
        <div className="rise lg:pt-0" style={{ ["--d" as string]: "380ms" }}><RoutingPath /></div>
        <div className="rise lg:pt-6" style={{ ["--d" as string]: "500ms" }}><VerificationReceipt /></div>
      </div>
      {/* annotations */}
      <span className="absolute left-[34%] top-[6px] hidden font-hand text-[16px] text-[var(--strawberry)] -rotate-3 lg:block">route lower ↓</span>
      <span className="absolute left-[30%] bottom-[18%] hidden font-hand text-[15px] text-[var(--ink)]/65 lg:block">escalate only if needed</span>
      <span className="absolute right-2 -bottom-1 hidden font-hand text-[15px] text-[var(--ink)]/65 rotate-2 lg:block">show the receipt ↑</span>
    </div>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* sketch field — pencil construction lines, crosshatch, asterisks */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <SweepLines className="absolute inset-0 hidden h-full w-full lg:block" />
        <Sailboat className="drift absolute left-6 top-12 hidden h-16 w-20 opacity-70 sm:block" color="var(--ink)" />
        <ContourLines className="absolute -left-8 top-[30%] h-44 w-48 opacity-40 pencil" color="currentColor" />
        <ConstructionField variant={0} className="absolute -left-2 top-1/2 hidden h-40 w-28 opacity-80 lg:block" />
        <ConstructionField variant={1} className="absolute right-0 top-1/3 hidden h-44 w-28 opacity-70 lg:block" />
        <ConstructionField variant={2} className="absolute right-[8%] bottom-[2%] hidden h-28 w-24 opacity-55 lg:block" />
        <Scribble className="drift absolute left-[30%] top-4 hidden h-8 w-28 opacity-60 sm:block" style={{ ["--d" as string]: "1200ms" }} />
        <CrossMarks className="absolute right-[6%] bottom-12 h-12 w-28 opacity-60" />
        <CrossMarks className="absolute left-[2%] top-[14%] hidden h-9 w-16 opacity-50 lg:block" color="var(--pencil)" />
        <Sparkle className="twinkle absolute left-[44%] top-16 hidden h-4 w-4 opacity-80 sm:block" color="var(--strawberry)" />
        <Sparkle className="twinkle absolute right-[13%] top-24 h-5 w-5 opacity-70" color="var(--strawberry)" style={{ ["--d" as string]: "700ms" }} />
        <Sparkle className="twinkle absolute left-[8%] bottom-[26%] hidden h-4 w-4 opacity-70 lg:block" color="var(--strawberry)" style={{ ["--d" as string]: "1400ms" }} />
        <Sparkle className="twinkle absolute right-[30%] top-[40%] hidden h-3.5 w-3.5 opacity-60 lg:block" color="var(--strawberry)" style={{ ["--d" as string]: "2100ms" }} />
        <Birds className="drift absolute right-[24%] top-8 h-6 w-20 opacity-40 pencil" color="currentColor" style={{ ["--d" as string]: "600ms" }} />
        <WaveContours className="absolute bottom-2 left-[8%] h-10 w-40 opacity-30 pencil" color="currentColor" />
        <CrossMarks className="absolute left-[37%] top-[46%] hidden h-10 w-20 opacity-55 lg:block" color="var(--pencil)" />
        <Scribble className="absolute right-[2%] top-[54%] hidden h-7 w-24 opacity-55 lg:block" color="var(--pencil)" />
        <Sparkle className="twinkle absolute left-[35%] bottom-[12%] hidden h-3.5 w-3.5 opacity-60 lg:block" color="var(--sky)" style={{ ["--d" as string]: "1000ms" }} />
        <ContourLines className="absolute right-[1%] top-2 hidden h-28 w-32 opacity-30 pencil lg:block" color="currentColor" />

        {/* right-side abstract cluster — fills the open space, lots of motion */}
        <SunDisc className="float-slower absolute right-[21%] top-[6%] hidden h-24 w-24 opacity-[0.22] lg:block" color="var(--coral)" />
        <OrbitTrails className="float-slow absolute right-[6%] top-[14%] hidden h-28 w-44 opacity-70 lg:block" color="var(--ink)" style={{ ["--rot" as string]: "-7deg" }} />
        <CoralBranch className="absolute right-[1%] top-[22%] hidden h-24 w-16 opacity-65 lg:block" color="var(--terracotta)" />
        <VerifierSeal className="seal-spin absolute right-[28%] top-[19%] hidden h-14 w-14 opacity-45 lg:block" color="var(--ink)" />
        <Shell className="absolute right-[33%] top-[35%] hidden h-12 w-12 opacity-45 lg:block" color="var(--strawberry)" />
        <CompassBurst className="float-slow absolute right-[3%] top-[40%] hidden h-16 w-16 opacity-65 lg:block" color="var(--terracotta)" style={{ ["--rot" as string]: "5deg" }} />
        <SignalDots className="absolute right-[23%] top-[47%] hidden h-16 w-24 opacity-70 lg:block" />
        <RoutePath animate className="absolute right-[4%] top-[57%] hidden h-24 w-52 opacity-75 lg:block" color="var(--strawberry)" />
        <DottedGrid className="absolute right-[15%] top-[61%] hidden h-14 w-20 opacity-55 lg:block" color="var(--ink)" />
        <SeedCluster className="drift absolute right-[31%] top-[63%] hidden h-12 w-16 opacity-50 lg:block" color="var(--ink)" style={{ ["--d" as string]: "900ms" }} />
        <FloraSprig className="absolute right-[9%] bottom-[12%] hidden h-24 w-12 opacity-60 lg:block" />
        <InkSweep className="absolute right-[6%] top-[75%] hidden h-5 w-32 opacity-50 lg:block" color="var(--ink)" />
        <Sparkle className="twinkle absolute right-[18%] top-[31%] hidden h-4 w-4 opacity-70 lg:block" color="var(--strawberry)" style={{ ["--d" as string]: "1600ms" }} />
        <Sparkle className="twinkle absolute right-[4%] bottom-[22%] hidden h-3.5 w-3.5 opacity-60 lg:block" color="var(--sky)" style={{ ["--d" as string]: "500ms" }} />
        <CrossMarks className="absolute right-[20%] bottom-[7%] hidden h-9 w-16 opacity-45 lg:block" color="var(--pencil)" />
        {/* extra left + lower marks */}
        <SignalDots className="absolute left-[1%] bottom-[7%] hidden h-12 w-20 opacity-45 lg:block" />
        <Sparkle className="twinkle absolute left-[27%] bottom-[3%] hidden h-3.5 w-3.5 opacity-55 lg:block" color="var(--strawberry)" style={{ ["--d" as string]: "1900ms" }} />
      </div>

      {/* hand annotations scattered around the hero */}
      <div className="pointer-events-none absolute inset-0 z-[1] hidden lg:block" aria-hidden>
        <span className="absolute right-[11%] top-[35%] font-hand text-[18px] text-[var(--strawberry)] -rotate-3">route, don't guess</span>
        <span className="absolute right-[1%] top-[51%] font-hand text-[16px] text-[var(--ink)]/65 rotate-2">fits the task ↘</span>
        <span className="absolute right-[19%] top-[70%] font-hand text-[16px] text-[var(--ink)]/65 -rotate-2">verified, not assumed</span>
        <span className="absolute left-[0.5%] top-[62%] font-hand text-[15px] text-[var(--ink)]/55 -rotate-6">spend less →</span>
      </div>

      {/* ── Message block — dominant, owns the top of the page ── */}
      <div className="relative mx-auto max-w-[1180px] px-6 pb-14 pt-16 lg:px-10 lg:pb-16 lg:pt-24">
        <div className="max-w-3xl">
          <h1 className="rise font-editorial text-[clamp(46px,7.6vw,94px)] font-semibold leading-[0.95] text-[var(--ink)]" style={{ ["--d" as string]: "60ms" }}>
            Cut your AI costs,{" "}
            <span className="whitespace-nowrap">
              not your <span className="italic text-[var(--strawberry)]">accuracy</span>
              <Sparkle className="twinkle inline-block h-5 w-5 align-super" color="var(--strawberry)" />
              <span>.</span>
            </span>
          </h1>

          {/* the 5-second message: model-task fit + verification */}
          <p className="rise mt-6 max-w-2xl font-editorial text-[clamp(20px,2.4vw,30px)] leading-[1.18] text-[var(--ink)]" style={{ ["--d" as string]: "150ms" }}>
            Nadir fits every task to its leanest capable model, and verifies the answer before you ever see it.
          </p>
          <p className="rise mt-4 max-w-xl text-[15.5px] leading-relaxed text-[var(--ink)]/70" style={{ ["--d" as string]: "230ms" }}>
            Point your Claude, GPT, or Gemini calls at Nadir and change two lines. You keep your own keys, cut spend
            about 60%, and hold 98% of the quality you'd get from always running the top model.
          </p>

          {/* proof chips — quantified payoff, scannable at a glance */}
          <div className="rise mt-7 flex flex-wrap gap-2.5" style={{ ["--d" as string]: "320ms" }}>
            {["60% lower cost", "98% of top-model quality", "2-line drop-in", "independently ranked #4 of 21"].map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ink)]/15 bg-[var(--paper)] px-3 py-1.5 font-mono text-[11px] text-[var(--ink)]/75">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--strawberry)]" />{c}
              </span>
            ))}
          </div>

          <div className="rise mt-8 flex flex-wrap items-center gap-5" style={{ ["--d" as string]: "420ms" }}>
            <Link to="/auth" className="btn-rect press no-underline">Start routing</Link>
            <a href="#benchmarks" className="eyebrow text-[var(--ink)] no-underline ed-link">See benchmarks →</a>
            <span className="hidden font-hand text-[17px] text-[var(--strawberry)] -rotate-2 sm:inline">built for clarity at scale.</span>
          </div>
          <p className="rise mt-5 font-mono text-[11px] text-[var(--ink)]/55" style={{ ["--d" as string]: "520ms" }}>
            Illustrative: ~$5,000/mo of top-model spend → about $2,000 with Nadir.
          </p>
        </div>
      </div>

      {/* ── Specimen board — the supporting proof, below the message ── */}
      <div className="relative mx-auto max-w-[1280px] px-6 pb-24 lg:px-10">
        <span className="mb-7 block font-hand text-[18px] text-[var(--ink)]/55 -rotate-1">every prompt becomes a route, and every route gets a receipt ↓</span>
        <SpecimenBoard />
      </div>
    </section>
  );
}

/* ── Proof + How it works (combined band) ────────────────────────────── */

const PROOF = [
  { v: "60", unit: "%", k: "Lower cost", note: "vs always-Opus 4.6, at the default verifier threshold.", color: "var(--strawberry)" },
  { v: "98", unit: "%", k: "Quality retained", note: "of always-Opus quality; catastrophic routes 1.7%.", color: "var(--ink)" },
  { v: "0.961", unit: "", k: "Verifier AUROC", note: "held-out eval figure, not deployed accuracy. ECE 0.016, n = 11,420.", color: "var(--sky)" },
];

const FLOW = [
  { n: "01.", title: "Route", body: "We predict the minimal model likely to succeed and try it first.", note: "start low", motif: <FlowDots /> },
  { n: "02.", title: "Verify", body: "We check the answer against quality heuristics and signals.", note: "quality first", motif: <DocCheck className="h-12 w-14" color="var(--ink)" /> },
  { n: "03.", title: "Escalate", body: "If needed, we step up to the next best option automatically.", note: "only if needed", motif: <SketchStairs className="h-12 w-16" color="var(--ink)" /> },
];

function FlowDots() {
  return (
    <div className="flex items-center gap-2">
      <DottedGrid className="h-9 w-12" color="var(--ink)" />
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink)]/40" />
      <span className="h-2.5 w-2.5 rounded-full border border-[var(--ink)]/40" />
      <span className="h-2.5 w-2.5 rounded-full border border-[var(--ink)]/40" />
      <span className="pulse-ring h-3 w-3 rounded-full bg-[var(--strawberry)]" />
    </div>
  );
}

function ProofAndFlow() {
  return (
    <section id="how" className="relative overflow-hidden">
      <SketchRule className="absolute inset-x-0 top-0 h-2 w-full opacity-40" color="var(--ink)" />
      <SweepLines className="pointer-events-none absolute inset-0 hidden h-full w-full opacity-80 lg:block" />
      <ConstructionField variant={0} className="pointer-events-none absolute left-1 top-12 hidden h-32 w-24 opacity-70 lg:block" />
      <ConstructionField variant={2} className="pointer-events-none absolute right-2 bottom-10 hidden h-28 w-28 opacity-60 lg:block" />
      <CrossMarks className="pointer-events-none absolute right-[19%] top-6 hidden h-10 w-20 opacity-50 lg:block" color="var(--pencil)" />
      <Scribble className="pointer-events-none absolute left-[1%] bottom-7 hidden h-7 w-24 opacity-50 lg:block" color="var(--pencil)" />
      <Sparkle className="twinkle pointer-events-none absolute left-[47%] top-7 hidden h-4 w-4 opacity-55 lg:block" color="var(--strawberry)" />
      <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-6 py-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-0 lg:px-10">
        {/* proof */}
        <div className="lg:pr-12">
          <span className="eyebrow text-[var(--ink)]/55">Proof, not promises</span>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {PROOF.map((p) => (
              <div key={p.k}>
                <div className="font-editorial text-[clamp(30px,3.4vw,46px)] leading-none tabular-nums" style={{ color: p.color }}>
                  {p.v}<span className="text-[0.55em]">{p.unit}</span>
                </div>
                <div className="mt-2 eyebrow text-[var(--ink)]/70">{p.k}</div>
                <p className="mt-2 text-[11.5px] leading-snug text-[var(--ink)]/55">{p.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-md font-mono text-[10.5px] leading-relaxed text-[var(--ink)]/55">
            Measured on 11,420 RouterBench held-out triples. Independently #4 of 21 on RouterArena (arena_score 72.3).
          </p>
          <a href="#benchmarks" className="mt-5 inline-block eyebrow text-[var(--strawberry)] no-underline ed-link">View benchmarks →</a>
        </div>

        {/* flow */}
        <div className="lg:border-l lg:border-[var(--ink)]/15 lg:pl-12">
          <span className="eyebrow text-[var(--ink)]/55">How Nadir works</span>
          <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {FLOW.map((s) => (
              <div key={s.title} className="relative">
                <div className="flex items-baseline gap-2">
                  <span className="font-editorial text-[26px] text-[var(--strawberry)]">{s.n}</span>
                  <span className="eyebrow text-[var(--ink)]">{s.title}</span>
                </div>
                <p className="mt-2 text-[12.5px] leading-snug text-[var(--ink)]/65">{s.body}</p>
                <div className="mt-4 grid h-14 place-items-center">{s.motif}</div>
                <span className="mt-1 block font-hand text-[16px] text-[var(--strawberry)] -rotate-2">{s.note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Model cards ─────────────────────────────────────────────────────── */

const MODELS = [
  { name: "Haiku 4.5", provider: "Anthropic", tags: ["Fast", "Simple tier"], body: "Fast triage, classification, and short-form writing. Most confident routes ship straight from here.", cost: 1, dollars: "$", bar: "var(--strawberry)" },
  { name: "Sonnet 4.6", provider: "Anthropic", tags: ["Balanced", "Escalation"], body: "The mid-tier workhorse, and where the cascade steps up when the verifier rejects a cheap answer.", cost: 2, dollars: "$$", bar: "var(--seaglass)" },
  { name: "Opus 4.6", provider: "Anthropic", tags: ["Most capable", "Benchmark"], body: "Deepest reasoning for the hardest problems, and the always-Opus baseline we measure every saving against.", cost: 4, dollars: "$$$$", bar: "var(--ink)" },
  { name: "GPT-5", provider: "OpenAI", tags: ["Versatile", "BYOK"], body: "Route across providers, not just Anthropic. Bring your own OpenAI key, Nadir picks the tier.", cost: 3, dollars: "$$$", bar: "var(--sky)" },
  { name: "Gemini 2.5 Pro", provider: "Google", tags: ["Long context", "BYOK"], body: "Million-token context for retrieval-heavy and document-scale work, scored by the same verifier.", cost: 3, dollars: "$$$", bar: "var(--sage)" },
];

function ModelCards() {
  return (
    <section id="models" className="relative overflow-hidden">
      <SketchRule className="absolute inset-x-0 top-0 h-2 w-full opacity-40" color="var(--ink)" />
      <ConstructionField variant={1} className="pointer-events-none absolute left-2 bottom-6 hidden h-24 w-24 opacity-60 lg:block" />
      <ConstructionField variant={0} className="pointer-events-none absolute right-1 top-10 hidden h-24 w-24 opacity-50 lg:block" />
      <ContourLines className="pointer-events-none absolute -left-6 top-[34%] hidden h-44 w-40 opacity-40 pencil lg:block" color="currentColor" />
      <Sparkle className="twinkle pointer-events-none absolute right-[28%] top-7 hidden h-4 w-4 opacity-55 lg:block" color="var(--strawberry)" />
      <div className="relative mx-auto max-w-[1280px] px-6 py-16 lg:px-10">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-[var(--ink)]/55">The right model for the job</span>
          <span className="hidden font-hand text-[17px] text-[var(--ink)]/70 -rotate-2 lg:inline">pick the right fit automatically ↘</span>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {MODELS.map((m) => (
            <article key={m.name} className="lift relative flex flex-col bg-[var(--shell)]/40 p-4">
              <SketchBox color="var(--ink)" />
              <div className="relative flex items-start gap-1.5">
                <Sparkle className="mt-0.5 h-3 w-3 shrink-0" color="var(--strawberry)" />
                <h3 className="font-editorial text-[18px] leading-tight text-[var(--ink)]">{m.name}</h3>
                <span className="ml-auto mt-1 shrink-0 font-mono text-[8px] uppercase tracking-wider text-[var(--ink)]/45">{m.provider}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.tags.map((t) => (
                  <span key={t} className="rounded-[2px] border border-[var(--ink)]/20 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-[var(--ink)]/65">{t}</span>
                ))}
              </div>
              <p className="mt-3 min-h-[56px] text-[11.5px] leading-snug text-[var(--ink)]/60">{m.body}</p>
              <div className="mt-auto border-t border-dashed border-[var(--ink)]/15 pt-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[var(--ink)]/45">Relative cost</span>
                  <span className="font-mono text-[11px] font-semibold tracking-tight text-[var(--ink)]/70">{m.dollars}</span>
                  <span className="relative h-1.5 flex-1 rounded-full bg-[var(--ink)]/10">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${m.cost * 22 + 12}%`, background: m.bar }} />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Two-color band (self-hosted + benchmarked) ──────────────────────── */

const CHART = [
  { label: "Always-Opus 4.6", v: 100, strong: false },
  { label: "Nadir, routed", v: 40, strong: true },
];

function SplitBand() {
  return (
    <section id="benchmarks" className="relative">
      <SketchRule className="absolute inset-x-0 top-0 h-2 w-full opacity-40" color="var(--ink)" />
      <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-px bg-[var(--ink)]/12 lg:grid-cols-2">
        {/* self-hosted */}
        <div id="self-hosted" className="relative overflow-hidden bg-[var(--mint)]/[0.55] px-8 py-12 lg:px-12">
          <ConstructionField variant={1} className="pointer-events-none absolute right-[2%] top-[8%] hidden h-28 w-28 opacity-40 lg:block" color="var(--ink)" />
          <Sparkle className="twinkle pointer-events-none absolute right-[10%] top-[12%] hidden h-4 w-4 opacity-50 lg:block" color="var(--ink)" />
          <span className="eyebrow text-[var(--ink)]/55">Self-hosted →</span>
          <h2 className="mt-4 max-w-sm font-editorial text-[clamp(26px,3vw,38px)] leading-tight text-[var(--ink)]">
            Your data. Your rules. Same routing intelligence.
          </h2>
          <Link to="/self-host" className="mt-6 inline-block eyebrow text-[var(--ink)] no-underline ed-link">Deploy Nadir →</Link>
          <span className="mt-8 block font-hand text-[17px] text-[var(--ink)]/65 -rotate-2">↙ bring it home</span>
          <SelfHostArt className="pointer-events-none absolute -bottom-3 right-2 hidden h-[210px] w-[320px] opacity-95 sm:block" />
          <Agave className="pointer-events-none absolute bottom-1 right-[3%] h-20 w-14 opacity-90 sm:hidden" />
        </div>

        {/* benchmarked */}
        <div className="relative overflow-hidden bg-[var(--strawberry)]/[0.22] px-8 py-12 lg:px-12">
          <ConstructionField variant={2} className="pointer-events-none absolute right-[1%] bottom-[6%] hidden h-28 w-28 opacity-40 lg:block" color="var(--ink)" />
          <Sparkle className="twinkle pointer-events-none absolute left-[2%] top-[12%] hidden h-4 w-4 opacity-45 lg:block" color="var(--ink)" />
          <span className="eyebrow text-[var(--ink)]/55">Benchmarked in the wild</span>
          <h2 className="mt-4 max-w-sm font-editorial text-[clamp(26px,3vw,38px)] leading-tight text-[var(--ink)]">
            Benchmarked across real-world workloads.
          </h2>
          <Link to="/compare" className="mt-5 inline-block eyebrow text-[var(--strawberry)] no-underline ed-link">See the results →</Link>

          <div className="mt-7 max-w-md">
            <div className="eyebrow mb-3 text-[var(--ink)]/45">Relative cost per request</div>
            <div className="space-y-2.5">
              {CHART.map((c) => (
                <div key={c.label} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 font-mono text-[10px] text-[var(--ink)]/65">{c.label}</span>
                  <span className="relative h-3 flex-1 rounded-[2px] bg-[var(--ink)]/8">
                    {c.v > 0
                      ? <span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${c.v}%`, background: c.strong ? "var(--strawberry)" : "rgba(21,35,59,0.32)" }} />
                      : null}
                  </span>
                  <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink)]/70">{c.v > 0 ? `${c.v}%` : "—"}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 font-mono text-[10.5px] leading-relaxed text-[var(--ink)]/55">
              60% lower fleet cost for 98% of always-Opus quality. Per-request dollars shown are an example draft-email call.
            </p>
            <span className="mt-3 block text-right font-hand text-[16px] text-[var(--ink)]/60 rotate-2">real results from real workloads →</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function BrandHome() {
  return (
    <RedesignLayout
      title="Nadir · Cut your AI costs, not your accuracy."
      description="Nadir fits every task to its leanest capable model and verifies the answer before you see it. Drop-in for Claude, GPT, and Gemini: change two lines, keep your keys, cut spend about 60% while holding 98% of always-Opus quality."
      path="/"
      track="brand_redesign"
    >
      <Hero />
      <ProofAndFlow />
      <ModelCards />
      <SplitBand />
    </RedesignLayout>
  );
}
