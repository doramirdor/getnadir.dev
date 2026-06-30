/**
 * Nadir blueprint redesign — Docs / quickstart page (/redesign/docs).
 */
import type { ReactNode } from "react";
import { RedesignLayout, PageHero, Section, SectionHead, Panel } from "@/components/brand/redesign";
import { DocCheck, RoutePath, Sparkle } from "@/components/brand/motifs";

const STEPS = [
  { n: "01", title: "Grab a key", body: "Create a Nadir API key from the dashboard. Free and open-source if you self-host." },
  { n: "02", title: "Point your base URL", body: "Swap your provider base URL for https://api.getnadir.com/v1. Everything else stays the same." },
  { n: "03", title: "Set model to auto", body: "Send model: \"auto\" and Nadir picks the leanest model that can answer, then verifies it." },
];

const GET = [
  { k: "OpenAI-compatible", v: "Drop-in for the OpenAI SDK, LangChain, LlamaIndex, or raw HTTP. No rewrite." },
  { k: "Bring your own keys", v: "Your Anthropic, OpenAI, and Google keys stay in your environment. Nadir routes; it never holds your spend." },
  { k: "Automatic failover", v: "If a provider errors, Nadir retries against a healthy peer on your configured chain. Your app stays up." },
  { k: "Per-key quality floor", v: "Pin any API key above a quality threshold and that traffic always runs on your premium model." },
];

function Code({ children }: { children: ReactNode }) {
  return (
    <Panel className="p-5" tint="bg-[var(--ink)]">
      <pre className="overflow-x-auto font-mono text-[12.5px] leading-relaxed text-[var(--shell)]">{children}</pre>
    </Panel>
  );
}
const C = ({ children }: { children: ReactNode }) => <span className="text-[var(--shell)] opacity-45">{children}</span>;
const K = ({ children }: { children: ReactNode }) => <span className="text-[var(--strawberry)]">{children}</span>;
const S = ({ children }: { children: ReactNode }) => <span className="text-[var(--seaglass)]">{children}</span>;

export default function Docs() {
  return (
    <RedesignLayout
      title="Nadir Docs · Two lines to switch"
      description="Nadir is OpenAI-compatible. Point your base URL at api.getnadir.com, set model to auto, keep your own keys. Routes across Anthropic, OpenAI, and Google with automatic failover."
      path="/redesign/docs"
      track="brand_redesign_docs"
    >
      <PageHero
        eyebrow="Docs · Quickstart"
        title="Two lines to"
        accent="switch."
        sub={<>Nadir speaks the OpenAI API. Change your base URL, set the model to <span className="font-mono text-[14px] text-[var(--ink)]">auto</span>, and keep your own keys. No SDK swap, no lock-in, no prompt rewrite.</>}
        hand="no rewrite, no lock-in"
        motif={<DocCheck className="h-40 w-44 opacity-90" color="var(--ink)" />}
      />

      {/* quickstart */}
      <Section rule={false}>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <SectionHead eyebrow="Quickstart" title="Change two lines, ship." />
            <ol className="mt-8 space-y-6">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="font-editorial text-[22px] text-[var(--strawberry)]">{s.n}</span>
                  <div>
                    <div className="eyebrow text-[var(--ink)]">{s.title}</div>
                    <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[var(--ink)]/65">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <Code>
{`from openai import OpenAI

client = OpenAI(
    `}<K>base_url</K>=<S>"https://api.getnadir.com/v1"</S>,{`  `}<C>{`# ← point here`}</C>{`
    api_key=NADIR_KEY,
)

resp = client.chat.completions.create(
    `}<K>model</K>=<S>"auto"</S>,{`                       `}<C>{`# ← Nadir routes`}</C>{`
    messages=[{"role": "user",
               "content": "Summarise this thread."}],
)
`}
          </Code>
        </div>
        <div className="mt-8 flex items-center gap-3">
          <RoutePath animate className="h-10 w-40 opacity-70" color="var(--strawberry)" />
          <span className="font-hand text-[16px] text-[var(--ink)]/60">that's the whole change.</span>
        </div>
      </Section>

      {/* what you get */}
      <Section tint="bg-[var(--shell-deep)]">
        <SectionHead eyebrow="What you get" title="A gateway, not a cage." />
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {GET.map((g) => (
            <Panel key={g.k} className="p-6">
              <div className="flex items-start gap-2">
                <Sparkle className="mt-1 h-3.5 w-3.5 shrink-0" color="var(--strawberry)" />
                <div>
                  <h3 className="font-editorial text-[20px] text-[var(--ink)]">{g.k}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink)]/65">{g.v}</p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
        <p className="mt-8 font-mono text-[11px] text-[var(--ink)]/55">
          Routes across Anthropic (Claude), OpenAI (GPT), and Google (Gemini) out of the box. Custom tiers and routing rules work with any OpenAI-compatible provider.
        </p>
      </Section>
    </RedesignLayout>
  );
}
