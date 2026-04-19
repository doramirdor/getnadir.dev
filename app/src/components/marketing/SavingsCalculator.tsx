import { useState } from "react";

export function SavingsCalculator() {
  const [spend, setSpend] = useState(5000);
  const savingsRate = 0.38;
  const savings = spend * savingsRate;
  const feeOnFirst2K = Math.min(savings, 2000) * 0.25;
  const feeAbove2K = Math.max(savings - 2000, 0) * 0.10;
  const baseFee = 9;
  const totalFee = baseFee + feeOnFirst2K + feeAbove2K;
  const netSavings = savings - totalFee;

  return (
    <div className="max-w-[880px] mx-auto bg-white border border-black/[0.08] rounded-[20px] p-8 md:p-12">
      <div className="text-center mb-10">
        <h3 className="text-[28px] md:text-[36px] font-semibold tracking-[-0.028em] m-0 mb-3 text-[#1d1d1f] leading-[1.1]">
          Estimate your savings.
        </h3>
        <p className="text-[15px] md:text-[17px] text-[#424245] m-0 leading-[1.5] tracking-[-0.008em]">
          Intelligent routing cuts LLM bills up to 40 percent. We assume 38 percent here.
        </p>
      </div>

      <label className="block text-[13px] font-medium text-[#86868b] uppercase tracking-[0.08em] mb-2">
        Monthly LLM spend
      </label>
      <div className="text-[32px] font-semibold text-[#1d1d1f] tracking-[-0.02em] mb-5">
        ${spend.toLocaleString()}
      </div>
      <input
        type="range"
        min={100}
        max={50000}
        step={100}
        value={spend}
        onChange={(e) => setSpend(Number(e.target.value))}
        className="w-full h-1.5 bg-black/[0.08] rounded-full appearance-none cursor-pointer accent-[#1d1d1f] mb-10"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Stat label="Without Nadir" value={`$${spend.toLocaleString()}`} />
        <Stat label="With Nadir" value={`$${Math.round(spend - savings).toLocaleString()}`} />
        <Stat label="Nadir fee" value={`$${Math.round(totalFee).toLocaleString()}`} />
        <Stat
          label="You keep"
          value={`$${Math.round(netSavings).toLocaleString()}`}
          accent
        />
      </div>
    </div>
  );
}

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div
    className="p-4 md:p-5 rounded-[14px]"
    style={{
      background: accent ? "rgba(2,138,62,0.08)" : "#fbfbfd",
      border: accent ? "1px solid rgba(2,138,62,0.2)" : "1px solid rgba(0,0,0,0.06)",
    }}
  >
    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: accent ? "#028a3e" : "#86868b" }}>
      {label}
    </div>
    <div
      className="text-[22px] md:text-[26px] font-semibold tracking-[-0.022em] leading-none"
      style={{ color: accent ? "#028a3e" : "#1d1d1f" }}
    >
      {value}
    </div>
  </div>
);
