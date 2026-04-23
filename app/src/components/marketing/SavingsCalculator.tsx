import { useEffect, useState, useCallback } from "react";

/**
 * Pure math — exported so the homepage teaser, the /calculator page, and
 * any OG image generator all compute identical numbers from the same inputs.
 *
 * Keep this function dependency-free (no React, no DOM) so it can run
 * server-side (Vercel Edge Function for OG images).
 */
export type SavingsInputs = {
  /** Monthly LLM spend on the benchmark model, in USD. */
  spend: number;
  /** Assumed routing savings rate (fraction, e.g. 0.38 for 38%). */
  savingsRate?: number;
};

export type SavingsResult = {
  spend: number;
  savingsRate: number;
  grossSavings: number;
  variableFee: number;
  baseFee: number;
  totalFee: number;
  withNadir: number;
  netSavings: number;
};

export function computeSavings({ spend, savingsRate = 0.38 }: SavingsInputs): SavingsResult {
  const grossSavings = spend * savingsRate;
  const feeOnFirst2K = Math.min(grossSavings, 2000) * 0.25;
  const feeAbove2K = Math.max(grossSavings - 2000, 0) * 0.10;
  const variableFee = feeOnFirst2K + feeAbove2K;
  const baseFee = 9;
  const totalFee = baseFee + variableFee;
  const withNadir = spend - grossSavings;
  const netSavings = grossSavings - totalFee;
  return {
    spend,
    savingsRate,
    grossSavings,
    variableFee,
    baseFee,
    totalFee,
    withNadir,
    netSavings,
  };
}

const SPEND_MIN = 100;
const SPEND_MAX = 50_000;
const SPEND_STEP = 100;

type SavingsCalculatorProps = {
  /** Initial spend value. Used when the parent is loading from a query param. */
  initialSpend?: number;
  /** Fires whenever the slider changes. Use this to sync to the URL. */
  onSpendChange?: (spend: number) => void;
  /** Compact variant strips the header, title, and reduces padding. */
  variant?: "full" | "compact";
};

export function SavingsCalculator({
  initialSpend = 5000,
  onSpendChange,
  variant = "full",
}: SavingsCalculatorProps) {
  const [spend, setSpend] = useState(
    // Clamp whatever comes in from the URL so we never render a bogus range.
    Math.min(Math.max(initialSpend, SPEND_MIN), SPEND_MAX),
  );

  // Keep local state in sync if a parent reloads the value externally.
  useEffect(() => {
    const clamped = Math.min(Math.max(initialSpend, SPEND_MIN), SPEND_MAX);
    setSpend(clamped);
  }, [initialSpend]);

  const handleChange = useCallback(
    (value: number) => {
      setSpend(value);
      onSpendChange?.(value);
    },
    [onSpendChange],
  );

  const result = computeSavings({ spend });
  const compact = variant === "compact";

  return (
    <div
      className={`mx-auto bg-white border border-black/[0.08] rounded-[20px] ${
        compact ? "max-w-[720px] p-6 md:p-8" : "max-w-[880px] p-8 md:p-12"
      }`}
    >
      {!compact && (
        <div className="text-center mb-10">
          <h3 className="text-[28px] md:text-[36px] font-semibold tracking-[-0.028em] m-0 mb-3 text-[#1d1d1f] leading-[1.1]">
            Estimate your savings.
          </h3>
          <p className="text-[15px] md:text-[17px] text-[#424245] m-0 leading-[1.5] tracking-[-0.008em]">
            Intelligent routing cuts LLM bills up to 47 percent. We assume 38 percent here.
          </p>
        </div>
      )}

      <label className="block text-[13px] font-medium text-[#86868b] uppercase tracking-[0.08em] mb-2">
        Monthly LLM spend
      </label>
      <div
        className={`font-semibold text-[#1d1d1f] tracking-[-0.02em] ${
          compact ? "text-[26px] mb-4" : "text-[32px] mb-5"
        }`}
      >
        ${spend.toLocaleString()}
      </div>
      <input
        type="range"
        min={SPEND_MIN}
        max={SPEND_MAX}
        step={SPEND_STEP}
        value={spend}
        onChange={(e) => handleChange(Number(e.target.value))}
        aria-label="Monthly LLM spend in US dollars"
        className={`w-full h-1.5 bg-black/[0.08] rounded-full appearance-none cursor-pointer accent-[#1d1d1f] ${
          compact ? "mb-7" : "mb-10"
        }`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Stat label="Without Nadir" value={`$${spend.toLocaleString()}`} />
        <Stat label="With Nadir" value={`$${Math.round(result.withNadir).toLocaleString()}`} />
        <Stat label="Nadir fee" value={`$${Math.round(result.totalFee).toLocaleString()}`} />
        <Stat
          label="You keep"
          value={`$${Math.round(result.netSavings).toLocaleString()}`}
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
    <div
      className="text-[11px] font-semibold uppercase tracking-[0.08em] mb-1.5"
      style={{ color: accent ? "#028a3e" : "#86868b" }}
    >
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
