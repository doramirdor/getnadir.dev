import { useEffect } from "react";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { SavingsCalculator } from "@/components/marketing/SavingsCalculator";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { trackCtaClick, trackPageView } from "@/utils/analytics";

const FACTS: [string, string][] = [
  ["Up to 40%", "Typical cost reduction on a realistic prompt mix."],
  ["96%", "Routing accuracy on our 50-prompt benchmark."],
  ["< 10 ms", "Classifier overhead. Faster than a DNS lookup."],
];

const FAQS: [string, string][] = [
  [
    "How do you calculate savings?",
    "Savings equals what you would have paid on your benchmark model minus what you actually paid on the routed model. We log the delta per request and roll it up on your monthly invoice.",
  ],
  [
    "What is the fee?",
    "A flat $9 per month for hosting, plus 25 percent of the first $2,000 of monthly savings and 10 percent above that. No savings, no variable fee.",
  ],
  [
    "Where does 38 percent come from?",
    "It is the average savings we see on a realistic mix of simple, medium, and complex prompts routed with our Wide and Deep classifier at λ=20. Your mix will vary.",
  ],
  [
    "Do you count failed requests?",
    "No. If the router produces an empty completion we zero out the cost for that request, so savings reflect only useful output.",
  ],
];

export default function Calculator() {
  useEffect(() => {
    trackPageView("calculator");
  }, []);

  return (
    <MarketingLayout>
      <SEO
        title="LLM Cost Calculator - Nadir"
        description="Estimate how much Nadir's intelligent routing can cut from your monthly Claude, GPT, and Gemini bill. Pay only when we save you money."
        path="/calculator"
      />

      {/* Hero */}
      <section className="pt-20 md:pt-32 pb-12 md:pb-16 text-center">
        <div className="max-w-[920px] mx-auto px-6 sm:px-8">
          <h1 className="text-[44px] sm:text-[60px] md:text-[76px] font-semibold leading-[1.04] tracking-[-0.035em] mb-6 text-[#1d1d1f]">
            How much would you save?
          </h1>
          <p className="text-lg md:text-[21px] text-[#424245] max-w-[640px] mx-auto leading-[1.42] tracking-[-0.01em]">
            Drag the slider. See the net savings after our fee, on your actual monthly LLM spend.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="pb-20 md:pb-28">
        <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
          <SavingsCalculator />
          <p className="text-center text-[13px] text-[#86868b] mt-6 tracking-[-0.005em]">
            Numbers are estimates, not a quote. Your actual savings depend on your prompt mix and benchmark model.
          </p>
        </div>
      </section>

      {/* Trust band */}
      <section className="py-16 md:py-20 bg-[#fbfbfd] border-y border-black/[0.06]">
        <div className="max-w-[1160px] mx-auto px-6 sm:px-8 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
          {FACTS.map((f, i) => (
            <div
              key={f[1]}
              className="text-center px-2 md:px-4 md:border-l md:first:border-l-0 border-black/[0.08]"
              style={{ borderLeftColor: i === 0 ? "transparent" : undefined }}
            >
              <div className="text-[36px] sm:text-[44px] md:text-[52px] font-semibold tracking-[-0.035em] leading-[1.05] mb-3 text-[#1d1d1f]">
                {f[0]}
              </div>
              <div className="text-[14px] sm:text-[15px] text-[#424245] tracking-[-0.01em] max-w-[280px] mx-auto leading-[1.45]">
                {f[1]}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 md:py-32">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <h2 className="text-[32px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#1d1d1f] text-center mb-14 md:mb-16 leading-[1.1]">
            How the math works.
          </h2>
          <div className="space-y-4">
            {FAQS.map(([q, a]) => (
              <div key={q} className="bg-white border border-black/[0.08] rounded-[16px] p-6 md:p-7">
                <h3 className="text-[17px] md:text-[18px] font-semibold text-[#1d1d1f] m-0 mb-2 tracking-[-0.01em]">
                  {q}
                </h3>
                <p className="text-[15px] text-[#424245] m-0 leading-[1.55] tracking-[-0.005em]">
                  {a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-32 md:pb-40">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8 text-center">
          <h2 className="text-[32px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#1d1d1f] mb-4 leading-[1.1]">
            Like the number?
          </h2>
          <p className="text-[17px] md:text-[19px] text-[#424245] mb-8 leading-[1.45] tracking-[-0.008em]">
            Start free, route your first request in two lines of code, and watch the real savings show up in your dashboard.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <SignupDialog ctaLabel="start_saving" ctaLocation="calculator_bottom">
              <button
                type="button"
                className="inline-flex items-center px-6 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#333] transition-colors tracking-[-0.01em]"
              >
                Start saving
              </button>
            </SignupDialog>
            <Link
              to="/pricing"
              onClick={() => trackCtaClick("see_pricing", "calculator_bottom")}
              className="inline-flex items-center px-6 py-[14px] bg-white border border-black/[0.12] text-[#1d1d1f] rounded-full text-[15px] font-medium hover:bg-black/[0.03] transition-colors no-underline tracking-[-0.01em]"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
