import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { WaitlistForm } from "@/components/WaitlistForm";
import { trackPageView } from "@/utils/analytics";

export default function Optimize() {
  useEffect(() => { trackPageView("optimize"); }, []);
  return (
    <MarketingLayout>
      <SEO
        title="Context Optimize - Nadir | Cut LLM Input Tokens 30-70%"
        description="Lossless context optimization that trims bloated LLM payloads before they hit your bill. Safe mode free, aggressive mode on Pro."
        path="/optimize"
      />
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Context Optimize
        </h1>
        <p className="text-xl text-[#666] max-w-2xl mx-auto mb-8">
          Routes to the right model, then trims bloated context before it hits your bill.
          Safe mode is lossless. Aggressive mode adds semantic dedup.
        </p>
      </section>

      {/* Modes */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Safe mode</h3>
            <p className="text-sm text-[#666] mb-4">Lossless transforms only. Zero risk to output quality.</p>
            <ul className="space-y-2 text-sm text-[#666] flex-1">
              <li><strong className="text-[#0a0a0a]">JSON minification</strong> - compact without changing values</li>
              <li><strong className="text-[#0a0a0a]">Tool schema dedup</strong> - repeated schemas replaced with references</li>
              <li><strong className="text-[#0a0a0a]">System prompt dedup</strong> - duplicated text removed</li>
              <li><strong className="text-[#0a0a0a]">Whitespace normalization</strong> - collapse blanks, skip code</li>
              <li><strong className="text-[#0a0a0a]">Chat history trimming</strong> - keep system + first + last N turns</li>
            </ul>
            <div className="mt-4 bg-[#f8f8f8] border border-[#e5e5e5] rounded-lg p-3 font-mono text-xs">
              <span className="text-[#999]">$</span> nadirclaw serve --optimize safe
            </div>
            <p className="text-xs text-[#999] mt-2">Available in open source (free)</p>
          </div>

          <div className="p-6 bg-[#0a0a0a] text-white rounded-xl ring-2 ring-[#0066ff] flex flex-col">
            <h3 className="text-lg font-semibold mb-2">Aggressive mode</h3>
            <p className="text-sm text-gray-300 mb-4">Everything in safe + semantic deduplication for maximum savings.</p>
            <ul className="space-y-2 text-sm text-gray-300 flex-1">
              <li><strong className="text-white">All safe transforms</strong> - lossless baseline included</li>
              <li><strong className="text-white">Semantic dedup</strong> - embedding-based redundancy removal</li>
              <li><strong className="text-white">Diff-preserving</strong> - maintains output correctness</li>
              <li><strong className="text-white">Up to 70% reduction</strong> - on structured payloads</li>
              <li><strong className="text-white">Auto-calibrated</strong> - adapts to your content type</li>
            </ul>
            <div className="mt-4 bg-gray-800 border border-gray-700 rounded-lg p-3 font-mono text-xs">
              <span className="text-gray-500">$</span> nadirclaw serve --optimize aggressive
            </div>
            <p className="text-xs text-[#0066ff] mt-2">Pro plan only - advanced algorithms</p>
          </div>
        </div>
      </section>

      {/* Benchmark bars */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Benchmark results (safe mode)</h2>
        <div className="space-y-4 max-w-[640px] mx-auto">
          {[
            { label: "Agentic (8 turns)", remaining: 43, saved: 57 },
            { label: "RAG pipeline", remaining: 71, saved: 29 },
            { label: "API responses", remaining: 38, saved: 62 },
            { label: "Debug sessions", remaining: 37, saved: 63 },
            { label: "OpenAPI specs", remaining: 29, saved: 71 },
          ].map((bar) => (
            <div key={bar.label} className="flex items-center gap-3">
              <span className="text-sm text-[#666] w-32 shrink-0">{bar.label}</span>
              <div className="flex-1 h-6 bg-[#e5e5e5] rounded overflow-hidden">
                <div
                  className="h-full bg-[#0066ff] rounded text-white text-[11px] font-semibold flex items-center justify-center"
                  style={{ width: `${bar.remaining}%` }}
                >
                  {bar.remaining}%
                </div>
              </div>
              <span className="text-sm font-medium text-[#00a86b] w-20 text-right">
                {bar.saved}% saved
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <WaitlistForm variant="card" source="optimize-page" />
      </section>
    </MarketingLayout>
  );
}
