import { Check } from "lucide-react";
import { Link } from "react-router-dom";

const tiers = [
  {
    name: "Open Source",
    price: "Free",
    subtitle: "Self-hosted",
    features: ["Intelligent 4-tier routing", "Context Optimize (safe mode)", "CLI dashboard & analytics", "Unlimited requests", "MIT licensed"],
    cta: "Get Started",
    ctaLink: "https://github.com/NadirRouter/NadirClaw",
    external: true,
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$9",
    subtitle: "/month + up to 25% of savings",
    features: ["Everything in Open Source", "Hosted proxy (zero setup)", "Semantic cache & dedup", "Web dashboard & analytics", "BYOK or use our keys"],
    cta: "Sign Up",
    ctaLink: "/auth?mode=signup",
    external: false,
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    subtitle: "volume pricing",
    features: ["Everything in Pro", "SSO / SAML", "Custom routing models", "Dedicated infrastructure", "99.9% SLA"],
    cta: "Contact Us",
    ctaLink: "/pricing",
    external: false,
    highlighted: false,
  },
];

export const PricingSection = () => {
  return (
    <section id="pricing" className="py-6 md:py-10">
      <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            Simple, transparent pricing
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666]">
            Free to self-host. Pay only when we save you money.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-[1000px] mx-auto items-start">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-2xl flex flex-col ${
                tier.highlighted
                  ? "bg-[#0a0a0a] text-white ring-2 ring-[#0066ff] p-8 md:scale-105 md:-my-2"
                  : "bg-[#fafafa] text-[#0a0a0a] p-7"
              }`}
            >
              <h3 className={`text-lg font-semibold ${tier.highlighted ? "text-white" : "text-[#0a0a0a]"}`}>
                {tier.name}
              </h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{tier.price}</span>
                {tier.subtitle && (
                  <span className={`text-sm ${tier.highlighted ? "text-gray-400" : "text-[#999]"}`}>
                    {tier.subtitle}
                  </span>
                )}
              </div>

              <ul className="space-y-3 mt-6 mb-8 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className={`flex items-start gap-2.5 text-sm ${tier.highlighted ? "text-gray-300" : "text-[#444]"}`}>
                    <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${tier.highlighted ? "text-[#0066ff]" : "text-[#00a86b]"}`} />
                    {f}
                  </li>
                ))}
              </ul>

              {tier.external ? (
                <a
                  href={tier.ctaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center py-3 rounded-lg text-sm font-semibold transition-all no-underline border border-[#e5e5e5] text-[#0a0a0a] hover:border-[#0a0a0a] bg-white"
                >
                  {tier.cta}
                </a>
              ) : tier.ctaLink.startsWith("#") ? (
                <a
                  href={tier.ctaLink}
                  className="block text-center py-3 rounded-lg text-sm font-semibold transition-all no-underline bg-white text-[#0a0a0a] hover:bg-gray-100"
                >
                  {tier.cta}
                </a>
              ) : (
                <Link
                  to={tier.ctaLink}
                  className="block text-center py-3 rounded-lg text-sm font-semibold transition-all no-underline border border-[#e5e5e5] text-[#0a0a0a] hover:border-[#0a0a0a] bg-white"
                >
                  {tier.cta}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
