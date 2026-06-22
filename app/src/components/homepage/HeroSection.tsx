import { SignupDialog } from "@/components/marketing/SignupDialog";
import { IntegrationLogos } from "@/components/homepage/IntegrationLogos";
import { RoutingDemoTerminal } from "@/components/homepage/RoutingDemoTerminal";
import { trackCtaClick } from "@/utils/analytics";

// What you get, stated as outcomes. Kept consistent with the StatBand below
// the hero (30-60% typical savings) and the observability pillar.
const BENEFITS: { title: string; detail: string }[] = [
  {
    title: "A lower bill",
    detail: "30-60% on a typical coding workload, with no quality drop on the prompts that matter.",
  },
  {
    title: "Full cost visibility",
    detail: "Per-request cost, latency, and routing decisions in response headers and the dashboard.",
  },
  {
    title: "No refactor",
    detail: "OpenAI compatible, two-line install. Keep the SDKs and tools you already use.",
  },
];

export const HeroSection = () => {
  return (
    <section className="pt-10 md:pt-14 pb-16 md:pb-20">
      <div className="max-w-[1240px] mx-auto px-6 sm:px-8">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-10 lg:gap-14 items-start">
          {/* Copy column */}
          <div className="text-left max-w-[600px] lg:max-w-none">
            <h1 className="text-[40px] sm:text-[56px] lg:text-[64px] font-semibold leading-[1.04] tracking-[-0.035em] mb-6 text-[#1d1d1f] [text-wrap:balance]">
              Route every prompt to the{" "}
              <span
                className="px-[0.05em]"
                style={{
                  backgroundImage:
                    "linear-gradient(transparent 62%, rgba(48,209,88,0.34) 62%, rgba(48,209,88,0.34) 92%, transparent 92%)",
                  WebkitBoxDecorationBreak: "clone",
                  boxDecorationBreak: "clone",
                }}
              >
                cheapest model
              </span>{" "}
              that can handle it.
            </h1>

            <p className="text-[17px] md:text-[19px] text-[#424245] mb-9 leading-[1.5] tracking-[-0.01em]">
              Nadir is an LLM router. It reads every prompt and routes it to the model that fits the job, so you stop paying frontier prices for work a smaller model handles just as well.
              <span className="text-[#1d1d1f] font-medium"> Haiku for classifications, Sonnet for refactors, Opus only when it has to think.</span>
            </p>

            <div className="flex gap-4 items-center flex-wrap mb-5">
              <SignupDialog ctaLabel="start_free" ctaLocation="hero">
                <button
                  type="button"
                  className="inline-flex items-center px-6 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out tracking-[-0.01em] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
                >
                  Start saving
                </button>
              </SignupDialog>
              <a
                href="/docs"
                onClick={() => trackCtaClick("read_docs", "hero")}
                className="inline-flex items-center text-[#1d1d1f] text-[15px] font-medium no-underline tracking-[-0.01em] hover:opacity-70 transition-opacity"
              >
                Read the docs <span className="ml-1 text-[14px]">›</span>
              </a>
            </div>

            <p className="text-[12px] text-[#86868b] font-semibold uppercase tracking-[0.1em] mb-3">
              What you get
            </p>
            <ul className="grid sm:grid-cols-3 gap-x-6 gap-y-4">
              {BENEFITS.map((b) => (
                <li key={b.title}>
                  <div className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#1d1d1f] tracking-[-0.01em]">
                    <CheckGlyph />
                    {b.title}
                  </div>
                  <p className="mt-1 text-[13px] text-[#424245] leading-[1.45] tracking-[-0.005em]">
                    {b.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Terminal demo column */}
          <RoutingDemoTerminal />
        </div>

        {/* Integrations row, honestly labeled */}
        <div className="mt-16 md:mt-20 border-t border-black/[0.06] pt-10">
          <p className="text-[12px] text-[#6e6e73] uppercase tracking-[0.12em] font-semibold mb-6 text-center">
            Drop-in replacement for the SDKs you already use
          </p>
          <IntegrationLogos />
          <div className="mt-6 text-center">
            <a
              href="/switch"
              onClick={() => trackCtaClick("see_the_switch", "hero_integrations")}
              className="inline-flex items-center text-[13.5px] font-medium text-[#1d1d1f] no-underline tracking-[-0.01em] hover:opacity-70 transition-opacity"
            >
              See the one-line switch from OpenAI or Bedrock <span className="ml-1 text-[13px]">›</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

const CheckGlyph = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="text-[#028a3e]">
    <path
      d="M3.5 8.5l3 3 6-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
