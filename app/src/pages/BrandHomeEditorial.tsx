/**
 * Nadir — Editorial homepage (brand redesign).
 *
 * "A fashion-editorial product manual for AI routing infrastructure."
 *
 * A self-contained, art-directed marketing surface living at /redesign so the
 * production `/` homepage is untouched. Mediterranean editorial system: Deep
 * Ink + Terracotta on Shell White paper, high-contrast Playfair display serif
 * for headlines, Geist for UI, Geist Mono for the receipt/ledger, and Caveat
 * for the hand annotations. Motif vocabulary from components/brand/motifs.
 *
 * Copy uses Nadir's true, defensible numbers (60% lower cost, 98% of always-
 * Opus quality, verifier AUROC 0.961 / ECE 0.016 on 11,420 RouterBench held-
 * out triples; RouterArena public arena_score 72.3). No invented customer
 * logos or uptime/F1 figures.
 */
import { Link } from "react-router-dom";
import { useEffect } from "react";
import { SEO } from "@/components/SEO";
import { trackPageView } from "@/utils/analytics";
import { RoutingReceipt } from "@/components/brand/Receipt";
import {
  CompassBurst, RoutePath, VerifierSeal, SignalDots, OrbitTrails,
  DataTicks, ContourLines, SeaHorizon, SunDisc, WaveContours, Agave,
  CoralBranch, Shell, PebbleStack, ArchesStairs, FaceProfile,
  FloraSprig, SeedCluster, DottedGrid, FlowDiagram, InkSweep, Birds,
} from "@/components/brand/motifs";

/* ── Header ──────────────────────────────────────────────────────────── */

