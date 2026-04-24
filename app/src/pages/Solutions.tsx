import { useEffect } from "react";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { trackCtaClick, trackPageView } from "@/utils/analytics";

type Solution = {
  title: string;
  description: string;
  to: string;
  tag?: string;
  icon: string;
  bullets: string[];
};

const SOLUTIONS: Solution[] = [
  {
    title: "Context Optimize",
    description:
      "Lossless context compression that trims bloated payloads before they hit your bill. Safe mode free, aggressive mode on Pro.",
    to: "/optimize",
    icon: "compress",
    bullets: [
      "30-70% token reduction",
      "JSON and schema dedup",
      "Zero quality loss in safe mode",
    ],
  },
  {
    title: "LLM Routing",
    description:
      "Every prompt goes to the cheapest model that can still handle it. Opus only when Opus is actually needed.",
    to: "/solutions/routing",
    icon: "route",
    bullets: [
      "Up to 47% savings vs always-Opus",
      "Haiku, Sonnet, Opus 4.6",
      "Tuned per workload",
    ],
  },
  {
    title: "Fallback",
    description:
      "Provider outage, rate limit, or 5xx? We re-route to a healthy model in the same tier and keep your app up.",
    to: "/solutions/fallback",
    icon: "shield",
    bullets: [
      "Rolling provider health scores",
      "Automatic retries across providers",
      "No code changes required",
    ],
  },
  {
    title: "Analytics",
    description:
      "Per-request logs, spend breakdowns, latency percentiles, and catastrophic-route detection, all built in.",
    to: "/solutions/analytics",
    icon: "chart",
    bullets: [
      "Cost vs always-Opus benchmark",
      "Model mix and routing accuracy",
      "Privacy-first log storage",
    ],
  },
  {
    title: "Prompt Clustering",
    description:
      "See the real shape of your traffic. Group semantically similar prompts, find duplicates, and surface the workloads driving your bill.",
    to: "/solutions/clustering",
    tag: "Coming soon",
    icon: "cluster",
    bullets: [
      "Embedding-based clusters",
      "Duplicate and redundancy detection",
      "Per-cluster cost and quality stats",
    ],
  },
];

const Icon = ({ name }: { name: string }) => {
  const stroke = "#0a0a0a";
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "compress":
      return (
        <svg {...common}>
          <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
          <path d="M9 12h6" />
        </svg>
      );
    case "route":
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="18" r="2" />
          <path d="M8 6h6a4 4 0 0 1 0 8h-4a4 4 0 0 0 0 8" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "cluster":
      return (
        <svg {...common}>
          <circle cx="6" cy="7" r="2" />
          <circle cx="18" cy="7" r="2" />
          <circle cx="12" cy="17" r="2" />
          <path d="M6 9l6 6M18 9l-6 6" />
        </svg>
      );
    default:
      return null;
  }
};

export default function Solutions() {
  useEffect(() => {
    trackPageView("solutions");
  }, []);
  return (
    <MarketingLayout>
      <SEO
        title="Solutions - Nadir"
        description="Nadir solutions: context optimization, LLM routing, provider fallback, analytics, and prompt clustering. Everything you need to cut LLM spend without giving up quality."
        path="/solutions"
      />
      <section className="max-w-[1160px] mx-auto px-6 sm:px-8 pt-20 pb-8 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Solutions
        </h1>
        <p className="text-lg sm:text-xl text-[#666] max-w-2xl mx-auto">
          One router, five products. Pick what you need, layer in the rest when you want more savings or more reliability.
        </p>
      </section>

      <section className="max-w-[1160px] mx-auto px-6 sm:px-8 pb-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SOLUTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              onClick={() => trackCtaClick("solution_card", `solutions_index_${s.to}`)}
              className="group relative p-6 bg-white border border-[#e5e5e5] rounded-xl no-underline text-[#0a0a0a] hover:border-[#0a0a0a] transition-colors flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#f4f4f5] flex items-center justify-center">
                  <Icon name={s.icon} />
                </div>
                {s.tag && (
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-[#0066ff] bg-[#0066ff]/10 px-2 py-0.5 rounded-full">
                    {s.tag}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold mb-2 tracking-tight">
                {s.title}
              </h2>
              <p className="text-sm text-[#666] mb-4 flex-1">{s.description}</p>
              <ul className="space-y-1.5 text-sm text-[#333] mb-4">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="text-[#00a86b] mt-0.5">+</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <span className="text-sm font-medium text-[#0a0a0a] group-hover:translate-x-0.5 transition-transform">
                Learn more →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
