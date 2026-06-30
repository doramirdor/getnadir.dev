/**
 * Nadir blueprint redesign — Benchmarks page (/redesign/benchmarks).
 * Real, held-out eval numbers. AUROC framed as a held-out eval figure only.
 */
import { RedesignLayout, PageHero, Section, SectionHead, Panel, StatBig } from "@/components/brand/redesign";
import { VerifierSeal, DataTicks, SignalDots, Sparkle } from "@/components/brand/motifs";

const STATS = [
  { v: "60", unit: "%", k: "Lower cost", note: "vs always-Opus 4.6 at the default verifier threshold (τ = 0.8).", color: "var(--strawberry)" },
  { v: "98", unit: "%", k: "Quality retained", note: "of always-Opus quality on held-out RouterBench.", color: "var(--ink)" },
  { v: "1.7", unit: "%", k: "Catastrophic routes", note: "answers shipped below bar, at τ = 0.8.", color: "var(--ink)" },
  { v: "0.961", unit: "", k: "Verifier AUROC", note: "held-out eval; ECE 0.016. An eval figure, not deployed accuracy.", color: "var(--sky)" },
];

const COMPARE_COLS = ["Rel. cost", "Quality kept", "Catastrophic"];
const COMPARE_ROWS = [
  { label: "Always-Opus 4.6", sub: "baseline", cells: ["100%", "100%", "—"], lead: false },
  { label: "Nadir", sub: "verifier-gated cascade", cells: ["40%", "98%", "1.7%"], lead: true },
];

const SWEEP = [
  { t: "τ = 0.3", cost: "59.1%", cat: "1.1%" },
  { t: "τ = 0.8", cost: "60.9%", cat: "1.7%" },
  { t: "τ = 0.9", cost: "73.2%", cat: "8.8%" },
];