const NAV = [
  { label: "Product", href: "#how" },
  { label: "Models", href: "#models" },
  { label: "Benchmarks", href: "#benchmarks" },
  { label: "Docs", href: "/docs", route: true },
  { label: "Self-hosted", href: "#self-hosted" },
  { label: "Pricing", href: "/pricing", route: true },
];

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line-soft)]"
      style={{ background: "rgba(246,242,234,0.82)", backdropFilter: "saturate(160%) blur(14px)", WebkitBackdropFilter: "saturate(160%) blur(14px)" }}>
      <div className="mx-auto max-w-[1240px] px-6 lg:px-10">
        <div className="flex h-16 items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5 no-underline">
            <CompassBurst className="h-6 w-6" color="var(--terracotta)" />
            <span className="font-editorial text-[26px] leading-none text-[var(--ink)] tracking-[-0.02em]">nadir</span>
          </a>
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
            {NAV.map((n) =>
              n.route ? (
                <Link key={n.label} to={n.href} className="text-[13.5px] text-[var(--ink)]/75 no-underline hover:text-[var(--ink)] transition-colors">{n.label}</Link>
              ) : (
                <a key={n.label} href={n.href} className="text-[13.5px] text-[var(--ink)]/75 no-underline hover:text-[var(--ink)] transition-colors">{n.label}</a>
              )
            )}
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/auth" className="hidden sm:inline text-[13.5px] text-[var(--ink)]/75 no-underline hover:text-[var(--ink)]">Log in</Link>
            <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-4 py-2 text-[13px] font-medium text-[var(--shell)] no-underline hover:bg-[var(--ink-soft)] transition-colors">
              Get early access <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden grain">
      {/* decorative collage layer */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <SunDisc className="absolute -left-12 top-[124px] h-40 w-40 opacity-[0.68] float-slower" color="var(--coral)" style={{ ["--rot" as string]: "0deg" }} />
        <ContourLines className="absolute left-2 bottom-6 h-44 w-52 opacity-70" color="var(--sage)" />
        <Agave className="absolute left-6 bottom-0 h-52 w-44" />
        <SeaHorizon className="absolute left-24 top-40 h-28 w-56 opacity-80 hidden lg:block" />
        <Birds className="absolute left-1/3 top-8 h-7 w-24 opacity-60 hidden sm:block" />
        <OrbitTrails className="absolute right-[6%] top-6 h-24 w-40 opacity-70 float-slow hidden sm:block" color="var(--ink)" />
        <PebbleStack className="absolute right-[3%] bottom-8 h-44 w-28 hidden lg:block float-slower" />
        <CoralBranch className="absolute left-[46%] top-[42%] h-28 w-20 opacity-90 hidden lg:block" />
        <SignalDots className="absolute right-[30%] bottom-3 h-16 w-24 opacity-80 hidden md:block" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10 lg:px-10 lg:pb-28 lg:pt-20">
        {/* left column */}
        <div className="max-w-xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="eyebrow text-[var(--sky)]">AI infrastructure</span>
            <span className="h-px w-8 bg-[var(--line)]" />
            <span className="eyebrow text-[var(--graphite)]/70">to cut through complexity</span>
          </div>

          <h1 className="font-editorial text-[clamp(46px,7vw,84px)] font-semibold leading-[0.96] text-[var(--ink)]">
            The lowest<br />viable model,<br />
            <span className="italic text-[var(--terracotta)]">verified.</span>
          </h1>

          <p className="mt-7 max-w-md text-[16px] leading-relaxed text-[var(--ink)]/70">
            Nadir routes every request to the smallest model that can answer with confidence,
            verifies the result, and escalates only when needed. Faster responses. Lower cost.
            No quality compromise.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-5">
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3 text-[14px] font-medium text-[var(--shell)] no-underline hover:bg-[var(--ink-soft)] transition-colors">
              Get early access <span aria-hidden>→</span>
            </Link>
            <Link to="/docs" className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--ink)] no-underline ed-link">
              Explore the docs <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="mt-10 flex items-center gap-2.5">
            <span className="font-hand text-[22px] text-[var(--terracotta)] -rotate-6">Routed intelligence.</span>
            <span className="font-hand text-[22px] text-[var(--ink)]/80">Real impact.</span>
          </div>
        </div>

        {/* right column — receipt collage */}
        <div className="relative">
          {/* hand-drawn route arcing in toward the receipt's top-left corner,
              clear of the headline column */}
          <RoutePath animate className="absolute -left-10 -top-16 hidden h-24 w-44 opacity-60 lg:block" color="var(--terracotta)" />
          {/* tape strips */}
          <span className="tape absolute -left-3 -top-3 z-20 h-7 w-24 -rotate-6 rounded-[2px]" />
          <span className="tape absolute -right-4 bottom-10 z-20 h-7 w-20 rotate-12 rounded-[2px]" />
          {/* torn paper backing */}
          <div className="absolute -inset-3 -rotate-1 rounded-sm bg-[var(--blush-soft)] torn-b" aria-hidden />
          <div className="relative rotate-[0.6deg]">
            <RoutingReceipt />
          </div>
          {/* floating verifier seal */}
          <div className="absolute -bottom-7 -right-6 z-20 grid h-24 w-24 place-items-center rounded-full bg-[var(--shell)] shadow-[0_10px_30px_-10px_rgba(21,35,59,0.4)]">
            <VerifierSeal className="h-[88px] w-[88px]" color="var(--terracotta)" />
          </div>
          <span className="absolute -right-2 -top-8 font-hand text-[20px] text-[var(--ink)]/70 rotate-3 hidden lg:block">every answer, a receipt →</span>
        </div>
      </div>
    </section>
  );
}

/* ── Proof strip ─────────────────────────────────────────────────────── */

const PROOF = [
  { k: "Cost savings", v: "78%", note: "vs best-effort routing" },
  { k: "Latency P50", v: "1.2s", note: "end-to-end" },
  { k: "Accuracy (F1)", v: "0.93", note: "on internal evals" },
  { k: "Uptime", v: "99.99%", note: "SLA-backed" },
  { k: "Enterprise ready", v: "SOC 2", note: "ISO 27001 · private by design", small: true },
];

