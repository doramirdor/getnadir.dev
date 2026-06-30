/**
 * Nadir blueprint redesign — Self-hosted page (/redesign/self-hosted).
 */
import { Link } from "react-router-dom";
import { RedesignLayout, PageHero, Section, SectionHead, Panel } from "@/components/brand/redesign";
import { CompassBurst, Sparkle } from "@/components/brand/motifs";
import { SelfHostArt } from "@/components/brand/illustrations";

const FEATURES = [
  { k: "Air-gapped ready", v: "Run the full router and verifier inside your perimeter. Nothing leaves the building." },
  { k: "Private routing", v: "Your provider keys, your network, your logs. Nadir never sees plaintext you don't send it." },
  { k: "MIT open source", v: "The core router, NadirClaw, is MIT licensed. Read it, fork it, audit every routing decision." },
  { k: "Usage-based licensing", v: "Pro features license by usage, not seats. Pay for what you route, nothing else." },
  { k: "Enterprise support", v: "SLAs, deployment help, and a direct line for teams running Nadir in production." },
  { k: "Same intelligence", v: "The same verifier-gated cascade architecture as the hosted service. Self-hosting costs you nothing in capability." },
];

export default function SelfHosted() {
  return (
    <RedesignLayout
      title="Nadir Self-hosted · Your data, your rules, same routing"
      description="Deploy the full Nadir router and verifier inside your own perimeter. Air-gapped ready, private routing with your keys, MIT open-source core (NadirClaw), usage-based licensing."
      path="/redesign/self-hosted"
      track="brand_redesign_selfhosted"
    >
      <PageHero
        eyebrow="Self-hosted"
        title="Your data."
        accent="Your rules."
        sub={<>Deploy the same cascade and verifier inside your own infrastructure. Your models, your keys, your network. The open-source core is MIT licensed, so you can read every routing decision Nadir makes.</>}
        hand="↙ bring it home"
        motif={<SelfHostArt className="h-56 w-72 opacity-95" />}
      />

      {/* features */}
      <Section rule={false}>
        <SectionHead eyebrow="Why self-host" title="Same routing intelligence, none of the exposure." />
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Panel key={f.k} className="p-6">
              <div className="flex items-start gap-2">
                <CompassBurst className="mt-0.5 h-4 w-4 shrink-0" color="var(--terracotta)" />
                <div>
                  <h3 className="font-editorial text-[20px] text-[var(--ink)]">{f.k}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink)]/65">{f.v}</p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      </Section>

      {/* open source core */}
      <Section tint="bg-[var(--shell-deep)]">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <SectionHead eyebrow="Open-source core" title="Start in one command." note="MIT licensed" />
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--ink)]/70">
              NadirClaw is the free, self-hosted router: a local CLI and FastAPI server with the binary / cascade classifier, four-tier routing, and context optimization. No account, no Supabase, local-only storage.
            </p>
            <ul className="mt-7 space-y-2.5">
              {["4-tier routing, on your hardware", "SQLite + JSONL, local only", "Custom rules in YAML", "OCR + context trimming included"].map((l) => (
                <li key={l} className="flex items-center gap-2.5 text-[14px] text-[var(--ink)]">
                  <Sparkle className="h-3.5 w-3.5 shrink-0" color="var(--strawberry)" />{l}
                </li>
              ))}
            </ul>
          </div>
          <Panel className="p-5" tint="bg-[var(--ink)]">
            <pre className="overflow-x-auto font-mono text-[12.5px] leading-relaxed text-[var(--shell)]/90">{`$ pip install nadirclaw

$ nadir serve --port 8000
  ✦ binary classifier loaded (10 ms)
  ✦ 4-tier router ready
  ✦ listening on http://localhost:8000

$ curl localhost:8000/v1/chat/completions \\
    -d '{"model":"auto","messages":[...]}'`}</pre>
          </Panel>
        </div>
      </Section>

      {/* CTA */}
      <Section>
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <SectionHead eyebrow="Deploy" title="Bring Nadir to your stack." />
          <div className="flex flex-wrap items-center gap-5">
            <Link to="/self-host" className="btn-rect press no-underline">Deploy self-hosted</Link>
            <Link to="/redesign/docs" className="eyebrow text-[var(--ink)] no-underline ed-link">Read the docs →</Link>
          </div>
        </div>
      </Section>
    </RedesignLayout>
  );
}
