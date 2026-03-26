const examples = [
  {
    prompt: '"What is 2+2?"',
    classification: "simple",
    model: "budget model",
    why: "Trivial lookup",
  },
  {
    prompt: '"Format this JSON"',
    classification: "simple",
    model: "budget model",
    why: "Mechanical transform",
  },
  {
    prompt: '"Write a docstring for get_user()"',
    classification: "simple",
    model: "budget model",
    why: "Template output",
  },
  {
    prompt: '"List the files in src/"',
    classification: "simple",
    model: "budget model",
    why: "Direct retrieval",
  },
  {
    prompt: '"Refactor auth module to use JWT..."',
    classification: "complex",
    model: "premium model",
    why: "Multi-file reasoning",
  },
  {
    prompt: '"Debug this race condition in..."',
    classification: "complex",
    model: "premium model",
    why: "Deep analysis",
  },
  {
    prompt: '"Design a caching layer for..."',
    classification: "complex",
    model: "premium model",
    why: "Architecture decision",
  },
  {
    prompt: '"Analyze tradeoffs between SQL and NoSQL"',
    classification: "reasoning",
    model: "reasoning model",
    why: "Chain-of-thought detected",
  },
  {
    prompt: "[tool_calls in message context]",
    classification: "agentic",
    model: "premium model",
    why: "Tool use detected",
  },
  {
    prompt: "[image_url in message content]",
    classification: "vision",
    model: "vision model",
    why: "Image content detected",
  },
];

const badgeColors: Record<string, string> = {
  simple: "bg-[#00a86b]/10 text-[#00a86b]",
  complex: "bg-[#0066ff]/10 text-[#0066ff]",
  reasoning: "bg-[#9333ea]/10 text-[#9333ea]",
  agentic: "bg-[#f59e0b]/10 text-[#f59e0b]",
  vision: "bg-[#06b6d4]/10 text-[#06b6d4]",
};

export const ClassifierDemo = () => {
  return (
    <section id="routing-examples" className="py-6 md:py-10">
      <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
        <div className="text-center mb-8 md:mb-16">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            See the classifier decide
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666]">
            Real prompts. Real routing decisions. No black box.
          </p>
        </div>

        <div className="max-w-[960px] mx-auto">
          {/* Table */}
          <div className="border border-[#e5e5e5] rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] md:grid-cols-[2fr_120px_140px_180px] gap-3 px-5 py-3 bg-[#fafafa] border-b border-[#e5e5e5] text-xs font-semibold text-[#999] uppercase tracking-wider">
              <div>Prompt</div>
              <div>Class</div>
              <div>Routed to</div>
              <div className="hidden md:block">Why</div>
            </div>

            {/* Rows */}
            {examples.map((row, i) => (
              <div
                key={i}
                className={`grid grid-cols-[1fr_auto_auto_auto] md:grid-cols-[2fr_120px_140px_180px] gap-3 px-5 py-3 items-center text-sm ${
                  i < examples.length - 1
                    ? "border-b border-[#f0f0f0]"
                    : ""
                }`}
              >
                <div className="text-[#666] font-mono text-[13px] truncate">
                  {row.prompt}
                </div>
                <div>
                  <span
                    className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      badgeColors[row.classification] || badgeColors.complex
                    }`}
                  >
                    {row.classification}
                  </span>
                </div>
                <div className="text-[13px] font-medium text-[#0a0a0a]">
                  {row.model}
                </div>
                <div className="hidden md:block text-[13px] text-[#999]">
                  {row.why}
                </div>
              </div>
            ))}
          </div>

          {/* Explanatory text */}
          <p className="mt-5 text-[13px] text-[#999] text-center leading-relaxed">
            Classification uses sentence embeddings (~10ms overhead). When
            uncertain (confidence &lt;0.06), defaults to the complex model.
            Better to over-serve than under-serve.
          </p>
          <p className="mt-2 text-[13px] text-[#999] text-center">
            Test any prompt yourself:{" "}
            <code className="text-xs bg-[#f8f8f8] px-1.5 py-0.5 rounded border border-[#e5e5e5] font-mono">
              nadirclaw classify "your prompt here"
            </code>
          </p>
        </div>
      </div>
    </section>
  );
};