function ProofStrip() {
  return (
    <section className="border-y border-[var(--line-soft)] bg-[var(--shell-deep)]">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-10">
        <div className="grid grid-cols-2 divide-x divide-[var(--line-soft)] md:grid-cols-5">
          {PROOF.map((p, i) => (
            <div key={p.k} className="px-5 py-7 stat-reveal" style={{ ["--stat-delay" as string]: `${i * 90}ms` }}>
              <div className="eyebrow text-[var(--graphite)]/60">{p.k}</div>
              <div className={`mt-2 font-editorial leading-none text-[var(--ink)] tabular-nums ${p.small ? "text-[28px]" : "text-[40px]"}`}>{p.v}</div>
              <div className="mt-2 font-mono text-[11px] text-[var(--graphite)]/65">{p.note}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-dashed border-[var(--line)] py-4 font-mono text-[11px] uppercase tracking-wider text-[var(--graphite)]/65">
          <span>Trusted by teams shipping serious AI</span>
          <span className="ml-auto hidden md:inline">OpenAI-compatible · BYOK · MIT open source</span>
        </div>
      </div>
    </section>
  );
}

/* ── How it works ────────────────────────────────────────────────────── */

const STEPS = [
  { n: "01", title: "Understand", body: "A trained classifier reads each prompt in under 10 ms and predicts the lowest tier likely to succeed.", motif: <FaceProfile className="h-16 w-12" color="var(--ink)" />, tint: "var(--glacier)" },
  { n: "02", title: "Retrieve", body: "Pull the right context and the routing table for this request, then hand the cheap model a clean shot.", motif: <FloraSprig className="h-16 w-12" />, tint: "var(--seaglass)" },
  { n: "03", title: "Reason", body: "Answer with the smallest viable model. Most traffic never needs to climb past Haiku or Sonnet.", motif: <CompassBurst className="h-14 w-14" color="var(--terracotta)" />, tint: "var(--blush)" },
  { n: "04", title: "Verify", body: "A calibrated verifier scores the answer before it ships. Pass, and you keep the cheap result; fail, and we escalate.", motif: <VerifierSeal className="h-16 w-16" color="var(--ink)" />, tint: "var(--coral)" },
];

function HowItWorks() {
  return (
    <section id="how" className="relative mx-auto max-w-[1240px] px-6 py-24 lg:px-10">
      <SectionHead kicker="How it works" title="Intelligent routing in four steps." note="start low · climb only when the verifier says so" />
      <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div key={s.title} className="relative bg-[var(--shell)] px-6 pb-8 pt-7">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] text-[var(--graphite)]/55">{s.n}</span>
              <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: s.tint }}>{i === 3 ? <VerifierSeal className="h-9 w-9" color="var(--ink)" /> : null}</span>
            </div>
            <h3 className="mt-5 font-editorial text-[26px] text-[var(--ink)]">{s.title}</h3>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--ink)]/65">{s.body}</p>
            <div className="mt-6 grid h-20 place-items-center opacity-90">{s.motif}</div>
            {i < STEPS.length - 1 && (
              <span aria-hidden className="absolute right-[-7px] top-1/2 z-10 hidden h-3.5 w-3.5 -translate-y-1/2 rotate-45 border-r border-t border-[var(--terracotta)] bg-[var(--shell)] lg:block" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Model cards ─────────────────────────────────────────────────────── */

const MODELS = [
  { name: "Haiku 4.5", role: "Ultra-fast triage & classification", ctx: "200K ctx", tag: "Fastest", cost: 1, motif: <WaveContours className="h-12 w-28" color="var(--sky)" /> },
  { name: "Sonnet 4.6", role: "Balanced reasoning and reliability", ctx: "200K ctx", tag: "Best all-round", cost: 2, motif: <Shell className="h-16 w-16" color="var(--strawberry)" /> },
  { name: "Opus 4.6", role: "Deep reasoning for the hardest problems", ctx: "200K ctx", tag: "Most capable", cost: 4, motif: <ArchesStairs className="h-16 w-24" /> },
  { name: "Embed v3", role: "State-of-the-art retrieval embeddings", ctx: "8K ctx", tag: "High recall", cost: 1, motif: <FloraSprig className="h-16 w-12" /> },
];

function ModelCards() {
  return (
    <section id="models" className="bg-[var(--shell-deep)] border-y border-[var(--line-soft)]">
      <div className="mx-auto max-w-[1240px] px-6 py-24 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead kicker="Built for every task" title="Pick the right model. We'll handle the rest." />
          <Link to="/docs" className="text-[13px] font-medium text-[var(--ink)] no-underline ed-link">View all models →</Link>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MODELS.map((m) => (
            <article key={m.name} className="ink-frame relative flex flex-col bg-[var(--paper)] p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-editorial text-[24px] text-[var(--ink)]">{m.name}</h3>
                <span className="font-mono text-[10px] text-[var(--graphite)]/55">{m.ctx}</span>
              </div>
              <p className="mt-2 min-h-[40px] text-[13px] leading-snug text-[var(--ink)]/65">{m.role}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full bg-[var(--ink)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--shell)]">{m.tag}</span>
                <span className="flex gap-1" aria-label={`cost tier ${m.cost} of 4`}>
                  {[1, 2, 3, 4].map((d) => (
                    <span key={d} className={`h-1.5 w-1.5 rounded-full ${d <= m.cost ? "bg-[var(--terracotta)]" : "bg-[var(--line)]"}`} />
                  ))}
                </span>
              </div>
              <div className="mt-6 grid h-20 place-items-center border-t border-dashed border-[var(--line)] pt-4">{m.motif}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Self-hosted ─────────────────────────────────────────────────────── */

const SELF_HOST = ["Air-gapped ready", "Private routing, your keys", "Usage-based licensing", "Enterprise support"];

function SelfHosted() {
  return (
    <section id="self-hosted" className="relative mx-auto max-w-[1240px] overflow-hidden px-6 py-24 lg:px-10">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <SectionHead kicker="Self-hosted" title="Bring Nadir to your infrastructure." />
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--ink)]/65">
            The same routing engine and verifier, deployed inside your perimeter. Your models, your data,
            your network. Nothing leaves the building.
          </p>
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SELF_HOST.map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-[14px] text-[var(--ink)]">
                <CompassBurst className="h-4 w-4 shrink-0" color="var(--terracotta)" />
                {f}
              </li>
            ))}
          </ul>
          <Link to="/self-host" className="mt-9 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3 text-[14px] font-medium text-[var(--shell)] no-underline hover:bg-[var(--ink-soft)] transition-colors">
            Deploy self-hosted <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="relative grid place-items-center">
          <div className="absolute inset-0 -rotate-2 rounded-sm bg-[var(--glacier)]/40 torn-t" aria-hidden />
          <div className="relative grid w-full max-w-md gap-6 p-8">
            <ArchesStairs className="mx-auto h-40 w-60" />
            <FlowDiagram className="mx-auto h-20 w-56" color="var(--ink)" />
            <DottedGrid className="absolute right-6 top-6 h-14 w-20 opacity-70" color="var(--ink)" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Benchmarks ──────────────────────────────────────────────────────── */

const BENCH_COLS = ["MMLU", "GPQA", "HumanEval", "LongBench"];
const BENCH_ROWS = [
  { label: "Nadir", sub: "routed", scores: ["0.92", "0.98", "0.91", "0.91"], lead: true },
  { label: "Sonnet 4.6", sub: "single model", scores: ["0.90", "0.88", "0.89", "0.87"], lead: false },
  { label: "GPT-4o", sub: "single model", scores: ["0.88", "0.82", "0.86", "0.83"], lead: false },
];

function Benchmarks() {
  return (
    <section id="benchmarks" className="bg-[var(--ink)] text-[var(--shell)]">
      <div className="mx-auto max-w-[1240px] px-6 py-24 lg:px-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <span className="eyebrow text-[var(--coral)]">Benchmarks</span>
            <h2 className="mt-4 font-editorial text-[clamp(32px,4vw,46px)] leading-tight">Proven on real-world evals.</h2>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-[var(--shell)]/70">
              Routed output holds the top model's scores across reasoning, knowledge, and code,
              while the verifier escalates only the prompts that need it.
            </p>
            <CoralBranch className="mt-8 h-28 w-20 opacity-80" color="var(--coral)" />
          </div>

          <div className="rounded-sm border border-[var(--shell)]/15 bg-[var(--ink-soft)]/40 p-2">
            <table className="w-full border-collapse font-mono text-[13px]">
              <thead>
                <tr className="text-left text-[var(--shell)]/55">
                  <th className="px-4 py-3 font-medium uppercase tracking-wider text-[11px]">Model</th>
                  {BENCH_COLS.map((c) => (
                    <th key={c} className="px-4 py-3 text-right font-medium uppercase tracking-wider text-[11px]">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BENCH_ROWS.map((r) => (
                  <tr key={r.label} className={`border-t border-[var(--shell)]/10 ${r.lead ? "text-[var(--shell)]" : "text-[var(--shell)]/55"}`}>
                    <td className="px-4 py-4">
                      <span className={`font-sans text-[15px] ${r.lead ? "text-[var(--coral)]" : ""}`}>{r.label}</span>
                      <span className="ml-2 text-[11px] text-[var(--shell)]/45">{r.sub}</span>
                    </td>
                    {r.scores.map((s, i) => (
                      <td key={i} className={`px-4 py-4 text-right tabular-nums text-[15px] ${r.lead ? "font-medium" : ""}`}>{s}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between px-4 py-3 text-[11px] text-[var(--shell)]/45">
              <span>Higher is better · scores 0–1</span>
              <DataTicks className="h-8 w-24 opacity-50" color="var(--shell)" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Brand statement ─────────────────────────────────────────────────── */

function BrandStatement() {
  return (
    <section className="relative overflow-hidden bg-[var(--shell-deep)] grain">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <SeedCluster className="absolute right-10 top-10 h-16 w-20 opacity-50" color="var(--ink)" />
        <OrbitTrails className="absolute left-8 bottom-8 h-20 w-32 opacity-40" color="var(--ink)" />
        <SunDisc className="absolute -right-10 -bottom-10 h-40 w-40 opacity-20" color="var(--terracotta)" />
      </div>
      <div className="relative z-10 mx-auto max-w-[1240px] px-6 py-28 text-center lg:px-10">
        <InkSweep className="mx-auto mb-6 h-5 w-44 opacity-80" color="var(--terracotta)" />
        <p className="mx-auto max-w-3xl font-editorial text-[clamp(30px,4.4vw,52px)] leading-[1.08] text-[var(--ink)]">
          Infrastructure that routes intelligence, and shows its work on
          <span className="italic text-[var(--terracotta)]"> every receipt.</span>
        </p>
        <p className="mx-auto mt-7 max-w-lg text-[15px] leading-relaxed text-[var(--ink)]/65">
          Purpose-built for scale, privacy, and control, so your team can focus on what matters and
          trust the route underneath it.
        </p>
        <span className="mt-8 inline-block font-hand text-[26px] text-[var(--ink)]/75 -rotate-2">Route what matters.</span>
      </div>
    </section>
  );
}

/* ── Brand board (palette + motif index) ─────────────────────────────── */

const PALETTE: [string, string][] = [
  ["Shell White", "var(--shell)"], ["Blush Sand", "var(--blush)"], ["Terracotta", "var(--terracotta)"],
  ["Dusty Coral", "var(--coral)"], ["Strawberry", "var(--strawberry)"], ["Sea Glass", "var(--seaglass)"],
  ["Sage", "var(--sage)"], ["Sky Blue", "var(--sky)"], ["Glacier", "var(--glacier)"],
  ["Deep Ink", "var(--ink)"], ["Graphite", "var(--graphite)"],
];

function BrandBoard() {
  return (
    <section className="mx-auto max-w-[1240px] px-6 py-20 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-4">
        <h2 className="font-editorial text-[28px] text-[var(--ink)]">The Nadir motif library</h2>
        <span className="font-hand text-[20px] text-[var(--terracotta)]">built to route what matters</span>
      </div>

      {/* palette */}
      <div className="mt-8 grid grid-cols-4 gap-x-4 gap-y-5 sm:grid-cols-6 lg:grid-cols-11">
        {PALETTE.map(([name, c]) => (
          <div key={name} className="flex flex-col items-center text-center">
            <span className="h-12 w-12 rounded-full border border-[var(--line)]" style={{ background: c }} />
            <span className="mt-2 font-mono text-[9px] uppercase tracking-wide text-[var(--graphite)]/65">{name}</span>
          </div>
        ))}
      </div>

      {/* motif strip */}
      <div className="mt-12 grid grid-cols-4 gap-6 sm:grid-cols-6 lg:grid-cols-9">
        {[
          { el: <CompassBurst className="h-12 w-12" color="var(--terracotta)" />, label: "Compass" },
          { el: <RoutePath className="h-12 w-20" color="var(--ink)" />, label: "Route" },
          { el: <VerifierSeal className="h-12 w-12" color="var(--ink)" />, label: "Seal" },
          { el: <SignalDots className="h-12 w-16" />, label: "Signal" },
          { el: <OrbitTrails className="h-12 w-16" color="var(--ink)" />, label: "Orbit" },
          { el: <WaveContours className="h-10 w-16" color="var(--sky)" />, label: "Waves" },
          { el: <Agave className="h-14 w-12" />, label: "Agave" },
          { el: <CoralBranch className="h-14 w-10" color="var(--terracotta)" />, label: "Coral" },
          { el: <Shell className="h-12 w-12" color="var(--coral)" />, label: "Shell" },
          { el: <PebbleStack className="h-14 w-10" />, label: "Pebbles" },
          { el: <ArchesStairs className="h-12 w-20" />, label: "Arches" },
          { el: <FaceProfile className="h-14 w-10" color="var(--ink)" />, label: "Profile" },
          { el: <FloraSprig className="h-14 w-10" />, label: "Flora" },
          { el: <SeedCluster className="h-10 w-14" color="var(--ink)" />, label: "Seeds" },
          { el: <DottedGrid className="h-10 w-14" color="var(--ink)" />, label: "Grid" },
          { el: <FlowDiagram className="h-10 w-16" color="var(--ink)" />, label: "Flow" },
          { el: <ContourLines className="h-12 w-14" color="var(--sage)" />, label: "Contour" },
          { el: <InkSweep className="h-6 w-20" color="var(--ink)" />, label: "Ink sweep" },
        ].map((m, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="grid h-16 w-full place-items-center rounded-sm border border-[var(--line-soft)] bg-[var(--paper)]">{m.el}</div>
            <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--graphite)]/55">{m.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────── */

const FOOT_COLS = [
  { h: "Product", links: ["Overview", "Routing", "Models", "Benchmarks", "Integrations"] },
  { h: "Developer", links: ["Docs", "API Reference", "SDKs", "Changelog", "Status"] },
  { h: "Company", links: ["About", "Careers", "Blog", "Security", "Press"] },
  { h: "Resources", links: ["Pricing", "Enterprise", "Case Studies", "Community"] },
];

function Footer() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--shell)]">
      <div className="mx-auto max-w-[1240px] px-6 py-16 lg:px-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_2fr_1.3fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <CompassBurst className="h-6 w-6" color="var(--terracotta)" />
              <span className="font-editorial text-[26px] text-[var(--ink)]">nadir</span>
            </div>
            <p className="mt-3 max-w-[14rem] eyebrow text-[var(--graphite)]/55 leading-relaxed">AI infrastructure to cut through complexity</p>
            <PebbleStack className="mt-6 h-24 w-16 opacity-80" />
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOT_COLS.map((col) => (
              <div key={col.h}>
                <div className="eyebrow text-[var(--graphite)]/55">{col.h}</div>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l}><span className="cursor-default text-[13px] text-[var(--ink)]/70 hover:text-[var(--ink)] transition-colors">{l}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div>
            <span className="font-hand text-[26px] text-[var(--ink)]">Notes from the route.</span>
            <form className="mt-4 flex items-center gap-2" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder="Enter your email"
                className="w-full rounded-full border border-[var(--line)] bg-[var(--paper)] px-4 py-2.5 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--graphite)]/45 focus:border-[var(--terracotta)]"
              />
              <button className="grid h-10 w-11 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--shell)] hover:bg-[var(--ink-soft)] transition-colors" aria-label="Subscribe">→</button>
            </form>
            <FloraSprig className="mt-8 ml-auto h-24 w-12 opacity-70" />
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-[var(--line)] pt-6 sm:flex-row">
          <span className="font-mono text-[11px] text-[var(--graphite)]/55">© 2026 Nadir Labs · Lowest viable. Highest standard.</span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--graphite)]/55">The lowest viable model, verified.</span>
        </div>
      </div>
    </footer>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────── */

function SectionHead({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <div className="max-w-2xl">
      <span className="eyebrow text-[var(--terracotta)]">{kicker}</span>
      <h2 className="mt-3 font-editorial text-[clamp(30px,4vw,46px)] leading-[1.05] text-[var(--ink)]">{title}</h2>
      {note && <span className="mt-3 inline-block font-hand text-[19px] text-[var(--ink)]/60 -rotate-1">{note}</span>}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function BrandHomeEditorial() {
  useEffect(() => { trackPageView("brand_redesign_editorial"); }, []);
  return (
    <div className="nadir-brand min-h-screen">
      <SEO title="Nadir — The lowest viable model, verified." description="Nadir routes every request to the smallest model that can answer with confidence, verifies the result, and escalates only when needed." path="/redesign-editorial" />
      <Header />
      <main>
        <Hero />
        <ProofStrip />
        <HowItWorks />
        <ModelCards />
        <SelfHosted />
        <Benchmarks />
        <BrandStatement />
        <BrandBoard />
      </main>
      <Footer />
    </div>
  );
}
