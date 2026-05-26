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
  { strategy: "RouteLLM-style classifier", cost: "11.6x", catastrophic: "7.8%", quality: "92.2%" },
  { strategy: "Always-Haiku (cheapest)", cost: "1.0x", catastrophic: "26.0%", quality: "74.0%" },
  { strategy: "Nadir verifier-gated cascade", cost: "4.5x", catastrophic: "2.5%", quality: "97.5%", highlighted: true },
];

type Proof = {
  value: string;
  unit?: string;
  label: string;
};

const PROOF: Proof[] = [
  {
    value: "96%",
    label: "Routing accuracy on RouterBench held-out. Prompt-only routers top out at 62%. 34-point gap.",
  },
  {
    value: "47%",
    label: "Cost reduction versus always-Opus, at a 2.5% catastrophic-route rate.",
  },
  {
    value: "180 ms",
    label: "Verifier latency on CPU. INT8 quantized, 70 MB. Ships today.",
  },
];

export const BenchmarkSection = () => {
  return (
    <section id="benchmark" className="py-24 md:py-32 scroll-mt-16">
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
            On 11,420 held-out RouterBench triples, prompt-only routers top out at 62% accuracy.
            <span className="text-[#1d1d1f] font-medium"> Nadir reaches 96%</span>
            {" "}by reading the cheap model's answer first and escalating only when quality fails the bar.
          </p>
        </div>

        {/* Three proof cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 mb-14 md:mb-16">
          {PROOF.map((p, i) => (
            <div
              key={p.label}
              className="bg-white border border-black/[0.08] rounded-[16px] p-7 md:p-8"
              style={{
                background: i === 0 ? "rgba(48,209,88,0.04)" : "#fff",
                borderColor: i === 0 ? "rgba(48,209,88,0.22)" : "rgba(0,0,0,0.08)",
              }}
            >
              <div className="flex items-baseline gap-2 mb-3">
                <span
                  className="text-[44px] md:text-[52px] font-semibold tracking-[-0.035em] leading-[1] tabular-nums"
                  style={{ color: i === 0 ? "#028a3e" : "#1d1d1f" }}
                >
                  {p.value}
                </span>
                {p.unit && (
                  <span className="text-[14px] md:text-[15px] font-semibold text-[#6e6e73] uppercase tracking-[0.08em]">
                    {p.unit}
                  </span>
                )}
              </div>
              <p className="text-[14px] md:text-[15px] text-[#424245] m-0 leading-[1.55] tracking-[-0.005em]">
                {p.label}
              </p>
            </div>
          ))}
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
              <span className="text-[#1d1d1f] font-semibold">62% cost reduction. 97.5% quality preserved.</span>
              {" "}11,420 triples, no prompt seen in both train and test. Reproducible from the open-source eval.
            </p>
          </div>
        </div>

        {/* Conversion CTA below the table */}
        <div className="mt-14 md:mt-16 flex flex-col items-center text-center">
          <p className="text-[20px] md:text-[24px] text-[#1d1d1f] font-semibold tracking-[-0.018em] m-0 mb-5 max-w-[640px] leading-[1.25]">
            Save 47%. Don't break 2.5%. Read the eval, not the marketing.
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
