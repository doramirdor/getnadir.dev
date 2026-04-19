import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { trackCtaClick } from "@/utils/analytics";

// Real Anthropic published rates (per million tokens, April 2026).
// Haiku 4.5: $1 in / $5 out. Sonnet 4.6: $3 / $15. Opus 4.7: $5 / $25.
const RATES: Record<string, [number, number]> = {
  haiku: [1, 5],
  sonnet: [3, 15],
  opus: [5, 25],
};

const tokCost = (inTok: number, outTok: number, rates: [number, number]) =>
  (inTok * rates[0]) / 1e6 + (outTok * rates[1]) / 1e6;

type Req = {
  type: "simple" | "complex";
  prompt: string;
  model: string;
  routeTo: "haiku" | "sonnet" | "opus";
  inTok: number;
  outTok: number;
  cost: number;
  premiumCost: number;
};

const REQUESTS: Req[] = (
  [
    { type: "simple", prompt: '"Summarize this support ticket"', model: "haiku-4.5", routeTo: "haiku", inTok: 420, outTok: 140 },
    { type: "simple", prompt: '"Classify sentiment of this email"', model: "haiku-4.5", routeTo: "haiku", inTok: 180, outTok: 60 },
    { type: "complex", prompt: '"Refactor this auth module"', model: "sonnet-4.6", routeTo: "sonnet", inTok: 4200, outTok: 1800 },
    { type: "complex", prompt: '"Debug this race condition"', model: "sonnet-4.6", routeTo: "sonnet", inTok: 3800, outTok: 2400 },
    { type: "simple", prompt: '"Write a docstring for get_user()"', model: "haiku-4.5", routeTo: "haiku", inTok: 260, outTok: 90 },
    { type: "complex", prompt: '"Design a migration plan"', model: "opus-4.7", routeTo: "opus", inTok: 900, outTok: 300 },
  ] as const
).map((r) => ({
  ...r,
  cost: tokCost(r.inTok, r.outTok, RATES[r.routeTo]),
  premiumCost: tokCost(r.inTok, r.outTok, RATES.opus),
}));

