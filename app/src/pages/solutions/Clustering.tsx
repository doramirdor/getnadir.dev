import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { trackCtaClick, trackPageView, trackWaitlistSignup } from "@/utils/analytics";
import { supabase } from "@/integrations/supabase/client";

// Each cluster carries a routing mix because individual prompts inside a
// cluster can still escalate via the content gate when complexity warrants —
// a "summarize ticket" prompt with 14k tokens of legal-flagged content goes
// to Opus even though the cluster's centroid is judged-safe on Haiku.
type RoutingMix = { haiku: number; sonnet: number; opus: number };

const TIER_COLOR = {
  haiku: "#00a86b",
  sonnet: "#0066ff",
  opus: "#f59e0b",
};

const MOCK_CLUSTERS: Array<{
  name: string;
  size: number;
  avg: string;
  centroid: "Haiku 4.5" | "Sonnet 4.6" | "Opus 4.6";
  mix: RoutingMix;
  save: number;
  tag: string;
}> = [
  { name: "Summarize customer ticket", size: 38214, avg: "$0.0031", centroid: "Haiku 4.5", mix: { haiku: 0.84, sonnet: 0.13, opus: 0.03 }, save: 0.71, tag: "support" },
  { name: "Generate product description", size: 21987, avg: "$0.0058", centroid: "Sonnet 4.6", mix: { haiku: 0.18, sonnet: 0.74, opus: 0.08 }, save: 0.48, tag: "marketing" },
  { name: "Classify intent", size: 18402, avg: "$0.0009", centroid: "Haiku 4.5", mix: { haiku: 0.97, sonnet: 0.03, opus: 0 }, save: 0.83, tag: "routing" },
  { name: "Extract structured data from PDF", size: 12044, avg: "$0.018", centroid: "Opus 4.6", mix: { haiku: 0, sonnet: 0.11, opus: 0.89 }, save: 0.22, tag: "ocr" },
  { name: "Code review, repo context", size: 8712, avg: "$0.041", centroid: "Opus 4.6", mix: { haiku: 0, sonnet: 0.06, opus: 0.94 }, save: 0.14, tag: "engineering" },
  { name: "Translate EN to JA", size: 6530, avg: "$0.0021", centroid: "Haiku 4.5", mix: { haiku: 0.91, sonnet: 0.08, opus: 0.01 }, save: 0.68, tag: "i18n" },
  { name: "SQL generation", size: 5218, avg: "$0.012", centroid: "Sonnet 4.6", mix: { haiku: 0.04, sonnet: 0.78, opus: 0.18 }, save: 0.36, tag: "analytics" },
];

const RoutingMixBar = ({ mix }: { mix: RoutingMix }) => {
  const segs = [
    { key: "haiku", color: TIER_COLOR.haiku, pct: mix.haiku, label: "Haiku" },
    { key: "sonnet", color: TIER_COLOR.sonnet, pct: mix.sonnet, label: "Sonnet" },
    { key: "opus", color: TIER_COLOR.opus, pct: mix.opus, label: "Opus" },
  ].filter((s) => s.pct > 0);
  return (
    <div className="flex h-1.5 w-28 rounded overflow-hidden bg-[#e5e5e5]">
      {segs.map((s) => (
        <div
          key={s.key}
          style={{ width: `${s.pct * 100}%`, background: s.color }}
          title={`${s.label} ${(s.pct * 100).toFixed(0)}%`}
        />
      ))}
    </div>
  );
};

const Bubble = ({
  x,
  y,
  r,
  label,
  color,
}: {
  x: number;
  y: number;
  r: number;
  label: string;
  color: string;
}) => (
  <g>
    <circle cx={x} cy={y} r={r} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.2} />
    <circle cx={x} cy={y} r={3} fill={color} />
    <text x={x} y={y - r - 6} textAnchor="middle" fontSize="10" fill="#333" fontWeight={500}>
      {label}
    </text>
  </g>
);

