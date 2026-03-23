import { useState, useMemo, useCallback } from "react";

const BENCHMARK_DATA = [
  { label: "V1 Baseline (Opus)", cost: 0.00849, savings: 0, color: "#d4d4d4" },
  { label: "V2 Router Only", cost: 0.00592, savings: 30, color: "#93c5fd" },
  { label: "V3 Safe Optimize", cost: 0.00625, savings: 26, color: "#86efac" },
  { label: "V4 Router + Safe", cost: 0.00458, savings: 46, color: "#34d399" },
  {
    label: "V5 Aggressive Opt",
    cost: 0.00612,
    savings: 28,
    color: "#a5b4fc",
  },
  {
    label: "V6 Router + Aggressive",
    cost: 0.00444,
    savings: 48,
    color: "#00a86b",
  },
];

const CATEGORIES = [
  { label: "Simple prompts", savings: 80, color: "#00a86b" },
  { label: "Medium prompts", savings: 40, color: "#0066ff" },
  { label: "Complex prompts", savings: 49, color: "#6366f1" },
];

export const BenchmarkResults = () => {
  const [monthlySpend, setMonthlySpend] = useState(5000);

  const roi = useMemo(() => {
    const savings = monthlySpend * 0.48;
    const fee = savings * 0.252; // $1,209 / $4,800 ~ 25.2%
    const net = savings - fee;
    return { savings, fee, net, annual: net * 12 };
  }, [monthlySpend]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMonthlySpend(Number(e.target.value));
    },
    []
  );

  const maxCost = BENCHMARK_DATA[0].cost;

  return (
    <section
      id="benchmark"
      className="py-24 bg-gradient-to-b from-white via-[#fafafa] to-white"
    >
      <div className="max-w-[1120px] mx-auto px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight mb-3">
            Proven results
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666] max-w-[600px] mx-auto">
            6-way benchmark on 17 real-world prompts. Every configuration
            maintained 100% quality.
          </p>
        </div>

        {/* Hero stats */}
        <div className="grid md:grid-cols-3 gap-6 max-w-[800px] mx-auto mb-16">
          <div className="text-center p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-4xl font-bold text-[#00a86b] mb-1">48%</div>
            <div className="text-sm text-[#666]">cost savings</div>
          </div>
          <div className="text-center p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-4xl font-bold text-[#0066ff] mb-1">100%</div>
            <div className="text-sm text-[#666]">quality maintained</div>
          </div>
          <div className="text-center p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-4xl font-bold text-[#6366f1] mb-1">61%</div>
            <div className="text-sm text-[#666]">faster responses</div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="max-w-[800px] mx-auto mb-16">
          <h3 className="text-lg font-semibold mb-6 text-center">
            Cost per request across 6 configurations
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
                      width: `${(item.cost / maxCost) * 100}%`,
                      backgroundColor: item.color,
                    }}
                  >
                    <span className="text-xs font-semibold text-white drop-shadow-sm">
                      ${item.cost.toFixed(5)}
                    </span>
                  </div>
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

        {/* Quality + Latency + Category row */}
        <div className="grid md:grid-cols-2 gap-8 max-w-[800px] mx-auto mb-16">
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
              <strong className="text-[#0a0a0a]">17/17 prompts</strong> judged
              EQUAL by independent LLM-as-judge. No quality degradation at any
              savings level.
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
              <h3 className="text-base font-semibold">Faster responses</h3>
            </div>
            <p className="text-[15px] text-[#666] leading-relaxed">
              <strong className="text-[#0a0a0a]">208ms avg</strong> vs 536ms
              baseline. Cheaper models respond faster, so routing saves time
              too.
            </p>
          </div>
        </div>

        {/* Per-category cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-[800px] mx-auto mb-16">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.label}
              className="p-5 rounded-xl border border-[#e5e5e5] bg-white text-center"
            >
              <div
                className="text-3xl font-bold mb-1"
                style={{ color: cat.color }}
              >
                -{cat.savings}%
              </div>
              <div className="text-sm text-[#666]">{cat.label}</div>
            </div>
          ))}
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

        {/* Methodology */}
        <p className="text-xs text-[#999] text-center max-w-[640px] mx-auto leading-relaxed">
          Benchmarked on 17 diverse prompts (simple Q&A to complex system
          design) using Claude CLI. Quality verified by independent
          LLM-as-judge (Sonnet 4.6). Full methodology and raw data available on{" "}
          <a
            href="https://github.com/doramirdor/NadirClaw"
            className="text-[#0066ff] hover:underline"
          >
            GitHub
          </a>
          .
        </p>
      </div>
    </section>
  );
};