const fmtCost = (n: number) =>
  n < 0.01 ? `$${n.toFixed(4)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;

export const HeroSection = () => {
  const [visibleRows, setVisibleRows] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleRows(REQUESTS.length);
      setShowStats(true);
      return;
    }
    const el = terminalRef.current;
    if (!el) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          REQUESTS.forEach((_, i) => {
            timers.push(setTimeout(() => setVisibleRows(i + 1), 400 + i * 480));
          });
          timers.push(setTimeout(() => setShowStats(true), 400 + REQUESTS.length * 480 + 280));
          obs.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const totalWith = REQUESTS.reduce((s, r) => s + r.cost, 0);
  const totalWithout = REQUESTS.reduce((s, r) => s + r.premiumCost, 0);
  const savingsPct = Math.round(((totalWithout - totalWith) / totalWithout) * 100);

  return (
    <section className="pt-20 md:pt-32 pb-16 md:pb-20 text-center">
      <div className="max-w-[1040px] mx-auto px-6 sm:px-8">
        <h1 className="text-[44px] sm:text-[64px] md:text-[80px] font-semibold leading-[1.04] tracking-[-0.035em] mb-6 max-w-[920px] mx-auto text-[#1d1d1f]">
          Cut your LLM bill
          <br />
          <span className="text-[#86868b]">up to 40%.</span>
        </h1>

        <p className="text-lg md:text-[21px] text-[#424245] max-w-[620px] mx-auto mb-11 leading-[1.42] tracking-[-0.01em]">
          <strong className="font-semibold text-[#1d1d1f]">Nadir</strong> reads every prompt and routes it to the right model for the task. Premium when it's complex. Lighter when it's not.
        </p>

        <div className="flex gap-6 justify-center items-center flex-wrap mb-4">
          <SignupDialog ctaLabel="start_saving" ctaLocation="hero">
            <button
              type="button"
              className="inline-flex items-center px-6 py-3 bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#333] transition-colors tracking-[-0.01em]"
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
        <p className="text-[13px] text-[#86868b] mb-3">
          Free to start. No credit card. Bring your own keys.
        </p>
        <p className="text-[12px] text-[#86868b] mb-16 md:mb-20 tracking-[-0.005em]">
          One URL &middot; OpenAI compatible &middot; Open source
        </p>

        {/* Mac-window live demo */}
        <div
          ref={terminalRef}
          className="max-w-[960px] mx-auto bg-white border border-black/[0.08] rounded-[18px] overflow-hidden text-left"
          style={{ boxShadow: "0 40px 80px -24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.04)" }}
        >
          <div className="relative flex items-center px-5 py-3 border-b border-black/[0.06] bg-[#fbfbfd]">
            <div className="flex gap-2">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="absolute left-1/2 -translate-x-1/2 text-[12px] text-[#86868b] font-medium">
              api.getnadir.com
            </span>
          </div>

          <div className="px-5 pt-5 pb-6 md:px-6 md:pb-7">
            <div className="hidden sm:grid gap-2.5 px-2 pb-3.5 text-[10px] text-[#86868b] uppercase tracking-[0.08em] font-semibold" style={{ gridTemplateColumns: "90px 1fr auto auto" }}>
              <div>Type</div>
              <div>Prompt</div>
              <div>Routed to</div>
              <div className="text-right">Cost</div>
            </div>

            {REQUESTS.map((req, i) => {
              const visible = i < visibleRows;
              const saved = req.premiumCost > req.cost;
              return (
                <div
                  key={i}
                  className="grid gap-2.5 items-center px-2 py-2.5 rounded-lg mb-0.5 text-[13px] transition-all duration-500"
                  style={{
                    gridTemplateColumns: "90px 1fr auto auto",
                    background: visible && saved ? "rgba(48,209,88,0.06)" : "transparent",
                    opacity: visible ? 1 : 0,
                    transform: visible ? "none" : "translateY(8px)",
                  }}
                >
                  <span
                    className="text-[10px] font-semibold px-2 py-[3px] rounded uppercase tracking-[0.08em] justify-self-start"
                    style={{
                      background: req.type === "simple" ? "rgba(48,209,88,0.12)" : "rgba(0,113,227,0.10)",
                      color: req.type === "simple" ? "#028a3e" : "#0071e3",
                    }}
                  >
                    {req.type}
                  </span>
                  <span className="text-[#424245] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px]">
                    {req.prompt}
                  </span>
                  <span className="font-medium text-[#1d1d1f] font-mono text-[12px]">
                    {req.model}
                  </span>
                  <span className="flex items-center gap-2 justify-end min-w-[120px]">
                    {saved && (
                      <span className="text-[#c7c7cc] line-through text-[11px] font-mono">
                        {fmtCost(req.premiumCost)}
                      </span>
                    )}
                    <span
                      className="font-semibold font-mono text-[12px]"
                      style={{ color: saved ? "#028a3e" : "#1d1d1f" }}
                    >
                      {fmtCost(req.cost)}
                    </span>
                  </span>
                </div>
              );
            })}

            <div
              className="mt-4 pt-4 border-t border-black/[0.06] flex items-center justify-between gap-3 flex-wrap transition-all duration-500"
              style={{
                opacity: showStats ? 1 : 0,
                transform: showStats ? "none" : "translateY(6px)",
              }}
            >
              <div className="text-[13px] text-[#424245]">
                Would have cost{" "}
                <span className="line-through text-[#86868b] font-mono">{fmtCost(totalWithout)}</span>
                . You paid{" "}
                <span className="text-[#1d1d1f] font-semibold font-mono">{fmtCost(totalWith)}</span>
                .
              </div>
              <span className="text-[15px] font-semibold text-[#028a3e] tracking-[-0.01em]">
                {savingsPct}% saved
              </span>
            </div>
            <p className="mt-3 text-[11px] text-[#86868b] leading-[1.5] tracking-[-0.005em]">
              Based on a sample of six prompts at current Anthropic rates. Your savings vary with your workload.
            </p>
          </div>
        </div>

        {/* Logos row */}
        <div className="mt-16 md:mt-20">
          <p className="text-[12px] text-[#86868b] uppercase tracking-[0.12em] font-medium mb-7">
            Works with the tools your team already uses
          </p>
          <div className="flex justify-center items-center gap-x-10 gap-y-4 flex-wrap">
            {["Claude Code", "Cursor", "Codex", "Aider", "Windsurf", "Continue", "LangChain", "OpenAI SDK"].map((item) => (
              <span key={item} className="text-[15px] md:text-[16px] text-[#86868b] font-medium tracking-[-0.012em]">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
