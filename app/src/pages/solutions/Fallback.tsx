import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { trackCtaClick, trackPageView } from "@/utils/analytics";

export default function SolutionFallback() {
  useEffect(() => {
    trackPageView("solutions_fallback");
  }, []);
  return (
    <MarketingLayout>
      <SEO
        title="Fallback - Nadir"
        description="Provider outages, rate limits, and 5xx errors happen. Nadir reroutes to a healthy model in the same tier so your app stays up."
        path="/solutions/fallback"
      />

      <section className="max-w-4xl mx-auto px-6 pt-20 pb-12 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#028a3e] mb-5">
          Fallback · Reliability without paging
        </p>
        <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] text-[#1d1d1f] leading-[1.05] mb-5 [text-wrap:balance]">
          A provider goes down.{" "}
          <span
            className="px-[0.05em]"
            style={{
              backgroundImage:
                "linear-gradient(transparent 64%, rgba(48,209,88,0.34) 64%, rgba(48,209,88,0.34) 92%, transparent 92%)",
              WebkitBoxDecorationBreak: "clone",
              boxDecorationBreak: "clone",
            }}
          >
            Your app does not.
          </span>
        </h1>
        <p className="text-lg md:text-[19px] text-[#424245] max-w-[640px] mx-auto leading-[1.5] tracking-[-0.005em] mb-8">
          Anthropic rate-limited you. OpenAI is 5xx-ing. Your users don't care. Nadir reroutes to a healthy model in the same quality tier, automatically, while your competitors post status-page apologies.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">What you get</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { k: "Fewer 5xx incidents", v: "during provider outages that would otherwise reach your users" },
            { k: "Less on-call", v: "no more midnight pages for rate limits and transient 429s" },
            { k: "Revenue saved", v: "every failed request is a cart abandoned, a user frustrated, a ticket filed" },
          ].map((s) => (
            <div key={s.k} className="p-5 bg-white border border-[#e5e5e5] rounded-xl">
              <div className="text-xl font-bold text-[#0a0a0a]">{s.k}</div>
              <div className="text-sm text-[#666] mt-1">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-3">What we fall back on</h3>
            <ul className="space-y-3 text-sm text-[#333]">
              <li><strong>Rate limits:</strong> 429 from provider triggers immediate reroute</li>
              <li><strong>5xx errors:</strong> retries exhausted, reroute to peer provider</li>
              <li><strong>Health score drop:</strong> rolling window score below threshold</li>
              <li><strong>Latency SLO:</strong> sustained p95 breach on a provider</li>
            </ul>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-3">How we pick a peer</h3>
            <ul className="space-y-3 text-sm text-[#333]">
              <li><strong>Same tier:</strong> Opus down, swap to GPT-5 or Gemini 2.5 Pro</li>
              <li><strong>Live health:</strong> rolling success rate, latency, cost</li>
              <li><strong>Respects your keys:</strong> BYOK, BYOR priorities honored</li>
              <li><strong>Logged:</strong> every fallback is tagged in your analytics</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">Provider health, live</h2>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f8f8] text-[#666]">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Provider</th>
                <th className="text-left px-5 py-3 font-medium">Tier</th>
                <th className="text-left px-5 py-3 font-medium">Health</th>
                <th className="text-left px-5 py-3 font-medium">p95 latency</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { p: "Anthropic", t: "Opus, Sonnet, Haiku", h: 0.99, l: "840ms", s: "ok" },
                { p: "OpenAI", t: "GPT-5, 4.1, mini", h: 0.97, l: "1.1s", s: "ok" },
                { p: "Google", t: "Gemini 2.5 Pro, Flash", h: 0.92, l: "920ms", s: "degraded" },
                { p: "xAI", t: "Grok 4", h: 0.88, l: "1.4s", s: "degraded" },
              ].map((r) => (
                <tr key={r.p} className="border-t border-[#e5e5e5]">
                  <td className="px-5 py-3 font-medium">{r.p}</td>
                  <td className="px-5 py-3 text-[#666]">{r.t}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-[#e5e5e5] rounded overflow-hidden">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${r.h * 100}%`,
                            background: r.h > 0.95 ? "#028a3e" : "#f5a524",
                          }}
                        />
                      </div>
                      <span className="text-[#666] tabular-nums">{r.h.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[#666] tabular-nums">{r.l}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                        r.s === "ok" ? "text-[#028a3e]" : "text-[#f5a524]"
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: r.s === "ok" ? "#028a3e" : "#f5a524" }}
                      />
                      {r.s}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[#999] mt-3 text-center">
          Illustrative. Live data visible in your dashboard once you start routing.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#028a3e] mb-5">
          Set it once
        </p>
        <h3 className="text-[28px] md:text-[36px] font-semibold tracking-[-0.025em] text-[#1d1d1f] mb-3 leading-[1.15]">
          Stop babysitting providers.
        </h3>
        <p className="text-[16px] text-[#424245] mb-7 leading-[1.5] max-w-[560px] mx-auto">
          Turn on fallback once and forget about it. Every reroute is logged, so your dashboard knows what your on-call doesn't have to.
        </p>
        <SignupDialog ctaLabel="start_saving" ctaLocation="solution_fallback_bottom">
          <button
            type="button"
            onClick={() => trackCtaClick("start_saving", "solution_fallback_bottom")}
            className="inline-flex items-center gap-2 px-6 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] transition-colors tracking-[-0.01em] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
          >
            Bring your own keys
          </button>
        </SignupDialog>
      </section>
    </MarketingLayout>
  );
}
