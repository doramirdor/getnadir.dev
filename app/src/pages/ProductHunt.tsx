import { useEffect } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { trackPageView, trackCtaClick, trackAuthAttempt } from "@/utils/analytics";
import { Loader2 } from "lucide-react";
import { useState } from "react";

const PH_REF = "producthunt";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid" aria-hidden>
    <path d="M255.878,133.451 C255.878,122.717 255.007,114.884 253.122,106.761 L130.55,106.761 L130.55,155.209 L202.497,155.209 C201.047,167.249 193.214,185.381 175.807,197.565 L175.563,199.187 L214.318,229.21 L217.003,229.478 C241.662,206.704 255.878,173.196 255.878,133.451" fill="#4285F4" />
    <path d="M130.55,261.1 C165.798,261.1 195.389,249.495 217.003,229.478 L175.807,197.565 C164.783,205.253 149.987,210.62 130.55,210.62 C96.027,210.62 66.726,187.847 56.281,156.37 L54.75,156.5 L14.452,187.687 L13.925,189.152 C35.393,231.798 79.49,261.1 130.55,261.1" fill="#34A853" />
    <path d="M56.281,156.37 C53.525,148.247 51.93,139.543 51.93,130.55 C51.93,121.556 53.525,112.853 56.136,104.73 L56.063,103 L15.26,71.312 L13.925,71.947 C5.077,89.644 0,109.517 0,130.55 C0,151.583 5.077,171.455 13.925,189.152 L56.281,156.37" fill="#FBBC05" />
    <path d="M130.55,50.479 C155.064,50.479 171.6,61.068 181.029,69.917 L217.873,33.943 C195.245,12.91 165.798,0 130.55,0 C79.49,0 35.393,29.301 13.925,71.947 L56.136,104.73 C66.726,73.253 96.027,50.479 130.55,50.479" fill="#EB4335" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
  </svg>
);

const STATS = [
  { value: "60%", label: "Lower LLM bill" },
  { value: "98%", label: "Quality preserved" },
  { value: "2 lines", label: "To integrate" },
  { value: "#4", label: "RouterArena leaderboard" },
];

