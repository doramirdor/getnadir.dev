import { useEffect } from "react";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { trackCtaClick, trackPageView, trackPricingView } from "@/utils/analytics";
import { SavingsCalculator } from "@/components/marketing/SavingsCalculator";

type Tier = {
  name: string;
  price: string;
  period: string;
  blurb: string;
  features: string[];
  cta: string;
  ctaAction: "link" | "contact";
  ctaLink?: string;
  highlighted: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Perfect for side projects and trying Nadir out.",
    features: [
      "Hosted proxy (api.getnadir.com)",
      "Fifteen requests per day on our keys",
      "Unlimited with BYOK",
      "Intelligent routing",
      "Dashboard and analytics",
    ],
    cta: "Start free",
    ctaAction: "link",
    ctaLink: "/auth?mode=signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "per month, plus variable savings fee",
    blurb: "For production teams routing real traffic.",
    features: [
      "Everything in Free, no request cap",
      "Hosted keys or BYOK",
      "Semantic cache and dedup",
      "Fallback chains and automatic retry",
      "Context optimization",
      "Priority email support",
    ],
    cta: "Start 30-day free trial",
    ctaAction: "link",
    ctaLink: "/auth?mode=signup",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "volume pricing",
    blurb: "For scale, compliance, and dedicated infrastructure.",
    features: [
      "Everything in Pro",
      "SSO and SAML",
      "Custom routing models",
      "Dedicated infrastructure",
      "99.9% uptime SLA",
      "Solutions engineer on call",
    ],
    cta: "Talk to sales",
    ctaAction: "contact",
    highlighted: false,
  },
];

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, marginTop: 4 }}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const STEPS: [string, string, string][] = [
  [
    "01",
    "You pick a benchmark model.",
    "The model you would use for every request if you were not thinking about cost. Claude Opus 4.7, GPT-5, whichever sets your quality floor.",
  ],
  [
    "02",
    "Nadir routes every prompt to the right model.",
    "Simple prompts drop to Haiku or Sonnet. Complex prompts stay on your premium. Context gets compacted before it hits the provider.",
  ],
  [
    "03",
    "We log the difference on every request.",
    "Savings equals benchmark cost minus routed cost. You see it per request in the dashboard and on the monthly invoice.",
  ],
  [
    "04",
    "You keep 75 percent, or 90 percent above $2K.",
    "First $2K of monthly savings carries a 25 percent fee. Everything above that drops to 10 percent. Plus $9 per month for hosting.",
  ],
];

