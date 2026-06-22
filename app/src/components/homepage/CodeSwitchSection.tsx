import { Link } from "react-router-dom";
import { CodeSwitchAnimation } from "@/components/marketing/CodeSwitchAnimation";
import { trackCtaClick } from "@/utils/analytics";

// Homepage band that shows, live, how little code changes to adopt Nadir.
// The provider toggle (OpenAI / Bedrock / Anthropic) makes it relatable to
// almost any visitor; the full breakdown lives on /switch.
export const CodeSwitchSection = () => (
  <section className="py-16 md:py-24 border-t border-black/[0.06]">
    <div className="max-w-[980px] mx-auto px-6 sm:px-8">
      <div className="text-center max-w-[660px] mx-auto mb-10">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#028a3e] mb-4">
          Drop-in migration
        </p>
        <h2 className="text-[32px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#1d1d1f] leading-[1.08] mb-4 [text-wrap:balance]">
          Already calling an LLM? You're two lines away.
        </h2>
        <p className="text-[16px] md:text-[18px] text-[#424245] leading-[1.5] tracking-[-0.005em]">
          Nadir is OpenAI-compatible, so switching is a base-URL swap and{" "}
          <code className="px-1.5 py-0.5 rounded-md bg-black/[0.05] font-mono text-[15px] text-[#1d1d1f]">
            model="auto"
          </code>,{" "}
          whether you're on OpenAI, AWS Bedrock, or Anthropic today. Watch it happen:
        </p>
      </div>

      <CodeSwitchAnimation analyticsLocation="homepage" />

      <div className="mt-9 text-center">
        <Link
          to="/switch"
          onClick={() => trackCtaClick("see_full_switch", "homepage_switch_section")}
          className="inline-flex items-center text-[#1d1d1f] text-[15px] font-medium no-underline tracking-[-0.01em] hover:opacity-70 transition-opacity"
        >
          See the full migration, side by side <span className="ml-1 text-[14px]">›</span>
        </Link>
      </div>
    </div>
  </section>
);
