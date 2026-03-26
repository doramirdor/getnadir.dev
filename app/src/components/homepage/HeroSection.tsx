import { trackGitHubClick } from "@/utils/analytics";

export const HeroSection = () => {
  return (
    <section className="py-10 md:py-16 text-center">
      <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
        <h1 className="text-3xl md:text-5xl lg:text-7xl font-bold leading-[1.1] tracking-tight mb-5 max-w-[900px] mx-auto bg-gradient-to-br from-[#0a0a0a] via-[#0a0a0a] to-[#0066ff] bg-clip-text text-transparent">
          Your simple prompts are burning premium tokens
        </h1>

        <p className="text-lg md:text-xl text-[#666] mb-10 max-w-[640px] mx-auto leading-relaxed">
          Every "write a test" or "fix this typo" burns premium LLM credits.{" "}
          <strong>Nadir</strong>{" "}
          routes simple prompts to cheaper models automatically. Save on every
          call that doesn't need your most expensive model.
        </p>

        <div className="flex gap-3 justify-center flex-wrap mb-4">
          <a
            href="https://github.com/NadirRouter/NadirClaw"
            onClick={() => trackGitHubClick("hero")}
            className="inline-flex items-center gap-1.5 px-6 py-3 bg-[#0a0a0a] text-white rounded-md text-[15px] font-semibold hover:bg-[#333] hover:-translate-y-px hover:shadow-lg transition-all no-underline"
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
          <a
            href="#calculator"
            className="inline-flex items-center gap-1.5 px-6 py-3 bg-white text-[#0a0a0a] border border-[#e5e5e5] rounded-md text-[15px] font-semibold hover:bg-[#f5f5f5] hover:border-[#666] hover:-translate-y-px hover:shadow-md transition-all no-underline"
          >
            Quick Start
          </a>
        </div>

        <p className="text-[13px] text-[#999] mb-8">
          Two commands. Zero configuration.
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
        <div className="max-w-[720px] mx-auto relative">
          <div className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden text-left font-mono text-sm">
            {/* Terminal header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e5e5e5]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#e5e5e5]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#e5e5e5]" />
              </div>
              <span className="text-xs text-[#999]">nadirclaw serve</span>
            </div>

            {/* Terminal body */}
            <div className="p-5">
              <div className="mb-1 leading-[1.8]">
                <span className="text-[#999]">$</span> nadirclaw serve
              </div>
              <div className="mb-1 leading-[1.8]">
                <span className="text-[#00a86b]">&#10003;</span> Classifier
                ready
              </div>
              <div className="mb-1 leading-[1.8]">
                <span className="text-[#00a86b]">&#10003;</span> Listening on{" "}
                <span className="text-[#0066ff]">localhost:8856</span>
              </div>

              <div className="h-4" />

              {/* Request rows */}
              {[
                {
                  type: "simple",
                  prompt: '"What is 2+2?"',
                  model: "budget",
                  cost: "$0.0002",
                  green: true,
                },
                {
                  type: "simple",
                  prompt: '"Format this JSON"',
                  model: "budget",
                  cost: "$0.0004",
                  green: true,
                },
                {
                  type: "complex",
                  prompt: '"Refactor this auth module..."',
                  model: "premium",
                  cost: "$0.098",
                  green: false,
                },
                {
                  type: "complex",
                  prompt: '"Debug this race condition..."',
                  model: "premium",
                  cost: "$0.450",
                  green: false,
                },
                {
                  type: "simple",
                  prompt: '"Write a docstring for get_user()"',
                  model: "budget",
                  cost: "$0.0002",
                  green: true,
                },
              ].map((req, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 flex-wrap p-2 px-3 rounded-md mb-1.5 bg-[#fafafa] text-[13px] md:text-sm"
                >
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider ${
                      req.type === "simple"
                        ? "bg-[#00a86b]/10 text-[#00a86b]"
                        : "bg-[#0066ff]/10 text-[#0066ff]"
                    }`}
                  >
                    {req.type}
                  </span>
                  <span className="text-[#999]">{req.prompt}</span>
                  <span className="text-[#999]">&rarr;</span>
                  <span className="font-semibold text-[#0a0a0a]">
                    {req.model}
                  </span>
                  <span
                    className={`ml-auto font-medium text-[13px] ${
                      req.green ? "text-[#00a86b]" : "text-[#0a0a0a]"
                    }`}
                  >
                    {req.cost}
                  </span>
                </div>
              ))}

              <div className="h-4" />

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-[#e5e5e5]">
                {[
                  { value: "5", label: "requests" },
                  {
                    value: "3 of 5",
                    label: "routed cheaper",
                    green: true,
                  },
                  {
                    value: "$0.549",
                    label: "with Nadir",
                    green: true,
                  },
                  { value: "$1.37", label: "without routing" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div
                      className={`text-xl font-bold mb-0.5 ${
                        stat.green ? "text-[#00a86b]" : "text-[#0a0a0a]"
                      }`}
                    >
                      {stat.value}
                    </div>
                    <div className="text-[11px] text-[#999] font-sans">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
