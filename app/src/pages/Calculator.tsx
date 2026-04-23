import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Copy, Link2 } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { SavingsCalculator, computeSavings } from "@/components/marketing/SavingsCalculator";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { useToast } from "@/hooks/use-toast";
import { trackCtaClick, trackPageView } from "@/utils/analytics";

const FACTS: [string, string][] = [
  ["Up to 47%", "Verified savings on our benchmark vs always-Opus, 0% catastrophic routes."],
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

const DEFAULT_SPEND = 5000;
const SPEND_MIN = 100;
const SPEND_MAX = 50_000;

/** Parse `?spend=NNNN` into a clamped integer, falling back to the default. */
function parseSpend(raw: string | null): number {
  if (!raw) return DEFAULT_SPEND;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SPEND;
  return Math.min(Math.max(Math.round(n), SPEND_MIN), SPEND_MAX);
}

export default function Calculator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [spend, setSpend] = useState(() => parseSpend(searchParams.get("spend")));
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Debounce URL writes so we don't spam history entries while the user drags.
  const urlWriteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    trackPageView("calculator");
  }, []);

  // Keep URL in sync with the current spend. We use replace (not push) so the
  // back button doesn't get littered with one entry per slider tick.
  const handleSpendChange = useCallback(
    (next: number) => {
      setSpend(next);
      if (urlWriteTimer.current) clearTimeout(urlWriteTimer.current);
      urlWriteTimer.current = setTimeout(() => {
        setSearchParams(
          (prev) => {
            const params = new URLSearchParams(prev);
            if (next === DEFAULT_SPEND) {
              params.delete("spend");
            } else {
              params.set("spend", String(next));
            }
            return params;
          },
          { replace: true },
        );
      }, 250);
    },
    [setSearchParams],
  );

  // Clean up any trailing timer on unmount so React doesn't yell at us.
  useEffect(
    () => () => {
      if (urlWriteTimer.current) clearTimeout(urlWriteTimer.current);
    },
    [],
  );

  const result = useMemo(() => computeSavings({ spend }), [spend]);
  const netPerMonth = Math.round(result.netSavings);
  const netPerYear = netPerMonth * 12;

  // Dynamic SEO strings. Link unfurls on Twitter, LinkedIn, etc. read the
  // rendered HTML via their crawlers — when the page pre-renders server-side
  // (future: Vercel Edge Function for OG), these props become the social
  // card. For now they already flow into the <title> and meta description
  // on client navigation, which updates the browser tab and in-app share
  // sheets on iOS/Android.
  const seoTitle = `Save $${netPerMonth.toLocaleString()}/mo with Nadir — LLM Cost Calculator`;
  const seoDescription = `At $${spend.toLocaleString()}/mo on LLMs, Nadir's intelligent routing keeps ${`$${netPerMonth.toLocaleString()}`} in your pocket every month after fees — about $${netPerYear.toLocaleString()}/year.`;

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/calculator?spend=${spend}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackCtaClick("copy_calculator_link", "calculator_share");
      toast({
        title: "Link copied",
        description: "Share it — the person you send it to sees the exact same number.",
      });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can fail in older browsers or non-HTTPS contexts. Fall
      // back to a prompt so the user can still grab the URL manually.
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <MarketingLayout>
      <SEO title={seoTitle} description={seoDescription} path="/calculator" />

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
      <section className="pb-12 md:pb-16">
        <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
          <SavingsCalculator initialSpend={spend} onSpendChange={handleSpendChange} />

          {/* Year-at-a-glance + share */}
          <div className="max-w-[880px] mx-auto mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
            <p className="text-[14px] text-[#424245] tracking-[-0.005em] text-center sm:text-left">
              That's about{" "}
              <span className="font-semibold text-[#028a3e]">${netPerYear.toLocaleString()}</span>{" "}
              saved per year at this spend level.
            </p>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-black/[0.12] text-[#1d1d1f] rounded-full text-[13px] font-medium hover:bg-black/[0.03] transition-colors tracking-[-0.005em]"
              aria-label="Copy shareable link to this calculation"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Copied
                </>
              ) : (
                <>
                  <Link2 className="w-3.5 h-3.5" /> Share this number
                </>
              )}
            </button>
          </div>

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
            <SignupDialog ctaLabel="claim_savings" ctaLocation="calculator_bottom">
              <button
                type="button"
                className="inline-flex items-center px-6 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#333] transition-colors tracking-[-0.01em]"
              >
                Claim my ${netPerMonth.toLocaleString()}/mo
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
