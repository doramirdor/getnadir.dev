/**
 * Nadir blueprint redesign — Compare (/compare, /compare/:competitor).
 */
import { useParams, Link } from "react-router-dom";
import { RedesignLayout, PageHero, Section, SectionHead, Panel } from "@/components/brand/redesign";
import { CompassBurst, VerifierSeal, Sparkle } from "@/components/brand/motifs";

const RIVALS: Record<string, { name: string; they: string }> = {
  openrouter: { name: "OpenRouter", they: "a catalogue and a fallback chain. You still pick the tier and eat a wrong call." },
  notdiamond: { name: "Not Diamond", they: "a one-shot meta-classifier that routes from the prompt alone, then ships whatever the chosen model returns." },
  martian: { name: "Martian", they: "prompt-only routing with no check on the answer before it reaches you." },
  portkey: { name: "Portkey", they: "a gateway and observability layer. Useful plumbing, but you choose the model." },
};

const MATRIX = [
  { k: "Routes to the cheapest capable model", nadir: true, them: "Sometimes" },
  { k: "Verifies the answer before shipping", nadir: true, them: "No" },
  { k: "Escalates automatically on a weak answer", nadir: true, them: "No" },
  { k: "Per-request cost / quality receipt", nadir: true, them: "Partial" },
  { k: "OpenAI-compatible, BYOK", nadir: true, them: "Usually" },
  { k: "Self-hostable, MIT core", nadir: true, them: "Rarely" },
];

export default function Compare() {
  const { competitor } = useParams();
  const rival = competitor ? RIVALS[competitor.toLowerCase()] : undefined;

  return (
    <RedesignLayout
      title={rival ? `Nadir vs ${rival.name}` : "Nadir · Compare"}
      description="How Nadir's verifier-gated cascade differs from prompt-only routers and gateways: it reads the answer before it ships."
      path={rival ? `/compare/${competitor}` : "/compare"}
      track="brand_redesign_compare"
    >
      <PageHero
        eyebrow={rival ? `Nadir vs ${rival.name}` : "Compare"}
        title={rival ? `Nadir, or` : "Most routers guess."}
        accent={rival ? rival.name + "." : "Nadir checks."}
        sub={rival
          ? <>{rival.name} is {rival.they} Nadir reads the cheap model's answer with a calibrated verifier before it ships, so a wrong route is caught and escalated, not absorbed by your users.</>
          : <>The wedge is simple. Prompt-only routers pick a model and hope. Nadir picks the leanest model, then verifies the answer before you ever see it, and escalates only when it falls short.</>}
        hand="verified, not assumed"
        motif={<VerifierSeal className="seal-spin h-44 w-44 opacity-90" color="var(--ink)" />}
      />

      <Section rule={false}>
        <SectionHead eyebrow="Head to head" title={rival ? `Nadir vs ${rival.name}` : "Nadir vs the field."} />
        <Panel className="mt-8 p-2" tint="bg-[var(--paper)]">
          <table className="w-full border-collapse font-mono text-[13px]">
            <thead>
              <tr className="text-left text-[var(--ink)]/55">
                <th className="px-4 py-3 text-[11px] uppercase tracking-wider">Capability</th>
                <th className="px-4 py-3 text-center text-[11px] uppercase tracking-wider text-[var(--strawberry)]">Nadir</th>
                <th className="px-4 py-3 text-center text-[11px] uppercase tracking-wider">{rival ? rival.name : "Typical router"}</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((r) => (
                <tr key={r.k} className="border-t border-[var(--ink)]/10">
                  <td className="px-4 py-3.5 font-sans text-[14px] text-[var(--ink)]/80">{r.k}</td>
                  <td className="px-4 py-3.5 text-center">{r.nadir ? <CompassBurst className="mx-auto h-4 w-4" color="var(--terracotta)" /> : "—"}</td>
                  <td className="px-4 py-3.5 text-center text-[var(--ink)]/55">{r.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link to="/auth" className="btn-rect press no-underline">Start routing <Sparkle className="twinkle h-3 w-3" color="var(--shell)" /></Link>
          <Link to="/redesign/benchmarks" className="eyebrow text-[var(--ink)] no-underline ed-link">See the benchmarks →</Link>
        </div>
      </Section>
    </RedesignLayout>
  );
}
