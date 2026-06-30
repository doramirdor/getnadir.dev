/**
 * Nadir — Engineering pitch DECK (/pitch).
 *
 * A full-screen slide presentation (not a scrolling page): one slide per
 * viewport, advanced with the arrow keys / space / on-screen controls, with a
 * slide counter, dot indicators, and a progress bar. Same hand-drawn blueprint
 * language as the rest of the brand system. The single long-form developer
 * reference lives at /tech; this deck links to it.
 *
 * Numbers are the canonical held-out RouterBench eval (60% / ~98% / n=11,420),
 * clearly framed as eval figures. Never "0% catastrophic".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { trackPageView } from "@/utils/analytics";
import { Pill, Annotation, FeatureCard } from "@/components/brand/tech";
import {
  Sparkle, SketchBox, DocCheck, SketchStairs, DottedGrid, ContourLines,
  Agave, VerifierSeal, SweepLines, ConstructionField, CrossMarks, Scribble,
} from "@/components/brand/motifs";

/* ── Wordmark ────────────────────────────────────────────────────────── */

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-editorial text-[22px] leading-none text-[var(--ink)] tracking-[-0.01em]">Nadir</span>
      <Sparkle className="h-3.5 w-3.5" color="var(--strawberry)" />
    </span>
  );
}

/* ── Slide-local helpers ─────────────────────────────────────────────── */

function SlideLabel({ n, label }: { n: string; label: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="font-mono text-[12px] font-semibold text-[var(--strawberry)]">{n}</span>
      <span className="h-px w-8 bg-[var(--ink)]/25" />
      <span className="eyebrow text-[var(--ink)]/55">{label}</span>
    </div>
  );
}

function GatewayBox({ label, sub, accent = false }: { label: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`relative min-w-[100px] px-3 py-2.5 text-center ${accent ? "bg-[var(--strawberry)]/[0.16]" : "bg-[var(--paper)]"}`}>
      <SketchBox color="var(--ink)" />
      <div className="relative font-mono text-[11px] font-semibold text-[var(--ink)]">{label}</div>
      {sub ? <div className="relative font-mono text-[8.5px] uppercase tracking-wide text-[var(--ink)]/50">{sub}</div> : null}
    </div>
  );
}

function Hop({ label }: { label?: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center px-1">
      <span className="font-mono text-[9px] text-[var(--ink)]/45">{label}</span>
      <span className="text-[var(--ink)]/40">→</span>
    </div>
  );
}

/* ── Slides ──────────────────────────────────────────────────────────── */