export default function Pricing() {
  useEffect(() => {
    trackPageView("pricing");
    trackPricingView();
  }, []);

  const tierCtaKey = (name: string) => `${name.toLowerCase()}_cta`;

  const pricingJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Nadir",
    description:
      "Intelligent LLM router that cuts Claude, GPT, and Gemini API costs up to 40 percent with automatic prompt-level model selection.",
    brand: { "@type": "Brand", name: "Nadir" },
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        description: "Hosted proxy with BYOK, 15 requests per day on shared keys, dashboard, and analytics.",
        url: "https://getnadir.com/auth?mode=signup",
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "9",
        priceCurrency: "USD",
        description:
          "$9 per month base plus 25% of the first $2,000 of monthly savings and 10% above. Hosted keys or BYOK, semantic cache, fallback chains, context optimization.",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "9",
          priceCurrency: "USD",
          billingDuration: "P1M",
        },
        url: "https://getnadir.com/auth?mode=signup",
      },
      {
        "@type": "Offer",
        name: "Enterprise",
        priceCurrency: "USD",
        description:
          "Volume pricing, SSO/SAML, custom routing models, dedicated infrastructure, 99.9% uptime SLA.",
        url: "https://getnadir.com/contact?reason=enterprise",
      },
    ],
  };

  return (
    <MarketingLayout>
      <SEO
        title="Pricing - Nadir"
        description="Start free. Upgrade to Pro for $9 a month plus a variable fee tied to what we save you. Self-host NadirClaw for free under MIT."
        path="/pricing"
        jsonLd={pricingJsonLd}
      />

      {/*
        Tier cards lead the page — buckets first, pitch second. The eyebrow
        label replaces the huge hero headline so the fold is dominated by
        something users can actually click (Free / Pro / Enterprise), not
        a marketing sentence. The full "Simple pricing. You keep the
        savings." intro now sits below the cards as supporting copy.
      */}
      <section className="pt-20 md:pt-28 pb-16 md:pb-20">
        <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
          <div className="text-center mb-10 md:mb-14">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0071e3] mb-3">
              Pricing
            </div>
            <h1 className="text-[32px] sm:text-[44px] md:text-[52px] font-semibold leading-[1.06] tracking-[-0.03em] text-[#1d1d1f] max-w-[720px] mx-auto">
              Pick your tier. We only earn when we cut your bill.
            </h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
            {TIERS.map((tier) => {
              const highlighted = tier.highlighted;
              const ctaClass =
                "flex items-center justify-center px-4 py-[13px] rounded-full text-[15px] font-medium no-underline tracking-[-0.01em] transition-colors";
              const ctaColors = highlighted
                ? "bg-white text-[#1d1d1f] hover:bg-white/90"
                : "bg-[#1d1d1f] text-white hover:bg-[#333]";

              return (
                <div
                  key={tier.name}
                  className="relative rounded-[20px] flex flex-col px-7 py-9 md:px-8 md:py-10"
                  style={{
                    background: highlighted ? "#1d1d1f" : "#fff",
                    color: highlighted ? "#fff" : "#1d1d1f",
                    border: highlighted ? "1px solid #1d1d1f" : "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  {highlighted && (
                    <div
                      className="absolute top-4 right-4 text-[11px] font-medium px-2.5 py-1 rounded-full tracking-[-0.005em]"
                      style={{ color: "#fff", background: "rgba(255,255,255,0.12)" }}
                    >
                      Most popular
                    </div>
                  )}
                  <h3 className="text-[22px] font-semibold m-0 mb-2 tracking-[-0.022em]">
                    {tier.name}
                  </h3>
                  <p
                    className="text-[14px] m-0 mb-7 leading-[1.5] tracking-[-0.005em]"
                    style={{ color: highlighted ? "#a1a1a6" : "#86868b" }}
                  >
                    {tier.blurb}
                  </p>
                  <div className="flex items-baseline gap-2 mb-9">
                    <span className="text-[48px] md:text-[56px] font-semibold tracking-[-0.035em] leading-none">
                      {tier.price}
                    </span>
                    <span
                      className="text-[14px]"
                      style={{ color: highlighted ? "#a1a1a6" : "#86868b" }}
                    >
                      {tier.period}
                    </span>
                  </div>
                  <ul className="list-none p-0 m-0 mb-9 flex-1">
                    {tier.features.map((f) => (
                      <li
                        key={f}
                        className="flex gap-3 text-[14px] md:text-[15px] mb-3.5 leading-[1.4] tracking-[-0.005em]"
                        style={{ color: highlighted ? "#d2d2d7" : "#1d1d1f" }}
                      >
                        <span style={{ color: highlighted ? "#a1a1a6" : "#1d1d1f", opacity: 0.9 }}>
                          <CheckIcon />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {tier.ctaAction === "contact" ? (
                    <Link
                      to="/contact?reason=enterprise&source=pricing_enterprise"
                      onClick={() => trackCtaClick(tierCtaKey(tier.name), "pricing_page")}
                      className={`${ctaClass} ${ctaColors}`}
                    >
                      {tier.cta}
                    </Link>
                  ) : (
                    <Link
                      to={tier.ctaLink!}
                      onClick={() => trackCtaClick(tierCtaKey(tier.name), "pricing_page")}
                      className={`${ctaClass} ${ctaColors}`}
                    >
                      {tier.cta}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-center text-[14px] text-[#86868b] mt-10 tracking-[-0.005em]">
            Want to run it yourself?{" "}
            <Link to="/self-host" className="text-[#1d1d1f] underline-offset-2 hover:underline">
              NadirClaw is open source under MIT.
            </Link>{" "}
            Unlimited requests on your own infrastructure.
          </p>
        </div>
      </section>

      {/*
        Intro copy — pushed below the tier cards on purpose, so the first
        thing a visitor sees is "what are the buckets" not "here is a
        marketing sentence".
      */}
      <section className="pb-20 md:pb-28 text-center">
        <div className="max-w-[920px] mx-auto px-6 sm:px-8">
          <h2 className="text-[32px] sm:text-[40px] md:text-[52px] font-semibold leading-[1.06] tracking-[-0.03em] mb-5 text-[#1d1d1f]">
            Simple pricing.
            <br />
            <span className="text-[#86868b]">You keep the savings.</span>
          </h2>
          <p className="text-[17px] md:text-[19px] text-[#424245] max-w-[640px] mx-auto leading-[1.45] tracking-[-0.01em]">
            Start free with your own keys. Upgrade when you need hosted routing. We only earn when we cut your bill.
          </p>
        </div>
      </section>

      {/* Benchmark band */}
      <section className="py-20 md:py-24 bg-[#fbfbfd] border-y border-black/[0.06]">
        <div className="max-w-[1160px] mx-auto px-6 sm:px-8 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
          {[
            { value: "Up to 40%", label: "Cost savings on a realistic prompt mix." },
            { value: "96%", label: "Routing accuracy on our 50-prompt benchmark." },
            { value: "< 10 ms", label: "Classifier overhead. Faster than a DNS lookup." },
          ].map((s, i) => (
            <div
              key={s.label}
              className="text-center px-2 md:px-4 md:border-l md:first:border-l-0 border-black/[0.08]"
              style={{ borderLeftColor: i === 0 ? "transparent" : undefined }}
            >
              <div className="text-[36px] sm:text-[44px] md:text-[52px] font-semibold tracking-[-0.035em] leading-[1.05] mb-3 text-[#1d1d1f]">
                {s.value}
              </div>
              <div className="text-[14px] sm:text-[15px] text-[#424245] tracking-[-0.01em] max-w-[280px] mx-auto leading-[1.45]">
                {s.label}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-[13px] text-[#86868b] mt-8 tracking-[-0.005em]">
          Benchmarked on real-world prompts. Quality verified by LLM judge.
        </p>
      </section>

      {/* How savings pricing works */}
      <section className="py-24 md:py-36 bg-[#fbfbfd] border-y border-black/[0.06]">
        <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
          <div className="text-center max-w-[760px] mx-auto mb-16 md:mb-20">
            <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] m-0 mb-5 text-[#1d1d1f] leading-[1.05]">
              You only pay when we save.
            </h2>
            <p className="text-lg md:text-[21px] text-[#424245] m-0 leading-[1.4] tracking-[-0.01em]">
              No savings, no variable fee. Our incentive lines up with yours, every request.
            </p>
          </div>

          <div className="max-w-[880px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
            {STEPS.map(([num, title, desc]) => (
              <div
                key={num}
                className="bg-white border border-black/[0.08] rounded-[20px] p-7 md:p-8"
              >
                <div className="text-[13px] font-medium text-[#86868b] mb-3 tracking-[-0.005em]">
                  Step {num}
                </div>
                <h3 className="text-[20px] md:text-[22px] font-semibold tracking-[-0.022em] m-0 mb-3 text-[#1d1d1f] leading-[1.2]">
                  {title}
                </h3>
                <p className="text-[15px] text-[#424245] m-0 leading-[1.5] tracking-[-0.008em]">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Calculator */}
      <section className="py-24 md:py-36">
        <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
          <SavingsCalculator />
        </div>
      </section>

    </MarketingLayout>
  );
}
