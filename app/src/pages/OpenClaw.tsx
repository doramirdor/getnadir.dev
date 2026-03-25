import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { WaitlistForm } from "@/components/WaitlistForm";

export default function OpenClaw() {
  return (
    <MarketingLayout>
      <SEO
        title="OpenClaw - Nadir | Shared API Keys for Hosted Proxy"
        description="Use pre-configured provider keys with Nadir's hosted proxy. No need to bring your own keys."
        path="/openclaw"
      />
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          OpenClaw
        </h1>
        <p className="text-xl text-[#666] max-w-2xl mx-auto mb-8">
          Shared API keys for the Nadir hosted proxy. Use our pre-configured
          provider keys so you don't need to bring your own.
        </p>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 pb-10">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="text-sm font-semibold text-[#0066ff] mb-2">1. Sign up for Pro</div>
            <p className="text-sm text-[#666]">Join the waitlist for the hosted proxy. No API keys to configure.</p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="text-sm font-semibold text-[#0066ff] mb-2">2. Point your tools</div>
            <p className="text-sm text-[#666]">Set your base URL to api.getnadir.com. Works with Claude Code, Cursor, Aider.</p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="text-sm font-semibold text-[#0066ff] mb-2">3. Save automatically</div>
            <p className="text-sm text-[#666]">We handle routing, optimization, and provider keys. You just code.</p>
          </div>
        </div>
      </section>

      {/* Waitlist */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <WaitlistForm variant="card" source="openclaw-page" />
      </section>
    </MarketingLayout>
  );
}