const ProductHunt = () => {
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    trackPageView("producthunt_landing", { ref: PH_REF });
  }, []);

  const handleOAuth = async (provider: "google" | "github") => {
    setOauthLoading(provider);
    trackCtaClick(`ph_signup_${provider}`, "producthunt_landing");
    trackAuthAttempt(provider, "signup");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?ref=${PH_REF}` },
      });
      if (error) throw error;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not start signup.";
      toast({ variant: "destructive", title: "Error", description: message });
      setOauthLoading(null);
    }
  };

  return (
    <div
      className="min-h-screen bg-white text-[#1d1d1f] antialiased"
      style={{ fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}
    >
      <SEO
        title="Nadir — LLM router that cuts your AI bill 60% | Product Hunt"
        description="Route every prompt to the cheapest model that can handle it. 60% cost savings, 98% quality preserved. Two-line integration, OpenAI compatible."
        path="/producthunt"
      />

      {/* PH banner */}
      <div className="bg-[#ff6154]/[0.06] border-b border-[#ff6154]/[0.12]">
        <div className="max-w-[720px] mx-auto px-6 py-3 flex items-center justify-center gap-3 text-[13px]">
          <span className="text-[#ff6154] font-semibold">Featured on Product Hunt</span>
          <span className="text-[#86868b]">—</span>
          <span className="text-[#424245]">$5 off for launch-day supporters</span>
        </div>
      </div>

      {/* Header — minimal */}
      <header className="border-b border-black/[0.06] bg-white">
        <div className="max-w-[720px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 no-underline text-[#1d1d1f]">
            <img src="/logo.png" alt="Nadir" className="w-7 h-7 block" />
            <span className="font-semibold text-[17px] tracking-[-0.022em]">Nadir</span>
          </Link>
          <a
            href="https://github.com/NadirRouter/NadirClaw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] text-[#86868b] no-underline hover:text-[#1d1d1f] transition-colors"
          >
            Open source on GitHub
          </a>
        </div>
      </header>

      <main className="max-w-[720px] mx-auto px-6 sm:px-8">
        {/* Hero */}
        <section className="pt-16 md:pt-20 pb-14">
          <h1 className="text-[40px] sm:text-[52px] md:text-[60px] font-semibold leading-[1.06] tracking-[-0.035em] mb-5 [text-wrap:balance]">
            Cut your LLM bill 60%.{" "}
            <span
              className="px-[0.05em]"
              style={{
                backgroundImage: "linear-gradient(transparent 62%, rgba(48,209,88,0.34) 62%, rgba(48,209,88,0.34) 92%, transparent 92%)",
                WebkitBoxDecorationBreak: "clone",
                boxDecorationBreak: "clone",
              }}
            >
              Zero quality loss.
            </span>
          </h1>
          <p className="text-[17px] md:text-[19px] text-[#424245] mb-8 leading-[1.55] tracking-[-0.01em] max-w-[560px]">
            Nadir reads every prompt and routes it to the cheapest model that can answer it well.
            Haiku for simple tasks, Sonnet for code, Opus only for hard reasoning.
            <span className="text-[#1d1d1f] font-medium"> Two lines to integrate. OpenAI compatible.</span>
          </p>

          {/* Signup — above the fold */}
          <div className="flex flex-col sm:flex-row gap-3 mb-10">
            <button
              type="button"
              onClick={() => handleOAuth("github")}
              disabled={oauthLoading !== null}
              className="inline-flex items-center justify-center gap-3 px-6 py-3.5 bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#333] transition-colors tracking-[-0.01em] disabled:opacity-60"
            >
              {oauthLoading === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitHubIcon />}
              Continue with GitHub
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={oauthLoading !== null}
              className="inline-flex items-center justify-center gap-3 px-6 py-3.5 bg-white text-[#1d1d1f] border border-black/[0.12] rounded-full text-[15px] font-medium hover:bg-[#f5f5f7] transition-colors tracking-[-0.01em] disabled:opacity-60"
            >
              {oauthLoading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
              Continue with Google
            </button>
            <Link
              to={`/auth?mode=signup&ref=${PH_REF}`}
              className="inline-flex items-center justify-center px-4 py-3.5 text-[#424245] text-[14px] font-medium no-underline hover:text-[#1d1d1f] transition-colors tracking-[-0.01em]"
            >
              Email
            </Link>
          </div>

          <p className="text-[12px] text-[#86868b] leading-[1.5] mb-10">
            No credit card required. By continuing, you agree to our{" "}
            <Link to="/terms" className="underline hover:text-[#1d1d1f]">Terms</Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline hover:text-[#1d1d1f]">Privacy Policy</Link>.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-10 border-t border-black/[0.06]">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="text-[32px] sm:text-[40px] font-semibold tracking-[-0.03em] leading-none mb-1.5 text-[#1d1d1f]">
                  {s.value}
                </div>
                <div className="text-[13px] text-[#86868b] tracking-[-0.005em]">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="py-14 border-t border-black/[0.06]">
          <p className="text-[12px] text-[#86868b] uppercase tracking-[0.1em] font-semibold mb-6">
            How it works
          </p>
          <div className="space-y-8">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-1.5">1. Swap the base URL</h3>
              <p className="text-[14px] text-[#424245] mb-4 leading-[1.5]">
                Point your existing OpenAI SDK at Nadir. Set <code className="text-[13px] bg-black/[0.04] px-1.5 py-0.5 rounded font-mono">model="auto"</code>.
                Everything else stays the same.
              </p>
              <div className="bg-[#1d1d1f] rounded-xl p-5 overflow-x-auto">
                <pre className="text-[13px] text-[#e5e5e7] font-mono leading-[1.7] m-0">
                  <code>{`from openai import OpenAI

client = OpenAI(
    base_url="https://api.getnadir.com/v1",
    api_key="nd-..."  # your Nadir key
)

response = client.chat.completions.create(
    model="auto",  # Nadir picks the best model
    messages=[{"role": "user", "content": prompt}]
)`}</code>
                </pre>
              </div>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-1.5">2. Nadir routes each prompt</h3>
              <p className="text-[14px] text-[#424245] leading-[1.5]">
                A trained classifier reads the prompt and picks the cheapest model that won't drop quality.
                Simple tasks go to Haiku (10x cheaper), code tasks to Sonnet (3x cheaper), and only genuinely hard
                reasoning problems go to Opus. A verifier catches misroutes before they reach the user.
              </p>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-1.5">3. You keep the savings</h3>
              <p className="text-[14px] text-[#424245] leading-[1.5]">
                No monthly fee. We charge 25% of what we save you on the first $2K, 10% above.
                If we save you nothing, you pay nothing. Self-host the{" "}
                <a href="https://github.com/NadirRouter/NadirClaw" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#1d1d1f]">
                  open-source core
                </a>{" "}
                free.
              </p>
            </div>
          </div>
        </section>

        {/* Social proof */}
        <section className="py-14 border-t border-black/[0.06]">
          <p className="text-[12px] text-[#86868b] uppercase tracking-[0.1em] font-semibold mb-6">
            Verified benchmarks
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-black/[0.08] bg-[#fbfbfd]">
              <div className="text-[14px] font-semibold text-[#1d1d1f] mb-1">RouterArena #4</div>
              <p className="text-[13px] text-[#424245] leading-[1.5] m-0">
                72.3 arena_score on RouterArena's official scorer. #4 of 21 routers on the public leaderboard.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-black/[0.08] bg-[#fbfbfd]">
              <div className="text-[14px] font-semibold text-[#1d1d1f] mb-1">RouterBench: 92.1% accuracy</div>
              <p className="text-[13px] text-[#424245] leading-[1.5] m-0">
                Head-to-head vs Not Diamond's open-source router (27.0%) on 3,313 held-out RouterBench triples.
              </p>
            </div>
          </div>
        </section>

        {/* Product Hunt launch offer */}
        <section className="py-14 border-t border-black/[0.06]">
          <p className="text-[12px] text-[#86868b] uppercase tracking-[0.1em] font-semibold mb-6">
            Product Hunt launch offer
          </p>
          <div className="p-5 rounded-xl border border-black/[0.08] bg-[#fbfbfd] max-w-[460px]">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="text-[14px] font-semibold text-[#1d1d1f]">$5 off, BYOK accounts only</div>
              <code className="text-[12px] bg-black/[0.04] px-2 py-1 rounded font-mono text-[#1d1d1f]">PRODUCTHUNT</code>
            </div>
            <p className="text-[13px] text-[#424245] leading-[1.5] m-0">
              Bring your own provider keys, go Pro, and apply the code at checkout. The $5 comes off your Nadir fee, never your API usage.{" "}
              <Link to="/terms#promotions" className="underline hover:text-[#1d1d1f]">Offer terms</Link>.
            </p>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-16 text-center">
          <h2 className="text-[32px] sm:text-[40px] font-semibold tracking-[-0.03em] mb-4 text-[#1d1d1f]">
            Stop paying Opus rates for Haiku work.
          </h2>
          <p className="text-[15px] text-[#424245] mb-8">
            50 free API calls. No credit card. No strings attached.
          </p>
          <button
            type="button"
            onClick={() => handleOAuth("github")}
            disabled={oauthLoading !== null}
            className="inline-flex items-center justify-center gap-3 px-7 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out tracking-[-0.01em] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)] disabled:opacity-60"
          >
            {oauthLoading === "github" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitHubIcon />}
            Get started with GitHub
          </button>
          <div className="mt-4">
            <Link
              to="/"
              className="text-[13px] text-[#86868b] no-underline hover:text-[#1d1d1f] transition-colors"
            >
              See the full site
            </Link>
          </div>
        </section>
      </main>

      {/* Footer — minimal */}
      <footer className="border-t border-black/[0.06] py-8">
        <div className="max-w-[720px] mx-auto px-6 flex items-center justify-between text-[12px] text-[#86868b]">
          <span>&copy; {new Date().getFullYear()} Nadir</span>
          <div className="flex items-center gap-4">
            <Link to="/docs" className="no-underline hover:text-[#1d1d1f] transition-colors">Docs</Link>
            <Link to="/pricing" className="no-underline hover:text-[#1d1d1f] transition-colors">Pricing</Link>
            <a href="https://github.com/NadirRouter/NadirClaw" target="_blank" rel="noopener noreferrer" className="no-underline hover:text-[#1d1d1f] transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ProductHunt;