export default function Benchmarks() {
  return (
    <RedesignLayout
      title="Nadir Benchmarks · 60% cheaper, 98% of always-Opus quality"
      description="Held-out evaluation you can reproduce: Nadir's verifier-gated cascade cuts cost ~60% vs always-Opus while holding 98% of its quality, and ranks #4 of 21 routers on RouterArena."
      path="/redesign/benchmarks"
      track="brand_redesign_benchmarks"
    >
      <PageHero
        eyebrow="Benchmarks"
        title="Measured, not"
        accent="marketed."
        sub={<>Every number here comes from a held-out evaluation you can reproduce. Nadir's verifier-gated cascade cuts cost about 60% versus always running Opus, holds 98% of its quality, and an independent scorer ranks it #4 of 21 routers.</>}
        hand="proof, not promises"
        motif={<VerifierSeal className="seal-spin h-44 w-44 opacity-90" color="var(--ink)" />}
      />

      {/* headline numbers */}
      <Section rule={false}>
        <SectionHead eyebrow="Headline" title="The numbers that matter." />
        <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          {STATS.map((s) => <StatBig key={s.k} {...s} />)}
        </div>
        <p className="mt-8 font-mono text-[11px] text-[var(--ink)]/55">Measured on 11,420 RouterBench held-out triples (train / test disjoint, overlap_count = 0). Reproducible from the open eval harness.</p>
      </Section>

      {/* comparison */}
      <Section tint="bg-[var(--shell-deep)]">
        <SectionHead eyebrow="Head to head" title="Against the model you'd otherwise default to." note="the honest baseline" />
        <Panel className="mt-8 p-2" tint="bg-[var(--paper)]">
          <table className="w-full border-collapse font-mono text-[13px]">
            <thead>
              <tr className="text-left text-[var(--ink)]/55">
                <th className="px-4 py-3 text-[11px] uppercase tracking-wider">Routing strategy</th>
                {COMPARE_COLS.map((c) => <th key={c} className="px-4 py-3 text-right text-[11px] uppercase tracking-wider">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((r) => (
                <tr key={r.label} className={`border-t border-[var(--ink)]/10 ${r.lead ? "" : "text-[var(--ink)]/55"}`}>
                  <td className="px-4 py-4">
                    <span className={`font-sans text-[15px] ${r.lead ? "text-[var(--strawberry)]" : "text-[var(--ink)]"}`}>{r.label}</span>
                    <span className="ml-2 text-[11px] text-[var(--ink)]/45">{r.sub}</span>
                  </td>
                  {r.cells.map((c, i) => <td key={i} className={`px-4 py-4 text-right tabular-nums text-[15px] ${r.lead ? "font-medium text-[var(--ink)]" : ""}`}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-[var(--ink)]/65">
          Nadir is measured against an always-Opus 4.6 baseline, the same model that defines the savings benchmark, so the comparison is honest. The verifier reads every borderline answer before it ships, so quality drops are caught rather than absorbed.
        </p>
      </Section>

      {/* RouterArena */}
      <Section>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <SectionHead eyebrow="Independently scored" title="#4 of 21 routers on RouterArena." />
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--ink)]/70">
              On RouterArena's public scorer, Nadir posts an arena_score of 72.3. A contamination audit confirmed zero prompt overlap between Nadir's training corpora and the eval splits.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-10 gap-y-6">
              <StatBig v="72.3" k="arena_score" color="var(--strawberry)" />
              <StatBig v="#4" k="of 21 routers" color="var(--ink)" />
              <StatBig v="0" k="prompt overlap" color="var(--sky)" />
            </div>
          </div>
          <Panel className="grid place-items-center p-8">
            <SignalDots className="h-28 w-44" />
            <DataTicks className="mt-4 h-12 w-48 opacity-70" color="var(--ink)" />
            <span className="mt-4 font-hand text-[16px] text-[var(--ink)]/55">scored in the open</span>
          </Panel>
        </div>
      </Section>

      {/* methodology + sweep */}
      <Section tint="bg-[var(--shell-deep)]">
        <SectionHead eyebrow="Methodology" title="Graceful, not a cliff." note="you tune the dial" />
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <p className="max-w-md text-[15px] leading-relaxed text-[var(--ink)]/70">
            One knob, the verifier threshold τ, trades cost against safety. Across the sweep, cost reduction spans 59 to 73% while the catastrophic-route rate moves from 1.1% to 8.8%, a smooth curve with no cliff. Pick the point that fits your risk.
          </p>
          <Panel className="p-2" tint="bg-[var(--paper)]">
            <table className="w-full border-collapse font-mono text-[13px]">
              <thead>
                <tr className="text-left text-[var(--ink)]/55">
                  <th className="px-4 py-3 text-[11px] uppercase tracking-wider">Threshold</th>
                  <th className="px-4 py-3 text-right text-[11px] uppercase tracking-wider">Cost cut</th>
                  <th className="px-4 py-3 text-right text-[11px] uppercase tracking-wider">Catastrophic</th>
                </tr>
              </thead>
              <tbody>
                {SWEEP.map((s) => (
                  <tr key={s.t} className={`border-t border-[var(--ink)]/10 ${s.t.includes("0.8") ? "text-[var(--ink)]" : "text-[var(--ink)]/60"}`}>
                    <td className="px-4 py-3.5">{s.t}{s.t.includes("0.8") && <Sparkle className="ml-2 inline-block h-3 w-3 align-middle" color="var(--strawberry)" />}{s.t.includes("0.8") && <span className="ml-1.5 font-sans text-[11px] text-[var(--strawberry)]">default</span>}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{s.cost}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{s.cat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
        <p className="mt-8 max-w-3xl font-mono text-[11px] leading-relaxed text-[var(--ink)]/55">
          Note on the verifier: AUROC 0.961 / ECE 0.016 are held-out eval figures, where the verifier scores against a reference answer. In production the path is reference-free; treat 0.961 as an eval result on RouterBench, not a live deployed accuracy.
        </p>
      </Section>
    </RedesignLayout>
  );
}
