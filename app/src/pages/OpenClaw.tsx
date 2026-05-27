import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { Link } from "react-router-dom";
import { trackPageView } from "@/utils/analytics";
import { Check, Github, Terminal, Zap, Shield, Cpu, ArrowRight } from "lucide-react";

export default function OpenClaw() {
  useEffect(() => { trackPageView("openclaw"); }, []);
  return (
    <MarketingLayout>
      <SEO
        title="NadirClaw | Self-Host Your Own LLM Router | MIT Licensed"
        description="Self-hosted LLM router that cuts API costs up to 40%. 4-tier routing, context optimization, fallback chains. MIT licensed, runs locally."
        path="/openclaw"
      />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(48,209,88,0.10)] text-[12px] font-semibold uppercase tracking-[0.1em] text-[#028a3e] mb-5">
          <Github className="w-3.5 h-3.5" />
          MIT licensed · Free forever · Self-host
        </div>
        <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] text-[#1d1d1f] leading-[1.05] mb-5 [text-wrap:balance]">
          The router,{" "}
          <span
            className="px-[0.05em]"
            style={{
              backgroundImage:
                "linear-gradient(transparent 64%, rgba(48,209,88,0.34) 64%, rgba(48,209,88,0.34) 92%, transparent 92%)",
              WebkitBoxDecorationBreak: "clone",
              boxDecorationBreak: "clone",
            }}
          >
            on your hardware.
          </span>
        </h1>
        <p className="text-lg md:text-[19px] text-[#424245] max-w-[640px] mx-auto mb-10 leading-[1.5] tracking-[-0.005em]">
          NadirClaw is the open-source core. Same routing logic, runs on your machine, stores nothing in the cloud, supports unlimited requests.
        </p>
        <div className="flex items-center justify-center flex-wrap gap-3">
          <a
            href="https://github.com/NadirRouter/NadirClaw"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] transition-colors tracking-[-0.01em] no-underline shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 px-6 py-[14px] border border-black/[0.12] rounded-full text-[15px] font-medium hover:bg-black/[0.03] transition-colors no-underline text-[#1d1d1f] tracking-[-0.01em]"
          >
            Read the docs <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Quick start */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-semibold text-center mb-8">Get started in 30 seconds</h2>
        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] overflow-hidden">
          <div className="px-4 py-2 border-b border-[#e5e5e5] bg-white flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-[#999]" />
            <span className="text-xs font-medium text-[#999]">Terminal</span>
          </div>
          <pre className="p-4 text-sm font-mono text-[#333] overflow-x-auto leading-relaxed">
{`pip install nadirclaw
nadirclaw setup        # auto-detects your API keys
nadirclaw serve        # starts local proxy on :4000

# Works like OpenAI, just change the base URL
curl http://localhost:4000/v1/chat/completions \\
  -d '{"model": "nadirclaw/auto", "messages": [...]}'`}
          </pre>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-semibold text-center mb-8">What you get</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-[#028a3e]" />
              <h3 className="text-sm font-semibold">4-tier intelligent routing</h3>
            </div>
            <p className="text-sm text-[#666]">
              A binary classifier routes each prompt to the right tier (simple, mid, complex,
              reasoning) in under 10ms. The Pro tier adds verifier-gated cascade: 98% of
              always-Opus quality preserved at 40% of the cost on RouterBench held-out.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-[#028a3e]" />
              <h3 className="text-sm font-semibold">Context optimization</h3>
            </div>
            <p className="text-sm text-[#666]">
              Trims redundant context, system prompt bloat, and long conversation
              history. Cuts input tokens by 20-40% with no quality loss.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-[#028a3e]" />
              <h3 className="text-sm font-semibold">Automatic fallback chains</h3>
            </div>
            <p className="text-sm text-[#666]">
              When a provider is rate-limited or down, NadirClaw retries with the next model
              in the chain. Your app stays up.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-[#e5e5e5] bg-white">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-[#028a3e]" />
              <h3 className="text-sm font-semibold">CLI dashboard</h3>
            </div>
            <p className="text-sm text-[#666]">
              A rich terminal UI with live routing decisions, cost savings, model
              usage, and latency. No browser needed.
            </p>
          </div>
        </div>
      </section>

      {/* Context Optimize CLI */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-semibold text-center mb-8">Context Optimize</h2>
        <p className="text-sm text-[#666] text-center max-w-lg mx-auto mb-6">
          Routes to the right model, then trims the payload before it hits your bill.
          Lossless by default -- output quality stays identical.
        </p>
        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] overflow-hidden">
          <div className="px-4 py-2 border-b border-[#e5e5e5] bg-white flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-[#999]" />
            <span className="text-xs font-medium text-[#999]">Terminal</span>
          </div>
          <pre className="p-4 text-sm font-mono text-[#333] overflow-x-auto leading-relaxed">
{`# enable on your server
nadirclaw serve --optimize safe

# or per-request
{"optimize": "safe", "model": "auto", ...}

# dry-run on any file to see savings
nadirclaw optimize payload.json`}
          </pre>
        </div>
        <p className="text-xs text-[#999] text-center mt-3">
          Off by default -- zero overhead when disabled.{" "}
          <Link to="/optimize" className="text-[#028a3e] hover:underline">
            See full benchmark results and aggressive mode
          </Link>
        </p>
      </section>

      {/* How it compares */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-semibold text-center mb-8">Self-Host vs Hosted</h2>
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="p-6 rounded-xl border-2 border-[#e5e5e5] bg-white">
            <h3 className="font-semibold mb-1">NadirClaw (Self-Host)</h3>
            <p className="text-xs text-[#999] mb-4">MIT licensed, runs on your infra</p>
            <ul className="space-y-2">
              {[
                "Unlimited requests",
                "Runs on your machine",
                "CLI dashboard",
                "YAML config and custom rules",
                "No data leaves your network",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-[#444]">
                  <Check className="w-4 h-4 text-[#00a86b] shrink-0" /> {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-6 rounded-xl border-2 border-[#0066ff] bg-white">
            <h3 className="font-semibold mb-1">Nadir Pro (Hosted)</h3>
            <p className="text-xs text-[#999] mb-4">50 free req/mo, then $9/mo + savings fee</p>
            <ul className="space-y-2">
              {[
                "Everything in self-host",
                "50 requests/month free on our keys",
                "Pay-per-savings after 50 (cancel anytime)",
                "Hosted proxy, zero setup",
                "Web dashboard and analytics",
                "Semantic cache and dedup",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-[#444]">
                  <Check className="w-4 h-4 text-[#028a3e] shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <Link
              to="/auth?mode=signup"
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0a0a0a] text-white rounded-lg text-sm font-semibold hover:bg-[#333] transition-all no-underline"
            >
              Try Pro Free <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* OpenClaw integration */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-8">
          <h2 className="text-xl font-semibold mb-2 text-center">Works with OpenClaw</h2>
          <p className="text-sm text-[#666] text-center max-w-lg mx-auto mb-6">
            NadirClaw plugs into OpenClaw as a model provider. Your agents automatically
            use cheaper models for simple tasks.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-white border border-[#e5e5e5]">
              <div className="text-xs font-semibold text-[#028a3e] mb-1">1. Install</div>
              <code className="text-xs bg-[#f5f5f5] px-1.5 py-0.5 rounded font-mono">pip install nadirclaw</code>
            </div>
            <div className="p-4 rounded-lg bg-white border border-[#e5e5e5]">
              <div className="text-xs font-semibold text-[#028a3e] mb-1">2. Onboard</div>
              <code className="text-xs bg-[#f5f5f5] px-1.5 py-0.5 rounded font-mono">nadirclaw openclaw onboard</code>
            </div>
            <div className="p-4 rounded-lg bg-white border border-[#e5e5e5]">
              <div className="text-xs font-semibold text-[#028a3e] mb-1">3. Use it</div>
              <code className="text-xs bg-[#f5f5f5] px-1.5 py-0.5 rounded font-mono">/model nadirclaw/auto</code>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <a
          href="https://github.com/NadirRouter/NadirClaw"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a0a0a] text-white rounded-lg text-[15px] font-semibold hover:bg-[#333] transition-all no-underline"
        >
          <Github className="w-4 h-4" />
          Star on GitHub
        </a>
      </section>
    </MarketingLayout>
  );
}
