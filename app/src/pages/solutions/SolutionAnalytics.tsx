import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { trackCtaClick, trackPageView } from "@/utils/analytics";

export default function SolutionAnalytics() {
  useEffect(() => {
    trackPageView("solutions_analytics");
  }, []);
  return (
    <MarketingLayout>
      <SEO
        title="Analytics - Nadir"
        description="Per-request logs, spend breakdowns, latency percentiles, routing accuracy, and catastrophic-route detection. Built into every Nadir account."
        path="/solutions/analytics"
      />

      <section className="max-w-4xl mx-auto px-6 pt-20 pb-12 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#028a3e] mb-5">
          Analytics · Cost, latency, and quality, per request
        </p>
        <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] text-[#1d1d1f] leading-[1.05] mb-5 [text-wrap:balance]">
          Walk into finance review{" "}
          <span
            className="px-[0.05em]"
            style={{
              backgroundImage:
                "linear-gradient(transparent 64%, rgba(48,209,88,0.34) 64%, rgba(48,209,88,0.34) 92%, transparent 92%)",
              WebkitBoxDecorationBreak: "clone",
              boxDecorationBreak: "clone",
            }}
          >
            with the actual number.
          </span>
        </h1>
        <p className="text-lg md:text-[19px] text-[#424245] max-w-[640px] mx-auto leading-[1.5] tracking-[-0.005em] mb-8">
          The exact dollar figure you saved. The exact model mix that saved it. The exact requests you'd route differently next month. Every Nadir account gets this on day one.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2 text-center">The outcomes you walk away with</h2>
        <p className="text-center text-[#666] mb-8 max-w-2xl mx-auto">
          Not a dashboard for dashboards' sake. Every chart is tied to a decision your team needs to make.
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { label: "Saved this month", value: "$4,812", sub: "vs always-Opus 4.6", color: "#028a3e" },
            { label: "Requests routed", value: "1.8M", sub: "across 3 providers", color: "#0066ff" },
            { label: "Catastrophic routes", value: "0.00%", sub: "quality stayed flat", color: "#7c3aed" },
          ].map((k) => (
            <div key={k.label} className="p-5 bg-white border border-[#e5e5e5] rounded-xl">
              <div className="text-xs text-[#666] mb-1">{k.label}</div>
              <div className="text-3xl font-bold tracking-tight" style={{ color: k.color }}>{k.value}</div>
              <div className="text-xs text-[#999] mt-1">{k.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2 text-center">Four questions, four answers</h2>
        <p className="text-center text-[#666] mb-8 max-w-2xl mx-auto">
          The questions your CFO, your PM, your on-call, and your legal team already ask you. Nadir answers them with data, not slides.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#028a3e] mb-1">For finance</div>
            <h3 className="text-lg font-semibold mb-2">"What did LLMs cost us this month, and is it going up or down?"</h3>
            <p className="text-sm text-[#666] mb-3">
              Actual dollar spend vs always-Opus benchmark, broken down by product surface, team, or API key. Trendlines, forecast, burn rate, and a one-click export for your monthly accruals.
            </p>
            <ul className="space-y-1.5 text-sm text-[#333]">
              <li>+ Month-over-month savings trend</li>
              <li>+ Spend by product, team, customer, API key</li>
              <li>+ CSV export and S3 firehose</li>
            </ul>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#028a3e] mb-1">For product</div>
            <h3 className="text-lg font-semibold mb-2">"Which features are expensive, and are they worth it?"</h3>
            <p className="text-sm text-[#666] mb-3">
              Spend and quality per feature, per user cohort, per prompt cluster. See which workloads drive cost, which drive value, and which quietly do neither.
            </p>
            <ul className="space-y-1.5 text-sm text-[#333]">
              <li>+ Cost per user, per session, per feature</li>
              <li>+ Quality and latency side-by-side with cost</li>
              <li>+ Cohort filters that match your product analytics</li>
            </ul>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#028a3e] mb-1">For on-call</div>
            <h3 className="text-lg font-semibold mb-2">"Is it our app, or is it the provider?"</h3>
            <p className="text-sm text-[#666] mb-3">
              p50, p95, p99 latency by provider and model. Fallback events, rolling health scores, and a timeline you can drop into an incident doc in seconds.
            </p>
            <ul className="space-y-1.5 text-sm text-[#333]">
              <li>+ Per-provider error breakdown with root cause</li>
              <li>+ Alerting webhooks on SLO breach</li>
              <li>+ One-click runbook links on every alert</li>
            </ul>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#028a3e] mb-1">For legal and security</div>
            <h3 className="text-lg font-semibold mb-2">"Where did this prompt go, and who saw it?"</h3>
            <p className="text-sm text-[#666] mb-3">
              Full audit trail per request. Opt-in prompt storage with SHA-256 hashing when off. User-scoped RLS on every log row. SOC 2 controls in progress.
            </p>
            <ul className="space-y-1.5 text-sm text-[#333]">
              <li>+ Per-request provider, region, model, timestamp</li>
              <li>+ PII redaction hooks</li>
              <li>+ Tenant-level retention windows</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">What changes in your week</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              title: "The finance thread goes quiet",
              body: "Your CFO stops pinging you about the LLM line item. You send a dashboard link once a month and the conversation ends.",
            },
            {
              title: "Pricing conversations get data",
              body: "Unit-economics conversations stop being guesswork. You know the cost of a chat, a document, a user, and you can price your product accordingly.",
            },
            {
              title: "Incident response speeds up",
              body: "Provider flapping? You know before the status page does. Latency regressions get attributed to the right model in the first 5 minutes, not the first hour.",
            },
            {
              title: "Quality regressions get caught",
              body: "A model update silently changes outputs. Catastrophic-route detection and per-cluster quality deltas surface the drift before your users do.",
            },
          ].map((o) => (
            <div key={o.title} className="p-5 bg-white border border-[#e5e5e5] rounded-xl">
              <h3 className="font-semibold mb-1">{o.title}</h3>
              <p className="text-sm text-[#666]">{o.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">Routed mix, last 30 days</h2>
        <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
          <div className="flex h-10 w-full rounded overflow-hidden text-[11px] font-semibold text-white">
            <div className="bg-[#028a3e] flex items-center justify-center" style={{ width: "58%" }}>Haiku 58%</div>
            <div className="bg-[#0066ff] flex items-center justify-center" style={{ width: "31%" }}>Sonnet 31%</div>
            <div className="bg-[#7c3aed] flex items-center justify-center" style={{ width: "11%" }}>Opus 11%</div>
          </div>
          <p className="text-xs text-[#666] mt-3">
            Typical Nadir account. Heavy workloads shift toward Sonnet and Opus, but most traffic still routes to Haiku.
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#028a3e] mb-5">
          Day one, not week six
        </p>
        <h3 className="text-[28px] md:text-[36px] font-semibold tracking-[-0.025em] text-[#1d1d1f] mb-3 leading-[1.15]">
          Stop guessing what LLMs cost you.
        </h3>
        <p className="text-[16px] text-[#424245] mb-7 leading-[1.5] max-w-[560px] mx-auto">
          Route your first prompt and the dashboard populates immediately. The first monthly report writes itself.
        </p>
        <SignupDialog ctaLabel="start_saving" ctaLocation="solution_analytics_bottom">
          <button
            type="button"
            onClick={() => trackCtaClick("start_saving", "solution_analytics_bottom")}
            className="inline-flex items-center gap-2 px-6 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] transition-colors tracking-[-0.01em] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
          >
            Start free, bring your own keys
          </button>
        </SignupDialog>
      </section>
    </MarketingLayout>
  );
}
