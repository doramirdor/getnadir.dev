import { useState, useCallback, useMemo } from "react";

const AVG_TOKENS_IN = 300;
const AVG_TOKENS_OUT = 150;
const CHEAP_IN = 0.075;
const CHEAP_OUT = 0.3;

const MODELS = [
  { label: "Mid-tier ($3/$15 per 1M)", inPrice: 3, outPrice: 15 },
  { label: "Premium ($15/$75 per 1M)", inPrice: 15, outPrice: 75 },
  { label: "Standard ($2.50/$10 per 1M)", inPrice: 2.5, outPrice: 10 },
  { label: "High-end ($10/$30 per 1M)", inPrice: 10, outPrice: 30 },
  { label: "Budget ($1/$2 per 1M)", inPrice: 1, outPrice: 2 },
];

export const OnboardingSteps = () => {
  const [prompts, setPrompts] = useState(500);
  const [modelIdx, setModelIdx] = useState(0);
  const [simplePct, setSimplePct] = useState(65);

  const model = MODELS[modelIdx];

  const calc = useMemo(() => {
    const simple = simplePct / 100;
    const totalIn = (prompts * AVG_TOKENS_IN) / 1e6;
    const totalOut = (prompts * AVG_TOKENS_OUT) / 1e6;
    const before = totalIn * model.inPrice + totalOut * model.outPrice;

    const complexIn = (prompts * (1 - simple) * AVG_TOKENS_IN) / 1e6;
    const complexOut = (prompts * (1 - simple) * AVG_TOKENS_OUT) / 1e6;
    const simpleIn = (prompts * simple * AVG_TOKENS_IN) / 1e6;
    const simpleOut = (prompts * simple * AVG_TOKENS_OUT) / 1e6;
    const after =
      complexIn * model.inPrice +
      complexOut * model.outPrice +
      simpleIn * CHEAP_IN +
      simpleOut * CHEAP_OUT;

    const saved = before - after;
    const pct = Math.round((saved / before) * 100) || 0;

    return { before, after, saved, pct };
  }, [prompts, modelIdx, simplePct, model]);

  const handlePromptsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPrompts(Number(e.target.value));
    },
    []
  );

  const handleSimpleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSimplePct(Number(e.target.value));
    },
    []
  );

  return (
    <section
      id="calculator"
      className="py-20 bg-gradient-to-b from-white via-[#fafafa] to-white"
    >
      <div className="max-w-[1120px] mx-auto px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight mb-3">
            Calculate your savings
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666]">
            See exactly how much NadirClaw saves your setup.
          </p>
        </div>

        <div className="max-w-[640px] mx-auto bg-white border border-[#e5e5e5] rounded-xl p-9">
          <div className="space-y-6">
            {/* Daily prompts slider */}
            <div>
              <label className="text-sm font-semibold text-[#0a0a0a] block mb-2">
                Daily AI prompts{" "}
                <span className="text-[#666] font-normal">
                  {prompts.toLocaleString()}
                </span>
              </label>
              <input
                type="range"
                min="50"
                max="10000"
                step="50"
                value={prompts}
                onChange={handlePromptsChange}
                className="w-full accent-[#0a0a0a] cursor-pointer"
              />
              <div className="flex justify-between text-xs text-[#999] mt-1">
                <span>50</span>
                <span>10,000</span>
              </div>
            </div>

            {/* Model selector */}
            <div>
              <label className="text-sm font-semibold text-[#0a0a0a] block mb-2">
                Your current model
              </label>
              <select
                value={modelIdx}
                onChange={(e) => setModelIdx(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-[#e5e5e5] rounded-md text-sm bg-white text-[#0a0a0a] cursor-pointer"
              >
                {MODELS.map((m, i) => (
                  <option key={i} value={i}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Simple % slider */}
            <div>
              <label className="text-sm font-semibold text-[#0a0a0a] block mb-2">
                % of prompts that are simple{" "}
                <span className="text-[#666] font-normal">{simplePct}%</span>
              </label>
              <input
                type="range"
                min="20"
                max="90"
                step="5"
                value={simplePct}
                onChange={handleSimpleChange}
                className="w-full accent-[#0a0a0a] cursor-pointer"
              />
              <div className="flex justify-between text-xs text-[#999] mt-1">
                <span>20%</span>
                <span>90%</span>
              </div>
            </div>

            {/* Results */}
            <div className="bg-[#fafafa] rounded-lg p-6 mt-1">
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <div className="text-xs text-[#999] uppercase tracking-wider mb-1">
                    Without NadirClaw
                  </div>
                  <div className="text-2xl font-bold text-[#0a0a0a]">
                    ${calc.before.toFixed(2)}
                  </div>
                  <div className="text-[13px] text-[#666] mt-0.5">
                    ${(calc.before * 30).toFixed(0)}/month
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#999] uppercase tracking-wider mb-1">
                    With NadirClaw
                  </div>
                  <div className="text-2xl font-bold text-[#00a86b]">
                    ${calc.after.toFixed(2)}
                  </div>
                  <div className="text-[13px] text-[#666] mt-0.5">
                    ${(calc.after * 30).toFixed(0)}/month
                  </div>
                </div>
              </div>
              <div className="border-t border-[#e5e5e5] pt-4 flex justify-between items-center">
                <div>
                  <div className="text-[13px] text-[#666]">You save</div>
                  <div className="text-xl font-bold text-[#00a86b]">
                    ${(calc.saved * 30).toFixed(0)}/month
                  </div>
                </div>
                <div className="bg-[#00a86b]/10 text-[#00a86b] text-[22px] font-bold px-4 py-2 rounded-lg">
                  {calc.pct}% off
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex gap-2.5 flex-wrap">
              <a
                href="https://github.com/doramirdor/NadirClaw"
                className="flex-1 min-w-[200px] text-center py-3 px-6 bg-[#0a0a0a] text-white rounded-md font-semibold text-[15px] no-underline inline-flex items-center justify-center gap-1.5 hover:bg-[#333] transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <polygon points="8,0 10.47,4.63 15.6,5.39 12,9.07 12.94,14.4 8,11.84 3.06,14.4 4,9.07 0.4,5.39 5.53,4.63" />
                </svg>
                Star & start saving
              </a>
              <a
                href="#quickstart"
                className="flex-1 min-w-[160px] text-center py-3 px-6 bg-white text-[#0a0a0a] border border-[#e5e5e5] rounded-md font-semibold text-[15px] no-underline hover:bg-[#f5f5f5] transition-colors"
              >
                pip install nadirclaw
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
