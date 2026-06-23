import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { CodeSwitchAnimation, NADIR_BASE } from "@/components/marketing/CodeSwitchAnimation";
import { trackCtaClick, trackPageView } from "@/utils/analytics";

// "Switch to Nadir" — a downloads-page-style showcase of how little code you
// change to move an OpenAI / Bedrock / Anthropic call onto Nadir. The animated
// editor (CodeSwitchAnimation) is the centerpiece; the rest of the page frames
// it with the why and the three-step path.

const WHY = [
  {
    title: "OpenAI-compatible",
    body: "Same /v1/chat/completions endpoint, same request and response shape. Every OpenAI SDK, framework, and tool already speaks it: LangChain, the Vercel AI SDK, Cursor, your own wrappers.",
  },
  {
    title: 'model="auto"',
    body: "Stop hard-coding a model. Nadir reads each prompt and routes it to the cheapest model that still clears your quality bar (Haiku, Sonnet, or Opus) on every request.",
  },
  {
    title: "Keep your stack",
    body: "No new SDK to learn, no proxy to run, no migration window. Point the base URL at Nadir, ship, and watch the per-request cost and routing land in your dashboard.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Grab a key",
    body: "Sign up, pick how you want to run, and get a key with smart defaults. 5 requests free on our keys, no card or provider keys needed to try it.",
  },
  {
    n: "02",
    title: "Swap the base URL",
    body: `Point your existing OpenAI client at ${NADIR_BASE} and set model="auto". That's the diff above. Nothing else moves.`,
  },
  {
    n: "03",
    title: "Ship and watch",
    body: "Your app behaves exactly the same. Per-request cost, latency, and the model each prompt routed to show up live in your dashboard.",
  },
];

export default function Switch() {
  useEffect(() => {
    trackPageView("switch");
  }, []);

  return (
    <MarketingLayout>
      <SEO
        title="Switch to Nadir | One-line migration from OpenAI, Bedrock & Anthropic"
        description="Nadir is an OpenAI-compatible LLM router. Move your OpenAI, AWS Bedrock, or Anthropic calls onto Nadir by swapping the base URL and setting model=auto. See the exact diff."
        path="/switch"
      />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-10 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#028a3e] mb-5">
          Drop-in migration
        </p>
        <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] text-[#1d1d1f] leading-[1.05] mb-5 [text-wrap:balance]">
          Switch to Nadir without{" "}
          <span
            className="px-[0.05em]"
            style={{
              backgroundImage:
                "linear-gradient(transparent 64%, rgba(48,209,88,0.34) 64%, rgba(48,209,88,0.34) 92%, transparent 92%)",
              WebkitBoxDecorationBreak: "clone",
              boxDecorationBreak: "clone",
            }}
          >
            rewriting your app.
          </span>
        </h1>
        <p className="text-lg md:text-[19px] text-[#424245] max-w-[640px] mx-auto leading-[1.5] tracking-[-0.005em]">
          Nadir is OpenAI-compatible. Whether you're on the OpenAI SDK, AWS Bedrock, or the
          Anthropic SDK today, the migration is the same: point at one base URL and set{" "}
          <code className="px-1.5 py-0.5 rounded-md bg-black/[0.05] font-mono text-[15px] text-[#1d1d1f]">
            model="auto"
          </code>
          .
        </p>
      </section>

      {/* The animated switch */}
      <section className="px-6 pb-16">
        <CodeSwitchAnimation analyticsLocation="switch" />
        <p className="text-center text-[13px] text-[#86868b] mt-8 tracking-[-0.005em]">
          That's the whole migration. No new SDK, no proxy to run, no response remapping.
        </p>
      </section>

      {/* Why it's a drop-in */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2 text-center text-[#1d1d1f]">
          Why it's only one line
        </h2>
        <p className="text-center text-[#666] mb-8 max-w-2xl mx-auto">
          Nadir speaks the API your tools already use, so the switch is configuration, not a rewrite.
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {WHY.map((w) => (
            <div key={w.title} className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
              <h3 className="font-semibold mb-2 font-mono text-[15px] text-[#1d1d1f]">{w.title}</h3>
              <p className="text-sm text-[#666] leading-relaxed">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Three steps */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-8 text-center text-[#1d1d1f]">Live in three steps</h2>
        <div className="space-y-3">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-4 p-5 bg-white border border-[#e5e5e5] rounded-xl">
              <div className="text-[#999] font-mono text-sm shrink-0 w-10 pt-0.5">{s.n}</div>
              <div>
                <h3 className="font-semibold mb-1 text-[#1d1d1f]">{s.title}</h3>
                <p className="text-sm text-[#666]">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#028a3e] mb-5">
          Pay only on savings
        </p>
        <h3 className="text-[28px] md:text-[36px] font-semibold tracking-[-0.025em] text-[#1d1d1f] mb-3 leading-[1.15]">
          Change two lines. Cut your bill.
        </h3>
        <p className="text-[16px] text-[#424245] mb-7 leading-[1.5] max-w-[560px] mx-auto">
          Get a key in under a minute, paste the snippet above, and see real routing on your own
          traffic. You only pay a share of what we save you.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <SignupDialog ctaLabel="start_saving" ctaLocation="switch_bottom">
            <button
              type="button"
              onClick={() => trackCtaClick("start_saving", "switch_bottom")}
              className="inline-flex items-center gap-2 px-6 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] transition-colors tracking-[-0.01em] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
            >
              Get your key
            </button>
          </SignupDialog>
          <a
            href="/docs"
            onClick={() => trackCtaClick("read_docs", "switch_bottom")}
            className="inline-flex items-center text-[#1d1d1f] text-[15px] font-medium no-underline tracking-[-0.01em] hover:opacity-70 transition-opacity"
          >
            Read the docs <span className="ml-1 text-[14px]">›</span>
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
}
