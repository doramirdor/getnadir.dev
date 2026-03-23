import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";

export default function OpenClaw() {
  return (
    <MarketingLayout>
      <SEO
        title="OpenClaw — Nadir | Shared API Keys for Hosted Proxy"
        description="Use pre-configured provider keys with Nadir's hosted proxy. No need to bring your own keys."
        path="/openclaw"
      />
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          OpenClaw
        </h1>
        <p className="text-xl text-[#666] max-w-2xl mx-auto mb-8">
          Shared API keys for the Nadir hosted proxy. Use our pre-configured
          provider keys so you don't need to bring your own.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#fafafa] border border-[#e5e5e5] rounded-lg text-sm text-[#666]">
          Coming soon
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="bg-gradient-to-r from-[#00a86b]/5 to-[#0066ff]/5 border border-[#e5e5e5] rounded-xl p-8 text-center">
          <h3 className="text-lg font-semibold mb-2">Want to get started now?</h3>
          <p className="text-[#666] text-sm mb-6">
            Self-host Nadir for free with your own keys, or try the hosted Pro plan with advanced routing algorithms.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href="https://github.com/doramirdor/NadirClaw"
              className="px-6 py-3 bg-[#0a0a0a] text-white rounded-md text-[15px] font-semibold hover:bg-[#333] transition-all no-underline"
            >
              Self-host free
            </a>
            <a
              href="/pricing"
              className="px-6 py-3 bg-gradient-to-r from-[#00a86b] to-[#0066ff] text-white rounded-md text-[15px] font-semibold hover:-translate-y-px hover:shadow-lg transition-all no-underline"
            >
              Try Pro — better algorithms
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
