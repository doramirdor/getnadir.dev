export const BenefitsSection = () => {
  return (
    <>
      {/* Why Not Rules */}
      <section className="py-6 md:py-10 bg-gradient-to-b from-white via-[#fafafa] to-white">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
          <div className="text-center mb-8 md:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              Why not just use rules?
            </h2>
            <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
            <p className="text-lg text-[#666] max-w-[560px] mx-auto">
              The most common question: "Can't I just write if/else logic
              instead?"
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-[960px] mx-auto">
            <div className="p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-lg transition-all">
              <div className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-3">
                Manual rules
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Breaks on edge cases
              </h3>
              <p className="text-[15px] text-[#666] leading-relaxed">
                Rules like "short prompt = cheap model" fail immediately. "Fix
                the auth bug" is short but complex. "Explain the entire codebase
                architecture in detail" is long but a simple retrieval. You end
                up maintaining a growing regex graveyard.
              </p>
            </div>
            <div className="p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-lg transition-all">
              <div className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-3">
                Gateway + heuristics
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Works, but you build everything
              </h3>
              <p className="text-[15px] text-[#666] leading-relaxed">
                LiteLLM gives you multi-provider access. But you still write the
                routing logic, the classifier, the fallback chains, the cost
                tracking, the dashboard. Nadir ships all of that.
                One URL swap and done.
              </p>
            </div>
            <div className="p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-lg transition-all">
              <div className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-3">
                Nadir
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Semantic understanding
              </h3>
              <p className="text-[15px] text-[#666] leading-relaxed">
                Sentence embeddings understand intent, not keywords. Detects
                agentic workflows, reasoning chains, and vision content
                automatically. Biases toward the complex model when uncertain.
                You configure models, not rules.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Built for Production */}
      <section className="py-8 md:py-14">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
          <div className="text-center mb-8 md:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              Built for production
            </h2>
            <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
            <p className="text-lg text-[#666]">
              Not a prototype. Ship it with confidence.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-[960px] mx-auto">
            {[
              {
                title: "Managed infrastructure",
                desc: "No servers to run. Nadir Pro handles routing, caching, and failover at the edge. You get an API endpoint and a dashboard.",
              },
              {
                title: "Fallback chains",
                desc: "When a provider returns 429 or 5xx, Nadir cascades through your fallback chain. Configure per-tier or use the global default.",
              },
              {
                title: "Full observability",
                desc: "Request logs, per-model costs, latency histograms, token totals, and cache hit rates. All visible in your dashboard.",
              },
              {
                title: "Budget controls",
                desc: "Set daily and monthly spending limits. Get alerts before you hit them. Track real-time usage in your dashboard.",
              },
              {
                title: "Session persistence",
                desc: "Pins model choice for multi-turn conversations (30min TTL). No jarring mid-thread model switches.",
              },
              {
                title: "Context window safety",
                desc: "Estimates token count before routing. If a 150K-token conversation targets a 128K model, it swaps to a larger-context model automatically.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-lg transition-all"
              >
                <h3 className="text-base font-semibold mb-2">{item.title}</h3>
                <p className="text-[15px] text-[#666] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-8 text-sm text-[#666] text-center max-w-[640px] mx-auto">
            Your API keys are encrypted at rest and never logged.
            All traffic is routed over TLS. Want full control?{" "}
            <a href="/self-host" className="text-[#0066ff] hover:underline">
              Self-host for free
            </a>{" "}
            with the open-source MIT-licensed core.
          </p>
        </div>
      </section>

      {/* Context Optimize */}
      <section className="py-6 md:py-10 bg-gradient-to-b from-white via-[#fafafa] to-white">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
          <div className="text-center mb-8 md:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              Context Optimize
            </h2>
            <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
            <p className="text-lg text-[#666] max-w-[600px] mx-auto">
              Routes to the right model, then trims the payload before it hits
              your bill. Lossless by default -- output quality stays identical.
            </p>
          </div>

          {/* Before / After example */}
          <div className="max-w-[800px] mx-auto mb-8 md:mb-16">
            <h3 className="text-lg font-semibold text-center mb-6">
              Before vs after (real agentic payload)
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-[#e5e5e5] rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-[#f8f8f8] border-b border-[#e5e5e5] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#999] uppercase tracking-wider">Before</span>
                  <span className="text-xs font-mono text-[#666]">12,847 tokens</span>
                </div>
                <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto text-[#666] max-h-[220px]">
{`{
  "messages": [
    { "role": "system",
      "content": "You are a helpful..." },
    { "role": "system",
      "content": "You are a helpful..." },
    { "role": "user",
      "content": "List files" },
    { "role": "assistant",
      "content": "Here are the files:\\n\\n
        \\n  - src/\\n  - package.json" },
    { "role": "user", ... },
    `}<span className="text-[#999]">{"// ...6 more turns"}</span>{`
  ],
  "tools": [
    { "name": "read_file",
      "parameters": { `}<span className="text-red-400">{"/* 340 tokens */"}</span>{` }},
    { "name": "write_file",
      "parameters": { `}<span className="text-red-400">{"/* 340 tokens (dup) */"}</span>{` }}
  ]
}`}
                </pre>
              </div>
              <div className="border border-[#e5e5e5] rounded-lg overflow-hidden ring-2 ring-[#00a86b]/30">
                <div className="px-4 py-2.5 bg-[#f8f8f8] border-b border-[#e5e5e5] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#00a86b] uppercase tracking-wider">After (safe mode)</span>
                  <span className="text-xs font-mono text-[#00a86b] font-semibold">5,526 tokens (-57%)</span>
                </div>
                <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto text-[#666] max-h-[220px]">
{`{
  "messages": [
    { "role": "system",
      "content": "You are a helpful..." },
    `}<span className="text-[#00a86b]">{"// dup system prompt removed"}</span>{`
    { "role": "user",
      "content": "List files" },
    `}<span className="text-[#00a86b]">{"// early turns trimmed (kept last 4)"}</span>{`
    { "role": "user", ... },
    { "role": "assistant", ... }
  ],
  "tools": [
    { "name": "read_file",
      "parameters": {`}<span className="text-[#0066ff]">{" /* compact */"}</span>{` }},
    { "name": "write_file",
      "parameters": "`}<span className="text-[#0066ff]">$ref:read_file</span>{`" }
  ]
}`}
                </pre>
              </div>
            </div>
            <p className="text-center text-sm text-[#666] mt-4">
              Same output quality. <strong className="text-[#00a86b]">57% fewer input tokens.</strong> The LLM sees the same effective context.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-[960px] mx-auto">
            {/* Bars */}
            <div className="md:col-span-1">
              <p className="text-[13px] text-[#666] mb-3">
                Benchmarked on premium models -- safe mode (lossless)
              </p>
              <div className="space-y-4">
                {[
                  {
                    label: "Agentic (8 turns)",
                    remaining: 43,
                    saved: 57,
                  },
                  { label: "RAG pipeline", remaining: 71, saved: 29 },
                  { label: "API responses", remaining: 38, saved: 62 },
                  { label: "Debug sessions", remaining: 37, saved: 63 },
                  { label: "OpenAPI specs", remaining: 29, saved: 71 },
                ].map((bar) => (
                  <div key={bar.label} className="flex items-center gap-3">
                    <span className="text-sm text-[#666] w-32 shrink-0">
                      {bar.label}
                    </span>
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
              <p className="text-xs text-[#999] mt-3">
                Bars show tokens remaining after optimization. Average:{" "}
                <strong className="text-[#0066ff]">61.5% reduction</strong>{" "}
                across structured payloads.
              </p>
            </div>

            {/* Details */}
            <div className="md:col-span-2">
              <div className="mb-6">
                <h3 className="text-base font-semibold mb-3">
                  What safe mode does
                </h3>
                <ul className="space-y-2 text-[15px] text-[#666]">
                  <li>
                    <strong className="text-[#0a0a0a]">
                      JSON minification
                    </strong>{" "}
                    -- compact pretty-printed JSON without changing values
                  </li>
                  <li>
                    <strong className="text-[#0a0a0a]">
                      Tool schema dedup
                    </strong>{" "}
                    -- repeated tool schemas replaced with short references (agents often send the same schema 10+ times)
                  </li>
                  <li>
                    <strong className="text-[#0a0a0a]">
                      System prompt dedup
                    </strong>{" "}
                    -- duplicated system text removed from later messages
                  </li>
                  <li>
                    <strong className="text-[#0a0a0a]">
                      Whitespace normalization
                    </strong>{" "}
                    -- collapse runs of blanks, skip code blocks
                  </li>
                  <li>
                    <strong className="text-[#0a0a0a]">
                      Chat history trimming
                    </strong>{" "}
                    -- keep system + first turn + last N turns, drop stale middle turns
                  </li>
                </ul>
              </div>

              <div className="mb-6">
                <h3 className="text-base font-semibold mb-2">
                  Why it's lossless
                </h3>
                <p className="text-[15px] text-[#666] leading-relaxed">
                  Every transform preserves semantic meaning. Minified JSON parses identically.
                  Deduped schemas are expanded by the model. Trimmed history keeps the turns
                  that matter. Code blocks, URLs, and unicode are never touched.
                </p>
              </div>

              <p className="text-xs text-[#999] mt-3">
                Off by default -- zero overhead when disabled.{" "}
                <a href="/optimize" className="text-[#0066ff] hover:underline">
                  See full benchmark results and aggressive mode
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
