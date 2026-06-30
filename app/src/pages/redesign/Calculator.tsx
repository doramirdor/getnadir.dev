/**
 * Nadir blueprint redesign — Savings calculator (/calculator).
 * Canonical model: ~60% lower cost vs always-Opus; hosted fee = 25% of the
 * first $2,000 of monthly savings, 10% above.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RedesignLayout, PageHero, Section, Panel } from "@/components/brand/redesign";
import { DataTicks, Sparkle } from "@/components/brand/motifs";

const usd = (n: number) => "$" + Math.round(n).toLocaleString();

export default function Calculator() {
  const [spend, setSpend] = useState(5000);
  const m = useMemo(() => {
    const gross = spend * 0.6;
    const newBill = spend - gross;
    const fee = 0.25 * Math.min(gross, 2000) + 0.10 * Math.max(0, gross - 2000);
    const net = gross - fee;
    return { gross, newBill, fee, net, annual: net * 12, pct: gross > 0 ? net / gross : 0 };
  }, [spend]);

  return (
    <RedesignLayout
      title="Nadir · Savings calculator"
      description="Estimate what Nadir saves on your monthly LLM spend, net of the hosted savings fee."
      path="/calculator"
      track="brand_redesign_calculator"
    >
      <PageHero
        eyebrow="Calculator"
        title="What would Nadir"
        accent="save you?"
        sub={<>Drag in your monthly model spend. We apply the measured ~60% cost reduction, then subtract the hosted savings fee, so the number you see is what you actually keep.</>}
        hand="net, not gross"
        motif={<DataTicks className="h-16 w-44 opacity-85" color="var(--ink)" />}
      />

      <Section rule={false}>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          {/* input */}
          <div>
            <span className="eyebrow text-[var(--ink)]/60">Your monthly LLM spend</span>
            <div className="mt-3 font-editorial text-[clamp(40px,6vw,68px)] leading-none text-[var(--ink)] tabular-nums">{usd(spend)}</div>
            <input
              type="range" min={500} max={100000} step={500} value={spend}
              onChange={(e) => setSpend(Number(e.target.value))}
              className="mt-6 w-full accent-[var(--terracotta)]"
              aria-label="Monthly LLM spend"
            />
            <div className="mt-2 flex justify-between font-mono text-[11px] text-[var(--ink)]/45">
              <span>$500</span><span>$100k / mo</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {[2000, 5000, 20000, 50000].map((v) => (
                <button key={v} onClick={() => setSpend(v)} className={`rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors ${spend === v ? "border-[var(--terracotta)] text-[var(--terracotta)]" : "border-[var(--line)] text-[var(--ink)]/60 hover:text-[var(--ink)]"}`}>{usd(v)}</button>
              ))}
            </div>
          </div>

          {/* result */}
          <Panel className="p-7">
            <span className="eyebrow text-[var(--ink)]/55">Estimate</span>
            <dl className="mt-4 space-y-2.5 font-mono text-[13px]">
              {[
                ["Today, always-Opus", usd(spend)],
                ["With Nadir routing", usd(m.newBill)],
                ["Gross saved", usd(m.gross)],
                ["Hosted savings fee", "-" + usd(m.fee)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-dashed border-[var(--ink)]/15 pb-2">
                  <dt className="text-[var(--ink)]/60">{k}</dt><dd className="tabular-nums text-[var(--ink)]">{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between pt-1">
                <dt className="text-[var(--ink)]">You keep / month</dt>
                <dd className="font-sans text-[20px] font-semibold tabular-nums text-[var(--strawberry)]">{usd(m.net)}</dd>
              </div>
            </dl>
            <div className="mt-5 flex items-center justify-between border-t border-[var(--ink)]/15 pt-4">
              <span className="font-hand text-[18px] text-[var(--ink)]/65">that's {usd(m.annual)} a year</span>
              <Sparkle className="h-5 w-5" color="var(--strawberry)" />
            </div>
          </Panel>
        </div>

        <p className="mt-8 max-w-2xl font-mono text-[11px] leading-relaxed text-[var(--ink)]/55">
          Estimate only. The ~60% figure is measured against an always-Opus 4.6 baseline on held-out RouterBench; your savings depend on your prompt mix. BYOK tiers pay no fee. See the{" "}
          <Link to="/redesign/benchmarks" className="text-[var(--ink)] underline decoration-[var(--strawberry)] underline-offset-2">benchmarks</Link> and{" "}
          <Link to="/pricing" className="text-[var(--ink)] underline decoration-[var(--strawberry)] underline-offset-2">pricing</Link>.
        </p>
      </Section>
    </RedesignLayout>
  );
}