export default function SolutionClustering() {
  useEffect(() => {
    trackPageView("solutions_clustering");
  }, []);
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleWaitlist = (source: string) => async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("waitlist").insert({
        email: trimmed,
        source: `solutions_clustering_${source}`,
        user_id: user?.id ?? null,
        metadata: { page: "/solutions/clustering" },
      });
      if (error && error.code !== "23505") throw error;
      trackWaitlistSignup("email", source);
      setJoined(true);
    } catch {
      // Silent failure on the marketing page — still flip the UI so the user isn't blocked.
      trackWaitlistSignup("email", source);
      setJoined(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingLayout>
      <SEO
        title="Prompt Clustering (Coming Soon) - Nadir"
        description="See the real shape of your LLM traffic. Prompt Clustering groups semantically similar prompts, surfaces duplicates, and tells you which workloads drive your bill."
        path="/solutions/clustering"
      />

      <section className="max-w-4xl mx-auto px-6 pt-20 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0066ff]/10 text-[12px] font-semibold text-[#0066ff] mb-5">
          Coming soon
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Prompt Clustering
        </h1>
        <p className="text-xl text-[#666] max-w-2xl mx-auto mb-8">
          Most teams have no idea what shape their LLM traffic actually takes. Prompt Clustering groups semantically similar prompts, flags duplicates, and shows you exactly which workloads are driving your bill, which ones are quietly eating your quality, and which ones can be auto-handled without a human in the loop.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#e5e5e5] bg-white text-[12px] text-[#666] mb-8">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00a86b]" /> Works as a proxy
          </span>
          <span className="text-[#ccc]">·</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0066ff]" /> Works as a standalone agent
          </span>
        </div>
        <form
          onSubmit={handleWaitlist("clustering_hero")}
          className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="flex-1 px-4 py-2.5 rounded-lg border border-[#e5e5e5] text-[14px] focus:outline-none focus:border-[#0a0a0a]"
          />
          <button
            type="submit"
            disabled={joined || submitting}
            className="px-5 py-2.5 bg-[#0a0a0a] text-white rounded-lg text-[14px] font-semibold hover:bg-[#333] transition-all disabled:opacity-60"
          >
            {joined ? "You're on the list" : submitting ? "Saving..." : "Join waitlist"}
          </button>
        </form>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="p-6 sm:p-8 bg-white border border-[#e5e5e5] rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-[#666] uppercase tracking-wider font-semibold">Preview</div>
              <h2 className="text-lg font-semibold mt-1">Cluster map, last 30 days</h2>
            </div>
            <div className="text-xs text-[#999]">Illustrative</div>
          </div>
          <div className="rounded-xl border border-[#f0f0f0] bg-[#fafafa] overflow-hidden">
            <svg viewBox="0 0 720 320" className="w-full h-auto">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#efefef" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="720" height="320" fill="url(#grid)" />
              <Bubble x={150} y={110} r={46} label="Summarize tickets" color="#00a86b" />
              <Bubble x={290} y={180} r={32} label="Product copy" color="#0066ff" />
              <Bubble x={210} y={240} r={26} label="Intent classify" color="#00a86b" />
              <Bubble x={430} y={100} r={24} label="PDF extract" color="#7c3aed" />
              <Bubble x={540} y={180} r={20} label="Code review" color="#7c3aed" />
              <Bubble x={620} y={95} r={16} label="Translate" color="#00a86b" />
              <Bubble x={470} y={240} r={14} label="SQL gen" color="#0066ff" />
            </svg>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 mt-5 text-center">
            <div>
              <div className="text-2xl font-bold text-[#0a0a0a]">128</div>
              <div className="text-xs text-[#666]">clusters detected</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#0a0a0a]">24%</div>
              <div className="text-xs text-[#666]">near-duplicate prompts</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#0a0a0a]">$6.4k</div>
              <div className="text-xs text-[#666]">addressable waste / mo</div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2 text-center">Two ways to run it</h2>
        <p className="text-center text-[#666] mb-8 max-w-2xl mx-auto">
          You don't have to route through us to use Clustering. Pick the mode that fits your stack.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#0066ff] mb-2">Proxy mode</div>
            <h3 className="text-lg font-semibold mb-3">Built into your Nadir router</h3>
            <p className="text-sm text-[#666] mb-4">
              Every prompt that hits Nadir gets embedded, clustered, labeled, and fed back to the router. Clustering becomes a free signal layered on your existing routing traffic. Zero extra integration work.
            </p>
            <ul className="space-y-1.5 text-sm text-[#333]">
              <li>+ No new SDK, no extra latency</li>
              <li>+ Clusters feed the router automatically</li>
              <li>+ Shows up in your existing Analytics</li>
            </ul>
          </div>
          <div className="p-6 bg-[#0a0a0a] text-white rounded-xl ring-2 ring-[#0066ff]">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-[#0066ff] mb-2">Agent mode</div>
            <h3 className="text-lg font-semibold mb-3">Standalone clustering agent</h3>
            <p className="text-sm text-gray-300 mb-4">
              Don't want to proxy? Run Clustering as a dedicated agent. Stream prompts and responses into its API, get back cluster assignments, summaries, drift alerts, and per-cluster routing recommendations. Bring your own LLM provider, bring your own router.
            </p>
            <ul className="space-y-1.5 text-sm text-gray-200">
              <li>+ HTTP and gRPC endpoints, async batch ingest</li>
              <li>+ Works with LiteLLM, LangChain, raw OpenAI SDKs, anything that logs prompts</li>
              <li>+ On-prem, VPC, or hosted. Your call.</li>
              <li>+ Export clusters into your warehouse, eval harness, or Retool</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2 text-center">Why we think this is huge</h2>
        <p className="text-center text-[#666] mb-8 max-w-2xl mx-auto">
          Routing and fallback are table stakes. Clustering is what turns Nadir from a cost-saver into a product-intelligence layer for your LLM workloads.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              title: "Finds the 20% of traffic driving 80% of spend",
              body: "Every LLM bill has a long tail. Clustering puts a name on the head of the distribution so you can negotiate it, cache it, or retire it.",
            },
            {
              title: "Turns logs into product insights",
              body: "You already have millions of prompts flowing through. They're a gold mine of user intent data no one on your team has time to read. Clustering reads it for you.",
            },
            {
              title: "Auto-triages workloads",
              body: "A cluster of prompts that's cheap, boring, and high-volume? Pin it to Haiku and walk away. A cluster that's drifting in quality? Auto-upgrade and flag for review.",
            },
            {
              title: "Early warning system",
              body: "A new cluster on Tuesday afternoon is almost always a new feature shipping, a regression, or abuse. You hear about it in Slack before finance hears about it on the invoice.",
            },
            {
              title: "Eval without the eval team",
              body: "Per-cluster quality scores let you A/B model swaps safely. Swap Opus→Sonnet on cluster X, watch the quality delta, roll back or roll forward with data.",
            },
            {
              title: "Unlocks per-cluster billing",
              body: "Multi-tenant SaaS? Price per cluster. Charge more for \"code review\" than \"summarize ticket\" because Clustering knows which is which.",
            },
          ].map((o) => (
            <div key={o.title} className="p-5 bg-white border border-[#e5e5e5] rounded-xl">
              <h3 className="font-semibold mb-1">{o.title}</h3>
              <p className="text-sm text-[#666]">{o.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2 text-center">Top clusters, drill-down</h2>
        <p className="text-center text-[#666] mb-4 max-w-2xl mx-auto">
          A cluster groups prompts by semantic similarity, not complexity. Inside one cluster, the routing mix shows how prompts split across models — outliers (long context, sensitive content) still escalate via the content gate.
        </p>
        <div className="flex items-center justify-center gap-4 mb-6 text-[12px] text-[#666]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: TIER_COLOR.haiku }} /> Haiku
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: TIER_COLOR.sonnet }} /> Sonnet
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: TIER_COLOR.opus }} /> Opus
          </span>
        </div>
        <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f8f8] text-[#666]">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Cluster</th>
                <th className="text-left px-5 py-3 font-medium">Tag</th>
                <th className="text-right px-5 py-3 font-medium">Prompts</th>
                <th className="text-right px-5 py-3 font-medium">Avg cost</th>
                <th className="text-left px-5 py-3 font-medium">Routing mix</th>
                <th className="text-right px-5 py-3 font-medium">Potential save</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_CLUSTERS.map((c) => (
                <tr key={c.name} className="border-t border-[#e5e5e5]">
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3">
                    <span className="text-[11px] font-medium bg-[#f4f4f5] text-[#666] px-2 py-0.5 rounded-full">
                      {c.tag}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{c.size.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-[#666]">{c.avg}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <RoutingMixBar mix={c.mix} />
                      <span className="text-[11px] text-[#666] tabular-nums whitespace-nowrap">
                        {c.mix.haiku > 0 && <span className="text-[#00a86b] font-medium">{Math.round(c.mix.haiku * 100)}%</span>}
                        {c.mix.haiku > 0 && (c.mix.sonnet > 0 || c.mix.opus > 0) && " / "}
                        {c.mix.sonnet > 0 && <span className="text-[#0066ff] font-medium">{Math.round(c.mix.sonnet * 100)}%</span>}
                        {c.mix.sonnet > 0 && c.mix.opus > 0 && " / "}
                        {c.mix.opus > 0 && <span className="text-[#f59e0b] font-medium">{Math.round(c.mix.opus * 100)}%</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="inline-flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#e5e5e5] rounded overflow-hidden">
                        <div
                          className="h-full bg-[#00a86b] rounded"
                          style={{ width: `${Math.round(c.save * 100)}%` }}
                        />
                      </div>
                      <span className="text-[#00a86b] font-semibold tabular-nums">
                        {Math.round(c.save * 100)}%
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2 text-center">Recommendations, per cluster</h2>
        <p className="text-center text-[#666] mb-8 max-w-2xl mx-auto">
          Every cluster comes with concrete, applicable suggestions. One click and the change ships through the same router that's already serving your traffic.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              cluster: "Summarize customer ticket",
              tag: "support",
              title: "Cap output tokens at 200",
              impact: "~$38/mo",
              body: "Avg output is 110 tokens; current max is 1024. Capping trims wasted spend without changing 99% of outputs.",
            },
            {
              cluster: "Summarize customer ticket",
              tag: "support",
              title: "Enable semantic cache for support summaries",
              impact: "~$64/mo",
              body: "Detected 18% near-duplicate ratio. Caching past similarity 0.92 saves the long tail.",
            },
            {
              cluster: "SQL generation",
              tag: "analytics",
              title: "Pre-compact schema context",
              impact: "~$47/mo",
              body: "60% of input tokens is schema dump. Compacting via column allowlist trims spend without hurting accuracy.",
            },
            {
              cluster: "Generate product description",
              tag: "marketing",
              title: "Promote tagline sub-cluster to Haiku",
              impact: "~$88/mo",
              body: "~3.2k tagline prompts judge-eligible for Haiku. Splitting them out drops cost without touching brand voice.",
            },
            {
              cluster: "Extract structured data from PDF",
              tag: "ocr",
              title: "Pre-OCR with Tesseract, route to Sonnet",
              impact: "~$220/mo",
              body: "11% already work on Sonnet when text is pre-extracted. Adding a Tesseract pre-pass could lift that to 60%.",
            },
            {
              cluster: "Code review with repo context",
              tag: "engineering",
              title: "Split single-file diffs into a sub-cluster",
              impact: "~$95/mo",
              body: "~6% of requests are <500 LOC, judge-eligible for Sonnet. Promoting the sub-cluster cuts cost on the easy lane.",
            },
          ].map((r) => (
            <div
              key={r.cluster + r.title}
              className="p-5 bg-white border border-[#e5e5e5] rounded-xl"
              style={{ borderLeftWidth: 3, borderLeftColor: "#0066ff" }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-medium bg-[#f4f4f5] text-[#666] px-2 py-0.5 rounded-full">
                  {r.tag} · {r.cluster}
                </span>
                <span className="text-[12px] font-mono text-[#00a86b] font-semibold whitespace-nowrap">{r.impact}</span>
              </div>
              <h3 className="font-semibold mb-1">{r.title}</h3>
              <p className="text-sm text-[#666]">{r.body}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-[12px] text-[#999] mt-6">
          Recommendations are auto-generated from cluster judge results, token usage, and content-gate behavior. Apply with a click — Nadir wires the change into your router.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">What clustering gives you</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-2">See the shape of your traffic</h3>
            <p className="text-sm text-[#666]">
              Embeddings group semantically similar prompts even when the wording differs. One glance tells you whether "summarize ticket" is 3% of your spend or 40%.
            </p>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-2">Catch duplicate work</h3>
            <p className="text-sm text-[#666]">
              Near-duplicate prompts become obvious. Cache them, batch them, or move them to a cheaper tier. Most accounts find 15-30% of traffic is near-duplicate.
            </p>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-2">Per-cluster quality and cost</h3>
            <p className="text-sm text-[#666]">
              Not just "how much did this cluster cost" but "how did quality move when we routed it to Sonnet instead of Opus." Cost and quality side by side.
            </p>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-2">Router feedback loop</h3>
            <p className="text-sm text-[#666]">
              Clusters become training signal. The router learns that this shape of prompt is safe on Haiku, that shape needs Opus, and tightens accordingly.
            </p>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-2">Drift detection</h3>
            <p className="text-sm text-[#666]">
              A new cluster appears out of nowhere on Tuesday. That's usually a new feature shipping, or a bug hammering your API. You'll know before your finance team does.
            </p>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-2">Export anywhere</h3>
            <p className="text-sm text-[#666]">
              Cluster labels, centroids, and per-cluster stats flow out via API and webhook. Feed them into your warehouse, alerting, or internal eval harness.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">How it will work</h2>
        <div className="space-y-4">
          {[
            {
              step: "01",
              title: "Embed every routed prompt",
              body: "A small local embedding model runs inline. Prompts never leave your tenant, and storage is opt-in per key.",
            },
            {
              step: "02",
              title: "Online clustering",
              body: "Streaming HDBSCAN-style clustering assigns each prompt to an existing cluster or spawns a new one. No batch job to schedule.",
            },
            {
              step: "03",
              title: "Label and summarize",
              body: "A lightweight LLM pass names each cluster and writes a one-line summary so you can scan the list, not squint at centroids.",
            },
            {
              step: "04",
              title: "Per-cluster routing policy",
              body: "Pin a cluster to a specific model, a fallback chain, or a quality floor. The router treats that cluster as a first-class entity.",
            },
            {
              step: "05",
              title: "Drift and anomaly alerts",
              body: "New clusters, spikes in existing clusters, and quality regressions fire webhooks so you hear about it in Slack, not on the invoice.",
            },
          ].map((s) => (
            <div
              key={s.step}
              className="flex gap-4 p-5 bg-white border border-[#e5e5e5] rounded-xl"
            >
              <div className="text-[#999] font-mono text-sm shrink-0 w-10">{s.step}</div>
              <div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-sm text-[#666]">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">Privacy model</h2>
        <div className="p-6 bg-[#0a0a0a] text-white rounded-xl">
          <ul className="space-y-3 text-sm text-gray-200">
            <li>
              <strong className="text-white">Opt-in prompt storage.</strong> Clustering on raw text requires your explicit opt-in. Off by default.
            </li>
            <li>
              <strong className="text-white">Embed-only mode.</strong> Prefer not to store text? Cluster on embeddings alone. You get the shape of your traffic, we never see the words.
            </li>
            <li>
              <strong className="text-white">Per-key scoping.</strong> Enable clustering for internal keys, keep it off for customer-facing keys.
            </li>
            <li>
              <strong className="text-white">Delete on demand.</strong> Drop a cluster, a prompt, or your entire history, any time, via dashboard or API.
            </li>
          </ul>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <h3 className="text-2xl font-bold mb-2">Be first in line</h3>
        <p className="text-[#666] mb-6">
          We're rolling Prompt Clustering out to waitlist accounts first. Join now, get early access when it ships.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <form
            onSubmit={handleWaitlist("clustering_bottom")}
            className="flex flex-col sm:flex-row gap-2 max-w-md"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="flex-1 px-4 py-2.5 rounded-lg border border-[#e5e5e5] text-[14px] focus:outline-none focus:border-[#0a0a0a]"
            />
            <button
              type="submit"
              disabled={joined}
              className="px-5 py-2.5 bg-[#0a0a0a] text-white rounded-lg text-[14px] font-semibold hover:bg-[#333] transition-all disabled:opacity-60"
            >
              {joined ? "You're on the list" : "Join waitlist"}
            </button>
          </form>
          <Link
            to="/solutions"
            onClick={() => trackCtaClick("browse_solutions", "solution_clustering_bottom")}
            className="px-5 py-2.5 rounded-lg text-[14px] font-semibold text-[#0a0a0a] hover:bg-[#f4f4f5] transition-all no-underline"
          >
            Browse other solutions →
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
