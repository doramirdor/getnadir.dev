import { Link } from "react-router-dom";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { trackCtaClick } from "@/utils/analytics";

const tierCtaKey = (name: string) => `${name.toLowerCase()}_cta`;

type Tier = {
  name: string;
  price: string;
  period: string;
  blurb: string;
  /** One-line "math proof" under the price — concrete numbers a buyer can map to themselves. */
  proof: string;
  features: string[];
  cta: string;
  // ctaType: "signup" opens the SignupDialog (Pro trial by default).
  //          "link" routes to a react-router path (Talk to sales, etc.).
  //          "external" is an <a href> to an outside URL.
  ctaType: "signup" | "link" | "external";
  ctaLink?: string;
  highlighted: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Self-host",
    price: "Free",
    period: "open source · MIT",
    blurb: "Run NadirClaw on your own infrastructure. Yours forever, no fees.",
    proof: "Same routing engine as hosted. Your keys, your servers, your data.",
    features: [
      "MIT licensed, run it anywhere",
      "Bring your own provider keys",
      "4-tier routing + context optimization",
      "Local CLI dashboard",
      "No account, no limits, no fees",
    ],
    cta: "Self-host free",
    ctaType: "link",
    ctaLink: "/self-host",
    highlighted: false,
  },
  {
    name: "Hosted",
    price: "25%",
    period: "of savings · 10% above $2K",
    blurb: "Bring your own keys or use ours. You pay only on what we save you.",
    proof: "Routes a $5K/mo bill for ~$575 in fees. You keep ~$2,175.",
    features: [
      "Bring your own keys, or use ours",
      "No base fee, no minimums",
      "Use our keys: usage billed at cost + 20%",
      "Semantic cache, fallback chains",
      "Dashboard and analytics",
      "Priority email support",
    ],
    cta: "Start saving",
    ctaType: "signup",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "volume pricing",
    blurb: "For scale, compliance, and dedicated infrastructure.",
    proof: "Volume rates and a 99.9% SLA. Talk to a human.",
    features: [
      "Everything in the self-serve plans",
      "SSO and SAML",
      "Custom routing models",
      "Dedicated infrastructure",
      "99.9% uptime SLA",
      "Solutions engineer on call",
    ],
    cta: "Talk to sales",
    ctaType: "link",
    ctaLink: "/contact?reason=enterprise&source=home_pricing",
    highlighted: false,
  },
];

const Check = () => (
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

export const PricingSection = () => {
  return (
    <section className="py-20 md:py-24 bg-[#fbfbfd] border-y border-black/[0.06]">
      <div className="max-w-[1160px] mx-auto px-6 sm:px-8">
        <div className="text-center max-w-[760px] mx-auto mb-16 md:mb-20">
          <p className="text-[12px] text-[#028a3e] uppercase tracking-[0.12em] font-semibold mb-4">
            Pricing that pays for itself
          </p>
          <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] m-0 mb-5 text-[#1d1d1f] leading-[1.05]">
            Self-host free, or let us run it.
          </h2>
          <p className="text-lg md:text-[21px] text-[#424245] m-0 leading-[1.4] tracking-[-0.01em]">
            NadirClaw is open source under MIT. On the hosted plan there's no base fee. We take 25% of what we save you on the first $2K, 10% above. If we save you nothing, you pay nothing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
          {TIERS.map((tier) => {
            const highlighted = tier.highlighted;
            const ctaClass =
              "flex items-center justify-center px-4 py-[13px] rounded-full text-[15px] font-medium no-underline tracking-[-0.01em] active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out";
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
                <div className="flex items-baseline gap-2 mb-3">
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
                <p
                  className="text-[13px] m-0 mb-9 leading-[1.5] tracking-[-0.005em]"
                  style={{ color: highlighted ? "#30d158" : "#028a3e" }}
                >
                  {tier.proof}
                </p>
                <ul className="list-none p-0 m-0 mb-9 flex-1">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex gap-3 text-[14px] md:text-[15px] mb-3.5 leading-[1.4] tracking-[-0.005em]"
                      style={{ color: highlighted ? "#d2d2d7" : "#1d1d1f" }}
                    >
                      <span style={{ color: highlighted ? "#a1a1a6" : "#1d1d1f", opacity: 0.9 }}>
                        <Check />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                {tier.ctaType === "signup" ? (
                  // Free + Pro buckets open the signup dialog. The dialog
                  // defaults to the 30-day Pro trial message and sends users
                  // into /dashboard/onboarding with Subscribe as step 0.
                  <SignupDialog
                    ctaLabel={tierCtaKey(tier.name)}
                    ctaLocation="home_pricing"
                  >
                    <button type="button" className={`${ctaClass} ${ctaColors}`}>
                      {tier.cta}
                    </button>
                  </SignupDialog>
                ) : tier.ctaType === "external" ? (
                  <a
                    href={tier.ctaLink}
                    onClick={() => trackCtaClick(tierCtaKey(tier.name), "home_pricing")}
                    className={`${ctaClass} ${ctaColors}`}
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <Link
                    to={tier.ctaLink!}
                    onClick={() => trackCtaClick(tierCtaKey(tier.name), "home_pricing")}
                    className={`${ctaClass} ${ctaColors}`}
                  >
                    {tier.cta}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center text-[13px] text-[#6e6e73] tracking-[-0.005em]">
          Cancel anytime &middot; No base fee &middot; You pay only on what we save you
        </p>
      </div>
    </section>
  );
};