function SlideTitle() {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
      <div>
        <span className="font-hand text-[20px] text-[var(--strawberry)] uline-pink -rotate-2 inline-block">engineering brief, not a sales deck.</span>
        <h1 className="mt-5 font-editorial text-[clamp(40px,6vw,76px)] font-semibold leading-[0.97] text-[var(--ink)]">
          Most prompts don't need your{" "}
          <span className="whitespace-nowrap"><span className="italic text-[var(--strawberry)]">best model</span>
            <Sparkle className="inline-block h-4 w-4 align-super" color="var(--strawberry)" /><span>.</span>
          </span>
        </h1>
        <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-[var(--ink)]/75">
          Nadir routes each prompt to the smallest model that can answer it, verifies the output, and
          escalates only when it has to.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <Pill>OpenAI-compatible</Pill>
          <Pill>Self-hosted / VPC</Pill>
          <Pill>Multi-provider</Pill>
          <Pill accent>Verify &amp; escalate</Pill>
        </div>
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute -right-2 left-10 top-6 bottom-2 rotate-[1.2deg] bg-[var(--strawberry)]/[0.14] torn-b" aria-hidden />
        <div className="relative bg-[var(--paper)] p-5">
          <SketchBox color="var(--ink)" />
          <div className="relative flex items-center justify-between">
            <span className="eyebrow text-[var(--ink)]/55">Routing decision</span>
            <span className="font-mono text-[10px] text-[var(--ink)]/45">req_8f2a…</span>
          </div>
          <p className="relative mt-3 font-hand text-[19px] leading-snug text-[var(--ink)]">
            "Summarise this support thread and tag the sentiment."
          </p>
          <ul className="relative mt-4 space-y-2">
            {[{ m: "haiku-4.5", s: "tried", pick: true }, { m: "sonnet-4.6", s: "skipped" }, { m: "opus-4.6", s: "not needed" }].map((r) => (
              <li key={r.m} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full border ${r.pick ? "border-[var(--strawberry)] bg-[var(--strawberry)]" : "border-[var(--ink)]/35"}`} />
                <span className={`font-mono text-[12px] ${r.pick ? "font-semibold text-[var(--strawberry)]" : "text-[var(--ink)]/70"}`}>{r.m}</span>
                <span className="mx-1 flex-1 translate-y-[-2px] border-b border-dotted border-[var(--ink)]/25" />
                <span className="font-mono text-[10.5px] uppercase tracking-wide text-[var(--ink)]/55">{r.s}</span>
              </li>
            ))}
          </ul>
          <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-dashed border-[var(--ink)]/15 pt-3">
            {[["verifier", "0.94 pass"], ["cost", "−71%"], ["escalated", "no"]].map(([k, v]) => (
              <div key={k}>
                <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink)]/45">{k}</div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold text-[var(--ink)]">{v}</div>
              </div>
            ))}
          </div>
          <Annotation className="absolute -bottom-7 right-2 rotate-2 text-[var(--ink)]/60">verified, then billed ↑</Annotation>
        </div>
      </div>
    </div>
  );
}

function SlideProblem() {
  const stats = [
    { v: "1", u: "model", k: "Hard-coded everywhere", c: "var(--ink)" },
    { v: "100", u: "%", k: "Of traffic priced as if hard", c: "var(--strawberry)" },
    { v: "~74", u: "%", k: "Of calls a smaller model serves", c: "var(--sky)" },
    { v: "0", u: "", k: "Visibility into what each call needed", c: "var(--ink)" },
  ];
  return (
    <div>
      <SlideLabel n="01" label="The problem" />
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div>
          <h2 className="font-editorial text-[clamp(30px,4.4vw,54px)] font-semibold leading-[1.02] text-[var(--ink)]">
            You pay frontier prices for work a smaller model would ace.
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--ink)]/70">
            Most production traffic is not hard. Summaries, classification, extraction, rewrites, and routine tool calls
            do not need your most expensive model, but one hard-coded model name sends all of it there anyway.
          </p>
          <Annotation className="mt-6 inline-block -rotate-2">the bill is real, the quality ceiling is not higher ↘</Annotation>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {stats.map((s) => (
            <div key={s.k} className="relative p-4">
              <SketchBox color="var(--ink)" />
              <div className="relative font-editorial text-[38px] leading-none tabular-nums" style={{ color: s.c }}>
                {s.v}<span className="text-[0.5em]">{s.u}</span>
              </div>
              <div className="relative mt-2 text-[11.5px] leading-snug text-[var(--ink)]/60">{s.k}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SlideSolution() {
  const flow = [
    { n: "01", t: "Route", b: "A trained classifier predicts the smallest model likely to satisfy the prompt and tries it first.", note: "start low", motif: <DottedGrid className="h-10 w-14" color="var(--ink)" /> },
    { n: "02", t: "Verify", b: "The candidate answer is scored against quality signals before it is ever returned.", note: "quality gate", motif: <DocCheck className="h-12 w-14" color="var(--ink)" /> },
    { n: "03", t: "Escalate", b: "If it fails the bar, Nadir steps up the ladder automatically, only as far as it needs to.", note: "only if needed", motif: <SketchStairs className="h-12 w-16" color="var(--ink)" /> },
  ];
  return (
    <div>
      <SlideLabel n="02" label="The fix" />
      <h2 className="max-w-3xl font-editorial text-[clamp(30px,4.4vw,54px)] font-semibold leading-[1.02] text-[var(--ink)]">
        Route, verify, escalate. Three moves, one decision.
      </h2>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--ink)]/70">
        The difference from naive routing is the verifier. Nadir does not just guess cheap, it proves the cheap answer is
        good enough before committing.
      </p>
      <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {flow.map((s) => (
          <div key={s.t} className="relative">
            <div className="flex items-baseline gap-2.5">
              <span className="font-editorial text-[30px] leading-none text-[var(--strawberry)]">{s.n}</span>
              <span className="eyebrow text-[var(--ink)]">{s.t}</span>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--ink)]/65">{s.b}</p>
            <div className="mt-5 grid h-14 place-items-center">{s.motif}</div>
            <Annotation className="mt-1 block -rotate-2">{s.note}</Annotation>
          </div>
        ))}
      </div>
    </div>
  );
}

const CAPS = [
  { t: "Lowest-viable routing", tags: ["Classifier", "4-tier"], b: "Per-prompt model selection across a capability ladder, not a static map." },
  { t: "Verify & escalate", tags: ["Guardrail"], b: "A verifier catches weak cheap answers and escalates before the user sees them." },
  { t: "Multi-provider", tags: ["OpenAI", "Anthropic", "Google"], b: "One OpenAI-compatible surface over every major provider via LiteLLM." },
  { t: "Bring your own gateway", tags: ["Drop-in"], b: "Point Nadir at the gateway you already run, or place it in front. It composes." },
  { t: "Self-host in your VPC", tags: ["Docker"], b: "One container. Your keys, your weights, your perimeter. No prompt leaves." },
  { t: "Observability built in", tags: ["Logs", "Savings"], b: "Per-request cost, latency, and escalation reason, with prompt-hashing privacy mode." },
];

function SlideCapabilities() {
  return (
    <div>
      <SlideLabel n="03" label="Capabilities" />
      <h2 className="max-w-2xl font-editorial text-[clamp(28px,4vw,48px)] font-semibold leading-[1.04] text-[var(--ink)]">
        Everything routing should have done from the start.
      </h2>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPS.map((c) => <FeatureCard key={c.t} title={c.t} tags={c.tags} body={c.b} />)}
      </div>
    </div>
  );
}

function SlideOnPrem() {
  return (
    <div>
      <SlideLabel n="04" label="On your terms" />
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_0.9fr] lg:gap-16">
        <div>
          <h2 className="font-editorial text-[clamp(30px,4.4vw,54px)] font-semibold leading-[1.02] text-[var(--ink)]">
            Your model. Your infra. Your perimeter.
          </h2>
          <ul className="mt-6 space-y-4">
            {[
              ["Single container", "Frontend plus API in one image. Compose locally, or push to App Runner, ECS, or your own k8s."],
              ["Your keys, your weights", "Hosted provider keys, Bedrock in your account, or local OSS models behind the same surface."],
              ["Privacy contract", "With prompt storage off, Nadir writes sha256:<hex> instead of prompt text and drops the response body."],
            ].map(([h, b]) => (
              <li key={h} className="flex gap-3">
                <Sparkle className="mt-1 h-3.5 w-3.5 shrink-0" color="var(--strawberry)" />
                <div>
                  <div className="font-editorial text-[17px] text-[var(--ink)]">{h}</div>
                  <div className="text-[13px] leading-relaxed text-[var(--ink)]/65">{b}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <Agave className="pointer-events-none absolute -right-2 -top-9 hidden h-20 w-14 opacity-80 lg:block" />
          <div className="relative bg-[var(--mint)]/40 p-6">
            <SketchBox color="var(--ink)" />
            <div className="relative">
              <div className="eyebrow text-[var(--ink)]/55">Inside your boundary</div>
              <div className="mt-4 space-y-2.5 font-mono text-[12px] text-[var(--ink)]/80">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--strawberry)]" /> your VPC</div>
                <div className="ml-4 border-l border-dashed border-[var(--ink)]/25 pl-4 pt-1">
                  <div>nadir/router : 8000</div>
                  <div className="text-[var(--ink)]/55">your provider keys</div>
                  <div className="text-[var(--ink)]/55">your database</div>
                </div>
              </div>
              <Annotation className="mt-5 block rotate-1 text-[var(--ink)]/60">nothing calls home ↗</Annotation>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideGateway() {
  return (
    <div>
      <SlideLabel n="05" label="Composes with your stack" />
      <h2 className="max-w-3xl font-editorial text-[clamp(28px,4vw,50px)] font-semibold leading-[1.02] text-[var(--ink)]">
        Drop in beside the gateway you already built.
      </h2>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--ink)]/70">
        Nadir speaks the OpenAI wire format on both sides, so it slots into an existing setup without a rewrite.
        Pick the topology that fits your control plane.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="relative bg-[var(--glacier)]/25 p-5">
          <SketchBox color="var(--ink)" />
          <div className="relative flex items-center justify-between">
            <span className="eyebrow text-[var(--ink)]/60">A · Behind your gateway</span>
            <Pill accent>recommended</Pill>
          </div>
          <div className="relative mt-5 flex flex-wrap items-center gap-y-3">
            <GatewayBox label="your app" sub="sdk" />
            <Hop />
            <GatewayBox label="your gateway" sub="litellm" />
            <Hop label="auto" />
            <GatewayBox label="Nadir" sub="routes" accent />
            <Hop />
            <GatewayBox label="providers" />
          </div>
        </div>
        <div className="relative bg-[var(--strawberry)]/[0.14] p-5">
          <SketchBox color="var(--ink)" />
          <div className="relative flex items-center justify-between">
            <span className="eyebrow text-[var(--ink)]/60">B · Nadir in front</span>
            <Pill>standalone</Pill>
          </div>
          <div className="relative mt-5 flex flex-wrap items-center gap-y-3">
            <GatewayBox label="your app" sub="sdk" />
            <Hop label="auto" />
            <GatewayBox label="Nadir" sub="routes + verifies" accent />
            <Hop />
            <GatewayBox label="providers" />
          </div>
        </div>
      </div>
      <Annotation className="mt-6 inline-block -rotate-1 text-[var(--ink)]/60">one base_url change, same SDK ↗</Annotation>
    </div>
  );
}

function SlideProof() {
  const proof = [
    { v: "60", u: "%", k: "Lower cost vs always-Opus", c: "var(--strawberry)" },
    { v: "~98", u: "%", k: "Quality retained", c: "var(--ink)" },
    { v: "11,420", u: "", k: "Held-out triples", c: "var(--sky)" },
  ];
  const bars = [
    { label: "Nadir", v: 60, strong: true },
    { label: "Human selection", v: 37 },
    { label: "Naive routing", v: 18 },
    { label: "Always-Opus (baseline)", v: 0 },
  ];
  return (
    <div>
      <SlideLabel n="06" label="Proof, measured" />
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <h2 className="font-editorial text-[clamp(28px,4vw,50px)] font-semibold leading-[1.02] text-[var(--ink)]">
            Measured on a held-out set, not a promise.
          </h2>
          <div className="mt-8 grid grid-cols-3 gap-5">
            {proof.map((p) => (
              <div key={p.k}>
                <div className="font-editorial text-[clamp(30px,3.6vw,46px)] leading-none tabular-nums" style={{ color: p.c }}>
                  {p.v}<span className="text-[0.5em]">{p.u}</span>
                </div>
                <div className="mt-2 text-[11.5px] leading-snug text-[var(--ink)]/60">{p.k}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-md text-[12.5px] leading-relaxed text-[var(--ink)]/55">
            Held-out RouterBench evaluation of 11,420 prompt/model/score triples versus an always-use-the-best-model baseline.
            Production behaviour is re-measured per deployment.
          </p>
        </div>
        <div>
          <div className="eyebrow mb-4 text-[var(--ink)]/45">Median cost savings vs baseline</div>
          <div className="space-y-3">
            {bars.map((c) => (
              <div key={c.label} className="flex items-center gap-3">
                <span className="w-40 shrink-0 font-mono text-[10px] text-[var(--ink)]/65">{c.label}</span>
                <span className="relative h-3 flex-1 rounded-[2px] bg-[var(--ink)]/8">
                  {c.v > 0 ? <span className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: `${c.v}%`, background: c.strong ? "var(--strawberry)" : "rgba(21,35,59,0.30)" }} /> : null}
                </span>
                <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink)]/70">{c.v > 0 ? `${c.v}%` : "—"}</span>
              </div>
            ))}
          </div>
          <Annotation className="mt-5 block text-right rotate-1 text-[var(--ink)]/60">guardrailed, not free-fall ↗</Annotation>
        </div>
      </div>
    </div>
  );
}

function SlideClose() {
  return (
    <div className="relative overflow-hidden rounded-[3px] bg-[var(--ink)] px-8 py-12 lg:px-14 lg:py-16">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.15]">
        <ContourLines className="absolute -right-6 top-2 h-40 w-48" color="var(--shell)" />
      </div>
      <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <VerifierSeal className="hidden h-16 w-16 shrink-0 sm:block" color="var(--shell)" label="LOWEST VIABLE MODEL · VERIFIED · " />
          <div>
            <span className="eyebrow text-[var(--shell)]/55">For your engineers</span>
            <h2 className="mt-3 font-editorial text-[clamp(28px,3.6vw,46px)] font-semibold leading-[1.05] text-[var(--shell)]">
              Hand your team one page.
            </h2>
            <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-[var(--shell)]/70">
              The full product and integration walkthrough, architecture, routing internals, API, and gateway wiring,
              lives on a single technical page. We will also shadow-deploy against a slice of your traffic before you
              change anything in production.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-3">
          <Link to="/tech" className="inline-flex items-center gap-2 rounded-[2px] bg-[var(--strawberry)] px-6 py-3 font-mono text-[12px] font-semibold uppercase tracking-wider text-[var(--ink)] no-underline">
            Read the technical guide <Sparkle className="h-3 w-3" color="var(--ink)" />
          </Link>
          <a href="/contact?reason=partner" className="text-center eyebrow text-[var(--shell)]/70 no-underline hover:text-[var(--shell)]">Or book a technical call →</a>
        </div>
      </div>
    </div>
  );
}

const SLIDES = [SlideTitle, SlideProblem, SlideSolution, SlideCapabilities, SlideOnPrem, SlideGateway, SlideProof, SlideClose];

/* ── Deck shell ──────────────────────────────────────────────────────── */

export default function PitchDeck() {
  const [i, setI] = useState(0);
  const total = SLIDES.length;
  useEffect(() => { trackPageView("pitch_deck"); }, []);

  const go = useCallback((next: number) => setI(() => Math.max(0, Math.min(total - 1, next))), [total]);

  // keep latest index for the keydown closure without re-binding the listener each render
  const iRef = useRef(i);
  iRef.current = i;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(iRef.current + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(iRef.current - 1); }
      else if (e.key === "Home") { go(0); }
      else if (e.key === "End") { go(total - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, total]);

  return (
    <div className="nadir-brand grain relative flex h-[100svh] w-full flex-col overflow-hidden">
      <SEO title="Nadir · Engineering pitch" description="Nadir routes every prompt to the lowest model that can reliably answer, verifies the output, and escalates only when necessary, in front of the gateway you already operate." path="/pitch" />

      {/* background field */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <SweepLines className="absolute inset-0 hidden h-full w-full opacity-70 lg:block" />
        <ConstructionField variant={0} className="absolute left-2 top-1/3 hidden h-40 w-24 opacity-50 lg:block" />
        <ConstructionField variant={1} className="absolute right-3 top-1/4 hidden h-44 w-24 opacity-45 lg:block" />
        <CrossMarks className="absolute right-[7%] bottom-24 hidden h-12 w-24 opacity-50 lg:block" />
        <Scribble className="absolute left-[26%] top-20 hidden h-7 w-24 opacity-45 lg:block" />
        <Sparkle className="absolute left-[8%] bottom-[28%] hidden h-4 w-4 opacity-60 lg:block" color="var(--strawberry)" />
      </div>

      {/* progress bar */}
      <div className="absolute inset-x-0 top-0 z-30 h-[3px] bg-[var(--ink)]/8">
        <div className="h-full bg-[var(--strawberry)] transition-[width] duration-500" style={{ width: `${((i + 1) / total) * 100}%` }} />
      </div>

      {/* top chrome */}
      <header className="relative z-20 flex shrink-0 items-center justify-between px-6 pt-5 lg:px-12">
        <Link to="/pitch" className="no-underline"><Wordmark /></Link>
        <div className="flex items-center gap-5">
          <Link to="/tech" className="hidden eyebrow text-[var(--ink)]/60 no-underline hover:text-[var(--ink)] sm:inline">Technical guide →</Link>
          <a href="/contact?reason=partner" className="btn-rect no-underline">Book a call <Sparkle className="h-3 w-3" color="var(--shell)" /></a>
        </div>
      </header>

      {/* slides */}
      <div className="relative z-10 min-h-0 flex-1">
        {SLIDES.map((Slide, idx) => {
          const on = idx === i;
          return (
            <div key={idx} aria-hidden={!on}
              className={`absolute inset-0 overflow-y-auto transition-all duration-500 ${on ? "opacity-100 translate-y-0" : "pointer-events-none translate-y-3 opacity-0"}`}>
              <div className="mx-auto flex min-h-full max-w-[1120px] flex-col justify-center px-6 py-8 lg:px-12 lg:py-10">
                <Slide />
              </div>
            </div>
          );
        })}
      </div>

      {/* bottom controls */}
      <footer className="relative z-20 flex shrink-0 items-center justify-between px-6 pb-5 lg:px-12">
        <span className="font-mono text-[12px] tabular-nums text-[var(--ink)]/55">
          <span className="font-semibold text-[var(--ink)]">{String(i + 1).padStart(2, "0")}</span>
          <span className="text-[var(--ink)]/35"> / {String(total).padStart(2, "0")}</span>
        </span>

        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, idx) => (
            <button key={idx} aria-label={`Go to slide ${idx + 1}`} onClick={() => go(idx)}
              className={`h-2 rounded-full transition-all ${idx === i ? "w-5 bg-[var(--strawberry)]" : "w-2 bg-[var(--ink)]/20 hover:bg-[var(--ink)]/40"}`} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--ink)]/20 text-[var(--ink)]/70 transition-colors hover:border-[var(--ink)]/45 hover:text-[var(--ink)] disabled:opacity-30">‹</button>
          <button onClick={() => go(i + 1)} disabled={i === total - 1} aria-label="Next slide"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--ink)]/20 text-[var(--ink)]/70 transition-colors hover:border-[var(--ink)]/45 hover:text-[var(--ink)] disabled:opacity-30">›</button>
        </div>
      </footer>
    </div>
  );
}
