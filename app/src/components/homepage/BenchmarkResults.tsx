import { useState, useMemo, useCallback } from "react";

const BENCHMARK_DATA = [
  { label: "Baseline (always-Opus)", pct: 100, savings: 0, color: "#d4d4d4" },
  { label: "Nadir verifier-gated cascade", pct: 40, savings: 60, color: "#00a86b" },
];

const CATEGORIES = [
  { label: "Simple prompts", savings: 97, color: "#00a86b" },
  { label: "Medium prompts", savings: 97, color: "#0066ff" },
  { label: "Complex prompts", savings: 0, color: "#6366f1" },
];

export const BenchmarkResults = () => {
  const [monthlySpend, setMonthlySpend] = useState(5000);

  const roi = useMemo(() => {
    const savings = monthlySpend * 0.6;
    // Tiered savings fee: 25% on the first $2K, 10% above. No base fee.
    const fee = Math.min(savings, 2000) * 0.25 + Math.max(savings - 2000, 0) * 0.1;
    const net = savings - fee;
    return { savings, fee, net, annual: net * 12 };
  }, [monthlySpend]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMonthlySpend(Number(e.target.value));
    },
    []
  );

  const maxPct = BENCHMARK_DATA[0].pct;

  return (
    <section
      id="benchmark"
      className="py-6 md:py-10 bg-gradient-to-b from-white via-[#fafafa] to-white"
    >
      <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
        {/* Header */}
        <div className="text-center mb-8 md:mb-16">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            Proven results
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666] max-w-[600px] mx-auto">
            11,420 held-out RouterBench triples. Verifier in the loop, not a one-shot router.
            98% of always-Opus quality preserved, independently scored.
          </p>
        </div>

        {/* Hero stats */}
        <div className="grid md:grid-cols-3 gap-6 max-w-[800px] mx-auto mb-8 md:mb-16">
          <div className="text-center p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-3xl font-bold text-[#00a86b] mb-1">60%</div>
            <div className="text-sm text-[#666]">cost reduction vs always-Opus</div>
          </div>
          <div className="text-center p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-3xl font-bold text-[#0066ff] mb-1">98%</div>
            <div className="text-sm text-[#666]">quality preserved</div>
          </div>
          <div className="text-center p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-3xl font-bold text-[#6366f1] mb-1">180 ms</div>
            <div className="text-sm text-[#666]">verifier latency, CPU</div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="max-w-[800px] mx-auto mb-8 md:mb-16">
          <h3 className="text-lg font-semibold mb-6 text-center">
            Cost on routed prompts (simple + medium)
          </h3>
          <div className="space-y-3">
            {BENCHMARK_DATA.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-sm text-[#666] w-48 shrink-0 text-right">
                  {item.label}
                </span>
                <div className="flex-1 h-8 bg-[#f5f5f5] rounded overflow-hidden relative">
                  <div
                    className="h-full rounded flex items-center justify-end pr-2 transition-all duration-500"
                    style={{
                      width: `${(item.pct / maxPct) * 100}%`,
                      backgroundColor: item.color,
                    }}
                  />

                </div>
                <span className="text-sm font-medium w-20 shrink-0">
                  {item.savings > 0 ? (
                    <span className="text-[#00a86b]">-{item.savings}%</span>
                  ) : (
                    <span className="text-[#999]">baseline</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quality + Latency row */}
        <div className="grid md:grid-cols-2 gap-8 max-w-[800px] mx-auto mb-8 md:mb-16">
          {/* Quality badge */}
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-[#00a86b]/10 flex items-center justify-center">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#00a86b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="2 8.5 6 12.5 14 3.5" />
                </svg>
              </div>
              <h3 className="text-base font-semibold">Quality verified</h3>
            </div>
            <p className="text-[15px] text-[#666] leading-relaxed">
              98% of always-Opus quality preserved on RouterBench held-out. Cheap-model
              answers are scored by the verifier before they ship. Verifier AUROC 0.961,
              calibration ECE 0.016.
            </p>
          </div>

          {/* Latency */}
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-[#6366f1]/10 flex items-center justify-center">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="8" cy="8" r="6" />
                  <polyline points="8 4.5 8 8 10.5 9.5" />
                </svg>
              </div>
              <h3 className="text-base font-semibold">Zero latency overhead</h3>
            </div>
            <p className="text-[15px] text-[#666] leading-relaxed">
              180 ms verifier latency on CPU, INT8 quantized. The classifier shortcut
              skips the verifier entirely on high-confidence routes, so most requests
              add zero overhead.
            </p>
          </div>
        </div>

        {/* ROI calculator */}
        <div className="max-w-[640px] mx-auto bg-white border border-[#e5e5e5] rounded-xl p-8 mb-12">
          <h3 className="text-lg font-semibold mb-6 text-center">
            Your ROI at scale
          </h3>
          <div className="mb-6">
            <label className="text-sm font-semibold text-[#0a0a0a] block mb-2">
              Monthly LLM spend{" "}
              <span className="text-[#666] font-normal">
                ${monthlySpend.toLocaleString()}
              </span>
            </label>
            <input
              type="range"
              min="1000"
              max="50000"
              step="500"
              value={monthlySpend}
              onChange={handleSliderChange}
              className="w-full accent-[#0a0a0a] cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[#999] mt-1">
              <span>$1,000</span>
              <span>$50,000</span>
            </div>
          </div>

          <div className="bg-[#fafafa] rounded-lg p-6">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-xs text-[#999] uppercase tracking-wider mb-1">
                  Gross savings
                </div>
                <div className="text-xl font-bold text-[#00a86b]">
                  ${roi.savings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  <span className="text-sm font-normal text-[#666]">/mo</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-[#999] uppercase tracking-wider mb-1">
                  Routing fee
                </div>
                <div className="text-xl font-bold text-[#0a0a0a]">
                  ${roi.fee.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  <span className="text-sm font-normal text-[#666]">/mo</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-[#999] uppercase tracking-wider mb-1">
                  Net savings
                </div>
                <div className="text-xl font-bold text-[#00a86b]">
                  ${roi.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  <span className="text-sm font-normal text-[#666]">/mo</span>
                </div>
              </div>
            </div>
            <div className="border-t border-[#e5e5e5] pt-4 text-center">
              <span className="text-sm text-[#666]">Annual net savings: </span>
              <span className="text-lg font-bold text-[#00a86b]">
                ${roi.annual.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                /year
              </span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
