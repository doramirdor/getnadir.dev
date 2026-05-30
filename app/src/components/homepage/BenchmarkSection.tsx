import { SignupDialog } from "@/components/marketing/SignupDialog";

type Row = {
  strategy: string;
  cost: string;
  catastrophic: string;
  quality: string;
  highlighted?: boolean;
};

const ROWS: Row[] = [
  { strategy: "Always-Opus (no router)", cost: "12.0x", catastrophic: "0%", quality: "100%" },
  { strategy: "Prompt-only classifier (wide_deep_asym alone)", cost: "4.8x", catastrophic: "3.4%", quality: "96.6%" },
  { strategy: "Always-Haiku (cheapest)", cost: "1.0x", catastrophic: "26.0%", quality: "74.0%" },
  { strategy: "Nadir verifier-gated cascade", cost: "4.7x", catastrophic: "1.7%", quality: "98.3%", highlighted: true },
];

export const BenchmarkSection = () => {
  return (
    <section id="benchmark" className="py-20 md:py-24 scroll-mt-16">
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
        {/* Headline + narrative */}
        <div className="max-w-[820px] mb-14 md:mb-16">
          <p className="text-[12px] text-[#028a3e] uppercase tracking-[0.12em] font-semibold mb-4">
            The benchmark
          </p>
          <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] m-0 mb-6 text-[#1d1d1f] leading-[1.05]">
            The first router benchmarked on response quality, not prompt prediction.
          </h2>
          <p className="text-[17px] md:text-[19px] text-[#424245] m-0 mb-4 leading-[1.55] tracking-[-0.008em]">
            Every other router picks a model from the prompt alone. We measured how well that works.
          </p>
          <p className="text-[17px] md:text-[19px] text-[#424245] m-0 leading-[1.55] tracking-[-0.008em]">
            On 11,420 held-out RouterBench triples,
            <span className="text-[#1d1d1f] font-medium"> Nadir preserves 98% of always-Opus quality at 40% of the cost</span>
            {" "}by reading the cheap model's answer first and escalating only when quality fails the bar. Verifier AUROC 0.961, calibration ECE 0.016.
          </p>
        </div>

        {/* Comparison table */}
        <div className="bg-white border border-black/[0.08] rounded-[18px] overflow-hidden">
          <div className="flex items-center justify-between px-5 md:px-7 py-4 md:py-5 border-b border-black/[0.06] bg-[#fbfbfd]">
            <span className="text-[12px] text-[#1d1d1f] font-semibold tracking-[-0.005em]">
              RouterBench held-out, n=11,420
            </span>
            <span className="hidden sm:inline text-[11px] text-[#6e6e73] tracking-[-0.005em] font-mono">
              verifier/eval.py
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10.5px] text-[#86868b] uppercase tracking-[0.08em] font-semibold border-b border-black/[0.06]">
                  <th className="px-5 md:px-7 py-3.5 font-semibold">Strategy</th>
                  <th className="px-3 md:px-5 py-3.5 font-semibold text-right">Cost</th>
                  <th className="px-3 md:px-5 py-3.5 font-semibold text-right">Catastrophic</th>
                  <th className="px-5 md:px-7 py-3.5 font-semibold text-right">Quality preserved</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr
                    key={r.strategy}
                    className="border-b border-black/[0.04] last:border-b-0"
                    style={{
                      background: r.highlighted ? "rgba(48,209,88,0.06)" : "transparent",
                    }}
                  >
                    <td className="px-5 md:px-7 py-4 md:py-4.5">
                      <span
                        className={`text-[14px] md:text-[15px] tracking-[-0.008em] ${
                          r.highlighted ? "text-[#1d1d1f] font-semibold" : "text-[#424245] font-medium"
                        }`}
                      >
                        {r.strategy}
                      </span>
                    </td>
                    <td
                      className="px-3 md:px-5 py-4 md:py-4.5 text-right font-mono tabular-nums text-[14px] md:text-[15px]"
                      style={{ color: r.highlighted ? "#028a3e" : "#1d1d1f", fontWeight: r.highlighted ? 600 : 500 }}
                    >
                      {r.cost}
                    </td>
                    <td
                      className="px-3 md:px-5 py-4 md:py-4.5 text-right font-mono tabular-nums text-[14px] md:text-[15px]"
                      style={{ color: r.highlighted ? "#028a3e" : "#1d1d1f", fontWeight: r.highlighted ? 600 : 500 }}
                    >
                      {r.catastrophic}
                    </td>
                    <td
                      className="px-5 md:px-7 py-4 md:py-4.5 text-right font-mono tabular-nums text-[14px] md:text-[15px]"
                      style={{ color: r.highlighted ? "#028a3e" : "#1d1d1f", fontWeight: r.highlighted ? 600 : 500 }}
                    >
                      {r.quality}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 md:px-7 py-4 md:py-5 border-t border-black/[0.06] bg-[#fbfbfd]">
            <p className="text-[13px] text-[#424245] m-0 tracking-[-0.005em]">
              <span className="text-[#1d1d1f] font-semibold">60% cost reduction. 98% quality preserved.</span>
              {" "}11,420 triples, no prompt seen in both train and test. Reproducible from the open-source eval.
            </p>
          </div>
        </div>

        {/*
          Benchmark Recognition — third-party leaderboard credibility band.
          Visually distinct from the production-truth table above: dark
          framing, "industry recognition" eyebrow, cards instead of a table.
          The 60% / 98% numbers above remain the headline customer promise;
          this band exists to answer "is anyone else measuring this?".
        */}
        <div className="mt-20 md:mt-24">
          <div className="max-w-[820px] mb-10 md:mb-12">
            <p className="text-[12px] text-[#028a3e] uppercase tracking-[0.12em] font-semibold mb-4">
              On the leaderboard
            </p>
            <h3 className="text-[32px] md:text-[44px] font-semibold tracking-[-0.032em] m-0 mb-5 text-[#1d1d1f] leading-[1.08]">
              The numbers hold up on someone else's scorer.
            </h3>
            <p className="text-[16px] md:text-[18px] text-[#424245] m-0 leading-[1.55] tracking-[-0.008em]">
              Internal evals are easy to write to. So we ran Nadir against RouterArena's official scorer and audited the training data for contamination before publishing. Both held up.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {/* RouterArena */}
            <div className="rounded-[18px] bg-[#1d1d1f] text-white p-7 md:p-8 flex flex-col">
              <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-[#86868b] m-0 mb-5">
                RouterArena
              </p>
              <div className="text-[44px] md:text-[52px] font-semibold tracking-[-0.035em] leading-[0.95] tabular-nums mb-3">
                0.7118
              </div>
              <p className="text-[14px] md:text-[15px] text-[#d2d2d7] m-0 leading-[1.5] tracking-[-0.005em] mb-5">
                arena_score on the official scorer, full split (n=8,400). Projects into the public leaderboard's top 5, ahead of Auto Router (70.05), vLLM-SR (67.23), and Not Diamond (57.29).
              </p>
              <p className="text-[12px] text-[#86868b] m-0 mt-auto tracking-[-0.005em] font-mono">
                eval/routerarena/rescoring/
              </p>
            </div>

            {/* ND head-to-head */}
            <div className="rounded-[18px] border border-black/[0.08] bg-white p-7 md:p-8 flex flex-col">
              <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-[#86868b] m-0 mb-5">
                Head-to-head vs Not Diamond
              </p>
              <div className="text-[44px] md:text-[52px] font-semibold tracking-[-0.035em] leading-[0.95] tabular-nums mb-3 text-[#028a3e]">
                92.1<span className="text-[28px] md:text-[32px] text-[#86868b]"> vs 27.0</span>
              </div>
              <p className="text-[14px] md:text-[15px] text-[#424245] m-0 leading-[1.5] tracking-[-0.005em] mb-5">
                Routing accuracy on RouterBench held-out (n=3,313, GPT-3.5 / GPT-4 pair). Same prompts, same labels, same scorer. The verifier reads the answer; the one-shot router does not.
              </p>
              <p className="text-[12px] text-[#86868b] m-0 mt-auto tracking-[-0.005em] font-mono">
                verifier/reports/head_to_head/
              </p>
            </div>

            {/* Contamination audit */}
            <div className="rounded-[18px] border border-black/[0.08] bg-white p-7 md:p-8 flex flex-col">
              <p className="text-[11px] uppercase tracking-[0.1em] font-semibold text-[#86868b] m-0 mb-5">
                Contamination audit
              </p>
              <div className="text-[44px] md:text-[52px] font-semibold tracking-[-0.035em] leading-[0.95] tabular-nums mb-3">
                0 <span className="text-[20px] md:text-[22px] text-[#86868b] font-medium">overlap</span>
              </div>
              <p className="text-[14px] md:text-[15px] text-[#424245] m-0 leading-[1.5] tracking-[-0.005em] mb-5">
                Zero prompt overlap between Nadir training corpora and the RouterArena evaluation splits. Audited and certified before publication, so the leaderboard score is not memorization.
              </p>
              <p className="text-[12px] text-[#86868b] m-0 mt-auto tracking-[-0.005em] font-mono">
                eval/routerarena/reports/
              </p>
            </div>
          </div>

          <p className="text-[13px] text-[#6e6e73] mt-6 md:mt-7 tracking-[-0.005em]">
            RouterArena methodology and full threshold sweep are reproducible from the open-source eval harness. The 60% / 98% numbers above are the production promise; the leaderboard numbers are the outside check.
          </p>
        </div>

        {/* Conversion CTA below the table */}
        <div className="mt-14 md:mt-16 flex flex-col items-center text-center">
          <p className="text-[20px] md:text-[24px] text-[#1d1d1f] font-semibold tracking-[-0.018em] m-0 mb-5 max-w-[640px] leading-[1.25]">
            Cut your bill by 60%. Keep 98% of always-Opus quality. Read the eval, not the marketing.
          </p>
          <SignupDialog ctaLabel="start_free" ctaLocation="benchmark">
            <button
              type="button"
              className="inline-flex items-center px-7 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out tracking-[-0.01em] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
            >
              Start free, first month on us
            </button>
          </SignupDialog>
          <p className="mt-3 text-[13px] text-[#6e6e73] tracking-[-0.005em]">
            No card to start. Bring your own keys. Cancel anytime.
          </p>
        </div>
      </div>
    </section>
  );
};
