import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SavingsCalculator, computeSavings } from "@/components/marketing/SavingsCalculator";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { trackCtaClick } from "@/utils/analytics";

/**
 * Compact on-homepage calculator. Users drag the slider, watch their net
 * savings change live, and hit a single CTA that opens the SignupDialog in
 * place (no navigation). The detailed page at /calculator is still linked
 * for anyone who wants the math breakdown.
 *
 * Placed early in the scroll order (between StatBand and HowItWorks) so the
 * "aha moment" happens before the user has to click anything.
 */
export const CalculatorTeaser = () => {
  const [spend, setSpend] = useState(5000);
  // Memoized to avoid recomputing every render even though the math is
  // cheap — keeps React devtools cleaner when someone scrubs the slider fast.
  const result = useMemo(() => computeSavings({ spend }), [spend]);
  const netPerMonth = Math.round(result.netSavings);
  const netPerYear = netPerMonth * 12;

  return (
    <section className="py-20 md:py-28">
      <div className="max-w-[1040px] mx-auto px-6 sm:px-8">
        <div className="text-center mb-10 md:mb-14">
          <h2 className="text-[36px] sm:text-[48px] md:text-[60px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#1d1d1f] mb-5">
            See your number.
          </h2>
          <p className="text-[17px] md:text-[19px] text-[#424245] max-w-[620px] mx-auto leading-[1.45] tracking-[-0.008em]">
            Drag the slider. This is the net you'd keep after our fee, on a typical prompt mix.
          </p>
        </div>

        <SavingsCalculator
          variant="compact"
          initialSpend={spend}
          onSpendChange={setSpend}
        />

        {/* Dollar-anchor + primary CTA. The time-unit translation makes the
            savings feel real — "$14,400/year" reads differently than
            "$1,200/mo". */}
        <div className="mt-8 md:mt-10 text-center">
          <p className="text-[14px] md:text-[15px] text-[#424245] mb-6 tracking-[-0.008em]">
            That's <span className="font-semibold text-[#028a3e]">${netPerYear.toLocaleString()}</span>{" "}
            back in your pocket every year &middot; or roughly{" "}
            <span className="font-semibold text-[#1d1d1f]">{Math.round(netPerYear / 8400)}</span>{" "}
            weeks of engineering time.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <SignupDialog ctaLabel="claim_savings" ctaLocation="homepage_calculator">
              <button
                type="button"
                className="inline-flex items-center px-6 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#333] transition-colors tracking-[-0.01em]"
              >
                Claim these savings
              </button>
            </SignupDialog>
            <Link
              to={`/calculator?spend=${spend}`}
              onClick={() => trackCtaClick("see_full_math", "homepage_calculator")}
              className="inline-flex items-center px-6 py-[14px] bg-white border border-black/[0.12] text-[#1d1d1f] rounded-full text-[15px] font-medium hover:bg-black/[0.03] transition-colors no-underline tracking-[-0.01em]"
            >
              See full math <span className="ml-1 text-[14px]">›</span>
            </Link>
          </div>
          <p className="mt-4 text-[12px] text-[#86868b] tracking-[-0.005em]">
            Free to start. Bring your own keys. Cancel anytime.
          </p>
        </div>
      </div>
    </section>
  );
};
