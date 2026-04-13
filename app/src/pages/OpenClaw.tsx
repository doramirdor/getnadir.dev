import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { Link } from "react-router-dom";
import { trackPageView } from "@/utils/analytics";

export default function OpenClaw() {
  useEffect(() => { trackPageView("openclaw"); }, []);
  return (
    <MarketingLayout>
      <SEO
        title="OpenClaw Integration - Nadir | Smart Routing for OpenClaw Agents"
        description="Add intelligent LLM routing to OpenClaw with one command. Same keys, same workflow, 30-60% cheaper."
        path="/openclaw"
      />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-10 text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-[#f0f0f0] text-xs font-medium text-[#666] mb-4">
          Works with OpenClaw v0.4+
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Smart routing for your<br />OpenClaw agents
        </h1>
        <p className="text-xl text-[#666] max-w-2xl mx-auto mb-8">
          Nadir plugs into OpenClaw as a model provider. Your agents automatically
          use cheaper models for simple prompts. Same keys, same workflow, 30-60% lower costs.
        </p>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-semibold text-center mb-8">One command to onboard</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="text-sm font-semibold text-[#0066ff] mb-2">1. Install & setup</div>
            <p className="text-sm text-[#666]">
              Install Nadir and run the setup wizard. It detects your existing OpenClaw
              credentials automatically. No extra keys needed.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="text-sm font-semibold text-[#0066ff] mb-2">2. Onboard</div>
            <p className="text-sm text-[#666]">
              Run <code className="text-xs bg-[#f5f5f5] px-1.5 py-0.5 rounded font-mono">nadirclaw openclaw onboard</code>.
              It registers <code className="text-xs bg-[#f5f5f5] px-1.5 py-0.5 rounded font-mono">nadirclaw/auto</code> as
              a model in your OpenClaw config.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="text-sm font-semibold text-[#0066ff] mb-2">3. Use it</div>
            <p className="text-sm text-[#666]">
              In any agent session, switch to <code className="text-xs bg-[#f5f5f5] px-1.5 py-0.5 rounded font-mono">/model nadirclaw/auto</code>.
              Nadir handles routing, fallbacks, and optimization.
            </p>
          </div>
        </div>
      </section>

      {/* Code example */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] overflow-hidden">
          <div className="px-4 py-2 border-b border-[#e5e5e5] bg-white">
            <span className="text-xs font-medium text-[#999]">Terminal</span>
          </div>
          <pre className="p-4 text-sm font-mono text-[#333] overflow-x-auto leading-relaxed">
{`# Install and start Nadir
pip install nadirClaw
nadirclaw setup
nadirclaw serve

# Register with OpenClaw (uses your existing keys)
nadirclaw openclaw onboard

# Restart OpenClaw gateway
openclaw gateway restart

# In your agent session:
/model nadirclaw/auto`}
          </pre>
        </div>
      </section>

      {/* Key benefits */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-semibold text-center mb-8">Why use Nadir with OpenClaw</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <h3 className="text-sm font-semibold mb-2">Same keys, zero config</h3>
            <p className="text-sm text-[#666]">
              Nadir reads your OpenClaw credential store directly. If you already have
              API keys in OpenClaw, Nadir uses them. Nothing to copy or re-enter.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <h3 className="text-sm font-semibold mb-2">Agents get smarter routing</h3>
            <p className="text-sm text-[#666]">
              Simple agent tasks (file reads, formatting, lookups) go to cheap models.
              Complex reasoning stays on premium. Your agent doesn't notice the difference.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <h3 className="text-sm font-semibold mb-2">Fallback chains built in</h3>
            <p className="text-sm text-[#666]">
              If a provider is rate-limited or down, Nadir automatically retries with
              backup models. Your agent sessions don't break.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <h3 className="text-sm font-semibold mb-2">Free & self-hosted</h3>
            <p className="text-sm text-[#666]">
              Nadir runs locally on your machine. No hosted proxy, no data leaves your
              network. MIT licensed, free forever.
            </p>
          </div>
        </div>
      </section>

      {/* Pro upsell */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="rounded-xl p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Want hosted routing with analytics?</h2>
          <p className="text-sm text-[#666] max-w-lg mx-auto mb-6">
            Nadir Pro gives you a managed proxy with team dashboards, savings tracking,
            and priority support. Still works seamlessly with OpenClaw.
          </p>
          <Link
            to="/auth?mode=signup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a0a0a] text-white rounded-lg text-[15px] font-semibold hover:bg-[#333] transition-all no-underline"
          >
            Sign Up for Pro
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
