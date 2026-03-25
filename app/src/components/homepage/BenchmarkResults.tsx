import { useState, useMemo, useCallback } from "react";

const BENCHMARK_DATA = [
  { label: "Baseline (Sonnet)", pct: 100, savings: 0, color: "#d4d4d4" },
  { label: "Router + Safe", pct: 62, savings: 38, color: "#00a86b" },
];

const CATEGORIES = [
  { label: "Simple prompts", savings: 97, color: "#00a86b" },
  { label: "Medium prompts", savings: 97, color: "#0066ff" },
  { label: "Complex prompts", savings: 0, color: "#6366f1" },
];

export const BenchmarkResults = () => {
  const [monthlySpend, setMonthlySpend] = useState(5000);

  const roi = useMemo(() => {
    const savings = monthlySpend * 0.38;
    const fee = savings * 0.252;
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
            Benchmark across diverse real-world prompts. 96% routing
            accuracy verified by independent LLM judge.
          </p>
        </div>

        {/* Hero stats */}
        <div className="grid md:grid-cols-3 gap-6 max-w-[800px] mx-auto mb-8 md:mb-16">
          <div className="text-center p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-3xl font-bold text-[#00a86b] mb-1">Up to 38%</div>
            <div className="text-sm text-[#666]">overall cost savings</div>
          </div>
          <div className="text-center p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-3xl font-bold text-[#0066ff] mb-1">96%</div>
            <div className="text-sm text-[#666]">routing accuracy</div>
          </div>
          <div className="text-center p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-3xl font-bold text-[#6366f1] mb-1">Zero</div>
            <div className="text-sm text-[#666]">latency overhead</div>
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
              96% routing accuracy across real-world prompts. Simple and medium prompts
              routed to budget models. Complex prompts preserved on premium.
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
              Similar latency across all configurations. The routing classifier
              adds negligible overhead to request processing.
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
