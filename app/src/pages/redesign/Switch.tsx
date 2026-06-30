/**
 * Nadir blueprint redesign — Switch / migration (/switch).
 */
import { Link } from "react-router-dom";
import { RedesignLayout, PageHero, Section, SectionHead, Panel } from "@/components/brand/redesign";
import { RoutePath, Sparkle } from "@/components/brand/motifs";

const STEPS = [
  { n: "01", t: "Keep your code", b: "Same OpenAI SDK, same message format, same response shape. Nothing in your app changes except a URL." },
  { n: "02", t: "Point at Nadir", b: "Swap the base URL to https://api.getnadir.com/v1 and set model to auto. Your provider keys stay yours." },
  { n: "03", t: "Watch the bill drop", b: "The dashboard shows the real delta against always-Opus, per request. Roll back any time by changing the URL back." },
];

export default function Switch() {
  return (
    <RedesignLayout
      title="Nadir · Switch in two lines"
      description="Move your Claude, GPT, or Gemini traffic onto Nadir without a rewrite. Change the base URL, set model to auto, keep your keys."
      path="/switch"
      track="brand_redesign_switch"
    >
      <PageHero
        eyebrow="Switch"
        title="Move over in"
        accent="two lines."
        sub={<>You don't migrate to Nadir, you point at it. Same SDK, same prompts, same response shape. Change the base URL, keep your own keys, and route from day one.</>}
        hand="no rewrite, fully reversible"
        motif={<RoutePath animate className="h-24 w-52 opacity-85" color="var(--strawberry)" />}
      />

      <Section rule={false}>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionHead eyebrow="How to switch" title="Three steps, zero risk." />
            <ol className="mt-8 space-y-6">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="font-editorial text-[22px] text-[var(--strawberry)]">{s.n}</span>
                  <div>
                    <div className="eyebrow text-[var(--ink)]">{s.t}</div>
                    <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[var(--ink)]/65">{s.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Panel className="p-5" tint="bg-[var(--ink)]">
            <pre className="overflow-x-auto font-mono text-[12.5px] leading-relaxed text-[var(--shell)]">{`- base_url = "https://api.openai.com/v1"
+ base_url = "https://api.getnadir.com/v1"

- model = "gpt-4o"
+ model = "auto"`}</pre>
          </Panel>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link to="/auth" className="btn-rect press no-underline">Start routing <Sparkle className="twinkle h-3 w-3" color="var(--shell)" /></Link>
          <Link to="/docs" className="eyebrow text-[var(--ink)] no-underline ed-link">Read the docs →</Link>
        </div>
      </Section>
    </RedesignLayout>
  );
}
