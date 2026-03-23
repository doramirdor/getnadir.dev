import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";

const tiers = [
  {
    name: "Open Source",
    price: "Free",
    subtitle: "Self-hosted",
    description: "Run NadirClaw on your own infrastructure. Full routing + optimization.",
    features: [
      "Intelligent 4-tier routing",
      "Context Optimize (safe mode)",
      "CLI dashboard & analytics",
      "Unlimited requests",
      "MIT licensed",
    ],
    cta: "Get Started",
    ctaLink: "https://github.com/doramirdor/NadirClaw",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "Up to $9",
    subtitle: "/month + up to 25% of savings",
    description: "Hosted proxy with zero setup. We only earn when we save you money.",
    features: [
      "Everything in Open Source",
      "Hosted proxy (api.getnadir.com)",
      "Aggressive semantic dedup",
      "Web dashboard & analytics",
      "BYOK or use our keys",
      "Up to 25% of savings (10% above $2K)",
      "Email support",
    ],
    cta: "Start Free Trial",
    ctaLink: "/dashboard/onboarding",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    subtitle: "volume pricing",
    description: "Dedicated infrastructure, SLA, and custom routing models.",
    features: [
      "Everything in Pro",
      "SSO / SAML",
      "Custom routing models",
      "Dedicated infrastructure",
      "99.9% SLA",
      "Priority support",
      "Audit logs & compliance",
    ],
    cta: "Contact Us",
    ctaLink: "mailto:amirdor@gmail.com",
    highlighted: false,
  },
];

function SavingsCalculator() {
  const [spend, setSpend] = useState(5000);
  const savingsRate = 0.10;
  const savings = spend * savingsRate;
  const feeOnFirst2K = Math.min(savings, 2000) * 0.25;
  const feeAbove2K = Math.max(savings - 2000, 0) * 0.10;
  const baseFee = 9;
  const totalFee = baseFee + feeOnFirst2K + feeAbove2K;
  const netSavings = savings - totalFee;

  return (
    <div className="max-w-2xl mx-auto mt-20 p-8 bg-gray-50 rounded-2xl">
      <h3 className="text-2xl font-bold text-center mb-2">Calculate your savings</h3>
      <p className="text-gray-500 text-center mb-8">
        Based on 10% average cost reduction from intelligent routing (up to 30% on medium-complexity prompts)
      </p>

      <label className="block text-sm font-medium text-gray-700 mb-2">
        Monthly LLM spend: <span className="text-blue-600 font-bold">${spend.toLocaleString()}</span>
      </label>
      <input
        type="range"
        min={100}
        max={50000}
        step={100}
        value={spend}
        onChange={(e) => setSpend(Number(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mb-8"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <div className="p-4 bg-white rounded-xl">
          <div className="text-sm text-gray-500">Without Nadir</div>
          <div className="text-xl font-bold">${spend.toLocaleString()}</div>
        </div>
        <div className="p-4 bg-white rounded-xl">
          <div className="text-sm text-gray-500">With Nadir</div>
          <div className="text-xl font-bold text-blue-600">
            ${Math.round(spend - savings).toLocaleString()}
          </div>
        </div>
        <div className="p-4 bg-white rounded-xl">
          <div className="text-sm text-gray-500">Nadir fee</div>
          <div className="text-xl font-bold">${Math.round(totalFee).toLocaleString()}</div>
        </div>
        <div className="p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="text-sm text-green-700">You save</div>
          <div className="text-xl font-bold text-green-600">
            ${Math.round(netSavings).toLocaleString()}/mo
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Pricing() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Pay only when we save you money
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto">
          Up to $9/month base. Up to 25% of savings, capped then 10%. If we don't save you money, you just pay up to $9.
        </p>
      </section>

      {/* Benchmark social proof */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <div className="text-center p-6 bg-gray-50 rounded-xl">
            <div className="text-3xl font-bold text-[#00a86b] mb-1">Up to 30%</div>
            <div className="text-sm text-gray-500">savings on everyday prompts</div>
          </div>
          <div className="text-center p-6 bg-gray-50 rounded-xl">
            <div className="text-4xl font-bold text-blue-600 mb-1">87%</div>
            <div className="text-sm text-gray-500">quality verified by LLM judge</div>
          </div>
          <div className="text-center p-6 bg-gray-50 rounded-xl">
            <div className="text-4xl font-bold text-indigo-500 mb-1">Zero</div>
            <div className="text-sm text-gray-500">latency overhead</div>
          </div>
        </div>
        <p className="text-center text-sm text-gray-400 mt-4">
          Benchmarked on real-world prompts with quality verified by LLM judge.{" "}
          <Link to="/blog/benchmark-results" className="text-blue-600 hover:underline">
            See full benchmark &rarr;
          </Link>
        </p>
      </section>

      {/* Tiers */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-8">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-2xl p-8 flex flex-col ${
                tier.highlighted
                  ? "bg-gray-900 text-white ring-2 ring-blue-500 scale-105"
                  : "bg-gray-50 text-gray-900"
              }`}
            >
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className={`text-sm ${tier.highlighted ? "text-gray-400" : "text-gray-500"}`}>
                  {tier.subtitle}
                </span>
              </div>
              <p className={`mt-4 text-sm ${tier.highlighted ? "text-gray-300" : "text-gray-500"}`}>
                {tier.description}
              </p>
              <ul className="mt-8 space-y-3 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className={`h-4 w-4 mt-0.5 shrink-0 ${tier.highlighted ? "text-blue-400" : "text-blue-600"}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={tier.ctaLink}
                className={`mt-8 block text-center py-3 px-6 rounded-lg font-medium text-sm transition ${
                  tier.highlighted
                    ? "bg-blue-600 text-white hover:bg-blue-500"
                    : "bg-white text-gray-900 border border-gray-200 hover:border-gray-400"
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Calculator */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <SavingsCalculator />
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-12">How savings-based pricing works</h2>
        <div className="space-y-6 text-gray-700">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">1</div>
            <div>
              <div className="font-semibold text-gray-900">You set a benchmark model</div>
              <div className="text-sm text-gray-500">The model you'd normally use for everything (e.g., Claude Opus 4.6, GPT-4).</div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">2</div>
            <div>
              <div className="font-semibold text-gray-900">Nadir routes intelligently + compacts context</div>
              <div className="text-sm text-gray-500">Simple prompts go to cheaper models. Bloated context is trimmed. Complex tasks stay on premium models.</div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">3</div>
            <div>
              <div className="font-semibold text-gray-900">We calculate the difference</div>
              <div className="text-sm text-gray-500">Savings = what you would have paid - what you actually paid. Tracked per request, reported in your dashboard.</div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-bold">4</div>
            <div>
              <div className="font-semibold text-gray-900">You keep 75% (or 90% above $2K)</div>
              <div className="text-sm text-gray-500">First $2K saved: 25% fee. Above $2K: drops to 10%. Plus $9/mo base to cover hosting.</div>
            </div>
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}
