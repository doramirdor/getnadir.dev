import { useState, useEffect, useRef } from "react";
import { trackGitHubClick } from "@/utils/analytics";

const REQUESTS = [
  { type: "simple" as const, prompt: '"What is 2+2?"', model: "efficient", cost: 0.0002, premiumCost: 0.18 },
  { type: "simple" as const, prompt: '"Format this JSON"', model: "efficient", cost: 0.0004, premiumCost: 0.22 },
  { type: "complex" as const, prompt: '"Refactor this auth module..."', model: "premium", cost: 0.098, premiumCost: 0.098 },
  { type: "complex" as const, prompt: '"Debug this race condition..."', model: "premium", cost: 0.45, premiumCost: 0.45 },
  { type: "simple" as const, prompt: '"Write a docstring for get_user()"', model: "efficient", cost: 0.0002, premiumCost: 0.42 },
];

const fmtCost = (n: number) => {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${parseFloat(n.toFixed(3))}`;
};

export const HeroSection = () => {
  const [tab, setTab] = useState<"pro" | "selfhost">("pro");
  const [animating, setAnimating] = useState(false);
  const [visibleRows, setVisibleRows] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [showSavings, setShowSavings] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Reduced motion: show everything immediately. Otherwise observe.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleRows(REQUESTS.length);
      setShowStats(true);
      setShowSavings(true);
      return;
    }
    const el = terminalRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setAnimating(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Cascade row reveals, then stats, then savings badge
  useEffect(() => {
    if (!animating) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    REQUESTS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleRows(i + 1), 300 + i * 600));
    });
    const afterRows = 300 + REQUESTS.length * 600;
    timers.push(setTimeout(() => setShowStats(true), afterRows + 300));
    timers.push(setTimeout(() => setShowSavings(true), afterRows + 800));
    return () => timers.forEach(clearTimeout);
  }, [animating]);

  const totalWith = REQUESTS.reduce((s, r) => s + r.cost, 0);
  const totalWithout = REQUESTS.reduce((s, r) => s + r.premiumCost, 0);
  const savingsPct = Math.round(
    ((totalWithout - totalWith) / totalWithout) * 100,
  );
  const cheaperCount = REQUESTS.filter((r) => r.premiumCost > r.cost).length;

  return (
    <section className="py-10 md:py-16 text-center">
      <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
        <h1 className="text-3xl md:text-5xl lg:text-7xl font-bold leading-[1.1] tracking-tight mb-5 max-w-[900px] mx-auto bg-gradient-to-br from-[#0a0a0a] via-[#0a0a0a] to-[#0066ff] bg-clip-text text-transparent">
          Your simple prompts are burning premium tokens
        </h1>

        <p className="text-lg md:text-xl text-[#666] mb-10 max-w-[640px] mx-auto leading-relaxed">
          Every "write a test" or "fix this typo" burns premium LLM credits.{" "}
          <strong>Nadir</strong>{" "}
          routes simple prompts to cheaper models automatically. Save 30-60% on
          calls that don't need your most expensive model.
        </p>

        <div className="flex gap-3 justify-center flex-wrap mb-4">
          <a
            href="/auth?mode=signup"
            className="inline-flex items-center gap-1.5 px-6 py-3 bg-[#0a0a0a] text-white rounded-md text-[15px] font-semibold hover:bg-[#333] hover:-translate-y-px hover:shadow-lg transition-all no-underline"
          >
            Try Free for 30 Days
          </a>
          <a
            href="https://github.com/NadirRouter/NadirClaw"
            onClick={() => trackGitHubClick("hero")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-6 py-3 bg-white text-[#0a0a0a] border border-[#e5e5e5] rounded-md text-[15px] font-semibold hover:bg-[#f5f5f5] hover:border-[#666] hover:-translate-y-px hover:shadow-md transition-all no-underline"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <polygon points="8,0 10.47,4.63 15.6,5.39 12,9.07 12.94,14.4 8,11.84 3.06,14.4 4,9.07 0.4,5.39 5.53,4.63" />
            </svg>
            Star on GitHub
          </a>
        </div>

        <p className="text-[13px] text-[#999] mb-8">
          No credit card required. Only pay for what we save you.
        </p>

        {/* Works with */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-12 text-sm">
          <span className="text-[#999] font-medium mr-1">Works with</span>
          {[
            "Claude Code",
            "Cursor",
            "Codex",
            "Aider",
            "Windsurf",
            "Continue",
            "Any OpenAI-compatible client",
          ].map((item, i) => (
            <span key={item} className="flex items-center gap-2">
              {i > 0 && <span className="text-[#e5e5e5]">/</span>}
              <span className="text-[#666] font-semibold">{item}</span>
            </span>
          ))}
        </div>

        {/* Terminal Demo */}
        <div className="max-w-[720px] mx-auto relative" ref={terminalRef}>
          <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden text-left font-mono text-sm">
            {/* Tab header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e5e5e5]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#e5e5e5]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#e5e5e5]" />
              </div>
              <div className="flex gap-1 bg-white border border-[#e5e5e5] rounded-md p-0.5">
                <button
                  onClick={() => setTab("pro")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                    tab === "pro"
                      ? "bg-[#0a0a0a] text-white"
                      : "text-[#999] hover:text-[#666]"
                  }`}
                >
                  Pro (hosted)
                </button>
                <button
                  onClick={() => setTab("selfhost")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                    tab === "selfhost"
                      ? "bg-[#0a0a0a] text-white"
                      : "text-[#999] hover:text-[#666]"
                  }`}
                >
                  Self-host (free)
                </button>
              </div>
            </div>

            {/* Terminal body */}
            <div className="p-5">
              {tab === "pro" ? (
                <>
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#0066ff]">import</span>{" "}
                    <span className="text-[#0a0a0a]">openai</span>
                  </div>
                  <div className="h-2" />
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#0a0a0a]">client</span>{" "}
                    <span className="text-[#999]">=</span>{" "}
                    <span className="text-[#0a0a0a]">openai.OpenAI(</span>
                  </div>
                  <div className="mb-1 leading-[1.8] pl-6">
                    <span className="text-[#0a0a0a]">base_url</span>
                    <span className="text-[#999]">=</span>
                    <span className="text-[#0066ff]">
                      "https://api.getnadir.com/v1"
                    </span>
                    <span className="text-[#999]">,</span>
                  </div>
                  <div className="mb-1 leading-[1.8] pl-6">
                    <span className="text-[#0a0a0a]">api_key</span>
                    <span className="text-[#999]">=</span>
                    <span className="text-[#0066ff]">"ndr_..."</span>
                    <span className="text-[#999]">,</span>
                  </div>
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#0a0a0a]">)</span>
                  </div>
                  <div className="h-2" />
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#0a0a0a]">r</span>{" "}
                    <span className="text-[#999]">=</span>{" "}
                    <span className="text-[#0a0a0a]">
                      client.chat.completions.create(
                    </span>
                  </div>
                  <div className="mb-1 leading-[1.8] pl-6">
                    <span className="text-[#0a0a0a]">model</span>
                    <span className="text-[#999]">=</span>
                    <span className="text-[#0066ff]">"auto"</span>
                    <span className="text-[#999]">,</span>
                    {"  "}
                    <span className="text-[#999]">
                      # Nadir picks the best model
                    </span>
                  </div>
                  <div className="mb-1 leading-[1.8] pl-6">
                    <span className="text-[#0a0a0a]">messages</span>
                    <span className="text-[#999]">
                      =[{"{"}"role": "user", "content": "Hello!"{"}"}</span>
                    <span className="text-[#999]">],</span>
                  </div>
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#0a0a0a]">)</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#999]"># enable on your server</span>
                  </div>
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#999]">$</span> nadirclaw serve{" "}
                    <span className="text-[#0066ff]">--optimize safe</span>
                  </div>
                  <div className="h-3" />
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#999]"># or per-request</span>
                  </div>
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#999]">{"{"}</span>
                    <span className="text-[#0066ff]">"optimize"</span>
                    <span className="text-[#999]">: </span>
                    <span className="text-[#0066ff]">"safe"</span>
                    <span className="text-[#999]">, </span>
                    <span className="text-[#0066ff]">"model"</span>
                    <span className="text-[#999]">: </span>
                    <span className="text-[#0066ff]">"auto"</span>
                    <span className="text-[#999]">, ...{"}"}</span>
                  </div>
                  <div className="h-3" />
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#999]"># dry-run on any file to see savings</span>
                  </div>
                  <div className="mb-1 leading-[1.8]">
                    <span className="text-[#999]">$</span> nadirclaw optimize{" "}
                    <span className="text-[#0a0a0a]">payload.json</span>
                  </div>
                </>
              )}

              <div className="h-4" />

              {/* Animated routing rows */}
              {REQUESTS.map((req, i) => {
                const visible = i < visibleRows;
                const saved = req.premiumCost > req.cost;

                return (
                  <div
                    key={i}
                    className={`
                      flex items-center gap-2.5 flex-wrap p-2 px-3 rounded-md mb-1.5
                      text-[13px] md:text-sm transition-all duration-500 ease-out
                      border-l-2
                      ${
                        visible
                          ? saved
                            ? "opacity-100 translate-y-0 bg-[#00a86b]/[0.04] border-l-[#00a86b]/40"
                            : "opacity-100 translate-y-0 bg-[#fafafa] border-l-transparent"
                          : "opacity-0 translate-y-3 border-l-transparent"
                      }
                    `}
                  >
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                        req.type === "simple"
                          ? "bg-[#00a86b]/10 text-[#00a86b]"
                          : "bg-[#0066ff]/10 text-[#0066ff]"
                      }`}
                    >
                      {req.type}
                    </span>
                    <span className="text-[#999] truncate">{req.prompt}</span>
                    <span className="text-[#999]">&rarr;</span>
                    <span className="font-semibold text-[#0a0a0a]">
                      {req.model}
                    </span>
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      {saved && (
                        <span className="text-[#ccc] line-through text-[12px]">
                          {fmtCost(req.premiumCost)}
                        </span>
                      )}
                      <span
                        className={`font-semibold text-[13px] ${
                          saved ? "text-[#00a86b]" : "text-[#0a0a0a]"
                        }`}
                      >
                        {fmtCost(req.cost)}
                      </span>
                    </span>
                  </div>
                );
              })}

              <div className="h-4" />

              {/* Stats bar */}
              <div
                className={`grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-[#e5e5e5] transition-all duration-500 ease-out ${
                  showStats
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-2"
                }`}
              >
                <div className="text-center">
                  <div className="text-xl font-bold text-[#0a0a0a] mb-0.5">
                    {REQUESTS.length}
                  </div>
                  <div className="text-[11px] text-[#999] font-sans">
                    requests
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#00a86b] mb-0.5">
                    {cheaperCount} of {REQUESTS.length}
                  </div>
                  <div className="text-[11px] text-[#999] font-sans">
                    routed cheaper
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#00a86b] mb-0.5">
                    {fmtCost(totalWith)}
                  </div>
                  <div className="text-[11px] text-[#999] font-sans">
                    with Nadir
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#0a0a0a] mb-0.5">
                    {fmtCost(totalWithout)}
                  </div>
                  <div className="text-[11px] text-[#999] font-sans">
                    without routing
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Savings reveal */}
          <div
            className={`mt-5 transition-all duration-700 ease-out ${
              showSavings
                ? "opacity-100 translate-y-0 scale-100"
                : "opacity-0 translate-y-4 scale-95"
            }`}
          >
            <div className="inline-flex items-center gap-3 px-6 py-3.5 bg-[#00a86b]/[0.08] border border-[#00a86b]/20 rounded-xl">
              <span className="text-2xl md:text-3xl font-bold text-[#00a86b]">
                {savingsPct}% saved
              </span>
              <span className="text-[#ccc]">&middot;</span>
              <span className="text-[#666] text-sm">
                {fmtCost(totalWith)} instead of {fmtCost(totalWithout)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
