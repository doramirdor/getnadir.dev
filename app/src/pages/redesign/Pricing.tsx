/**
 * Nadir blueprint redesign — Pricing page (/redesign/pricing).
 * Real model: no base fee; variable savings fee 25% of first $2k / 10% above.
 */
import { Link } from "react-router-dom";
import { RedesignLayout, PageHero, Section, SectionHead, Panel } from "@/components/brand/redesign";
import { Sparkle, CompassBurst, VerifierSeal } from "@/components/brand/motifs";

const PLANS = [
  {
    name: "Open source",
    price: "$0",
    unit: "self-hosted, forever",
    blurb: "The MIT-licensed core. Run it on your own hardware with no account.",
    feats: ["4-tier intelligent routing", "Context optimization", "CLI dashboard", "Unlimited requests", "Bring your own keys", "Community support"],
    cta: "Self-host it", to: "/redesign/self-hosted", primary: false,
  },
  {
    name: "Hosted",
    price: "No base fee",
    unit: "you pay a slice of the savings",
    blurb: "The full router, verifier, and dashboard, managed. You only pay when Nadir cuts your bill.",
    feats: ["Verifier-gated cascade", "Semantic dedup + cache", "Web dashboard & analytics", "Automatic failover", "BYOK on every tier", "Priority support"],
    cta: "Get early access", to: "/auth", primary: true,
  },
];

const FEE = [
  { band: "First $2,000 saved / month", rate: "25%" },
  { band: "Every dollar above $2,000", rate: "10%" },
];

export default function Pricing() {
  return (
    <RedesignLayout
      title="Nadir Pricing · Pay only when we save you money"
      description="No base fee. On the hosted plan you pay a variable savings fee only when Nadir cuts your bill: 25% of the first $2,000 of monthly savings, 10% above. BYOK on every tier. The open-source core is free."
      path="/redesign/pricing"
      track="brand_redesign_pricing"
    >
      <PageHero
        eyebrow="Pricing"
        title="Pay only when we"
        accent="save you money."
        sub={<>No base fee, no per-seat tax. On the hosted plan you pay a small slice of the savings, and only when Nadir actually cuts your bill. If it saves you nothing, you pay nothing.</>}
        hand="no savings, no bill"
        motif={<VerifierSeal className="seal-spin h-44 w-44 opacity-90" color="var(--ink)" />}
      />

      {/* plans */}
      <Section rule={false}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {PLANS.map((p) => (
            <Panel key={p.name} className="flex flex-col p-8" tint={p.primary ? "bg-[var(--strawberry)]/[0.10]" : "bg-[var(--paper)]/60"}>
              <div className="flex items-center justify-between">
                <span className="eyebrow text-[var(--ink)]/60">{p.name}</span>
                {p.primary && <Sparkle className="twinkle h-4 w-4" color="var(--strawberry)" />}
              </div>
              <div className="mt-4 font-editorial text-[clamp(34px,4vw,48px)] leading-none text-[var(--ink)]">{p.price}</div>
              <div className="mt-2 font-mono text-[11px] uppercase tracking-wider text-[var(--ink)]/55">{p.unit}</div>
              <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-[var(--ink)]/65">{p.blurb}</p>
              <ul className="mt-6 space-y-2.5">
                {p.feats.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[13.5px] text-[var(--ink)]">
                    <CompassBurst className="h-3.5 w-3.5 shrink-0" color="var(--terracotta)" />{f}
                  </li>
                ))}
              </ul>
              <Link to={p.to} className={`mt-8 no-underline ${p.primary ? "btn-rect press" : "eyebrow text-[var(--ink)] ed-link self-start"}`}>
                {p.cta}{p.primary ? null : " →"}
              </Link>
            </Panel>
          ))}
        </div>
      </Section>

      {/* how the fee works */}
      <Section tint="bg-[var(--shell-deep)]">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <SectionHead eyebrow="How the fee works" title="A cut of what you save, nothing else." note="we win when you do" />
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--ink)]/70">
              Nadir measures each routed request against what an always-Opus baseline would have cost. The gap is your savings. The fee is a slice of that gap, so we only win when you do.
            </p>
            <Panel className="mt-7 p-2" tint="bg-[var(--paper)]">
              <table className="w-full border-collapse font-mono text-[13px]">
                <tbody>
                  {FEE.map((f) => (
                    <tr key={f.band} className="border-b border-[var(--ink)]/10 last:border-b-0">
                      <td className="px-4 py-3.5 text-[var(--ink)]/75">{f.band}</td>
                      <td className="px-4 py-3.5 text-right text-[15px] font-semibold text-[var(--strawberry)]">{f.rate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          {/* worked example */}
          <Panel className="p-7">
            <span className="eyebrow text-[var(--ink)]/55">Worked example</span>
            <p className="mt-3 font-hand text-[20px] text-[var(--ink)]">Say Nadir saves you $8,000 this month.</p>
            <dl className="mt-5 space-y-2.5 font-mono text-[13px]">
              {[
                ["Gross saved", "$8,000"],
                ["Fee · 25% of first $2,000", "$500"],
                ["Fee · 10% of next $6,000", "$600"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-dashed border-[var(--ink)]/15 pb-2">
                  <dt className="text-[var(--ink)]/60">{k}</dt><dd className="tabular-nums text-[var(--ink)]">{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between pt-1">
                <dt className="text-[var(--ink)]">You keep</dt><dd className="text-[16px] font-semibold tabular-nums text-[var(--strawberry)]">$6,900</dd>
              </div>
            </dl>
            <span className="mt-5 block font-hand text-[16px] text-[var(--ink)]/60">you net 86% of the savings ↑</span>
          </Panel>
        </div>
        <p className="mt-8 font-mono text-[11px] text-[var(--ink)]/55">
          BYOK is supported on every tier, including free. Your provider keys stay in your environment. No subscription, cancel any time.
        </p>
      </Section>
    </RedesignLayout>
  );
}
