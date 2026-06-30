/**
 * Nadir blueprint redesign — Product Hunt launch landing (/producthunt).
 */
import { Link } from "react-router-dom";
import { RedesignLayout, PageHero, Section, StatBig, Panel } from "@/components/brand/redesign";
import { CompassBurst, Sparkle, SignalDots } from "@/components/brand/motifs";

const POINTS = [
  { k: "Cut cost, not accuracy", v: "Route every prompt to the leanest capable model, verified before it ships." },
  { k: "Two-line drop-in", v: "OpenAI-compatible. Change the base URL, set model to auto, keep your keys." },
  { k: "Proven on held-out evals", v: "60% lower cost, 98% of always-Opus quality on 11,420 RouterBench triples." },
];

export default function ProductHunt() {
  return (
    <RedesignLayout
      title="Nadir · Live on Product Hunt"
      description="Nadir is live on Product Hunt. The lowest viable model, verified. Cut your AI costs without cutting accuracy."
      path="/producthunt"
      track="brand_redesign_producthunt"
    >
      <PageHero
        eyebrow="Hello, hunters"
        title="We're live on"
        accent="Product Hunt."
        sub={<>Nadir routes every request to the smallest model that can answer with confidence, verifies the result, and escalates only when needed. If it's launch day, an upvote means the world.</>}
        hand="thank you for the support"
        motif={<CompassBurst animate className="h-32 w-32 opacity-90" color="var(--terracotta)" />}
      />

      <Section rule={false}>
        <div className="flex flex-wrap gap-x-16 gap-y-8">
          <StatBig v="60" unit="%" k="Lower cost" color="var(--strawberry)" />
          <StatBig v="98" unit="%" k="Quality kept" />
          <StatBig v="2" k="Lines to switch" color="var(--sky)" />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {POINTS.map((p) => (
            <Panel key={p.k} className="p-6">
              <div className="flex items-start gap-2">
                <Sparkle className="mt-1 h-3.5 w-3.5 shrink-0" color="var(--strawberry)" />
                <div>
                  <h3 className="font-editorial text-[19px] text-[var(--ink)]">{p.k}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink)]/65">{p.v}</p>
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link to="/auth" className="btn-rect press no-underline">Get early access <Sparkle className="twinkle h-3 w-3" color="var(--shell)" /></Link>
          <Link to="/redesign/benchmarks" className="eyebrow text-[var(--ink)] no-underline ed-link">See the benchmarks →</Link>
          <SignalDots className="ml-auto hidden h-12 w-20 opacity-70 sm:block" />
        </div>
      </Section>
    </RedesignLayout>
  );
}
