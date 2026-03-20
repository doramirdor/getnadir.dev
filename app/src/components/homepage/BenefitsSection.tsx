export const BenefitsSection = () => {
  return (
    <>
      {/* Why Not Rules */}
      <section className="py-24 bg-gradient-to-b from-white via-[#fafafa] to-white">
        <div className="max-w-[1120px] mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight mb-3">
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
                tracking, the dashboard. NadirClaw ships all of that.{" "}
                <code className="text-xs bg-[#f8f8f8] px-1 py-0.5 rounded border border-[#e5e5e5]">
                  pip install
                </code>{" "}
                and done.
              </p>
            </div>
            <div className="p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-lg transition-all">
              <div className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-3">
                NadirClaw
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
      <section className="py-20">
        <div className="max-w-[1120px] mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight mb-3">
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
                title: "Docker + Compose",
                desc: "docker compose up gives you NadirClaw + Ollama for a fully local stack. Mount your .env for API keys.",
              },
              {
                title: "Fallback chains",
                desc: "When a provider returns 429 or 5xx, NadirClaw cascades through your fallback chain. Configure per-tier or use the global default.",
              },
              {
                title: "Prometheus metrics",
                desc: "/metrics endpoint with request counts, latency histograms, token totals, cache hit rates. Zero extra dependencies.",
              },
              {
                title: "Budget controls",
                desc: "Set daily and monthly spending limits. Get alerts before you hit them. nadirclaw budget shows real-time status.",
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
            All credentials stay on your machine in{" "}
            <code className="text-xs bg-[#f8f8f8] px-1.5 py-0.5 rounded border border-[#e5e5e5]">
              ~/.nadirclaw/credentials.json
            </code>
            . No telemetry. No data leaves your network. Your API keys never
            touch our servers because there are no servers.
          </p>
        </div>
      </section>

      {/* Context Optimize */}
      <section className="py-24 bg-gradient-to-b from-white via-[#fafafa] to-white">
        <div className="max-w-[1120px] mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight mb-3">
              Context Optimize
            </h2>
            <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
            <p className="text-lg text-[#666] max-w-[560px] mx-auto">
              Routes to the right model, then trims the payload before it hits
              your bill.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-[960px] mx-auto">
            {/* Bars */}
            <div>
              <p className="text-[13px] text-[#666] mb-3">
                Benchmarked on Claude Opus 4.6 -- safe mode (lossless)
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
            <div>
              <div className="mb-6">
                <h3 className="text-base font-semibold mb-3">
                  Safe mode transforms
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
                    -- repeated tool schemas replaced with short references
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
                    -- keep system + first turn + last N turns
                  </li>
                </ul>
              </div>

              <div className="bg-[#f8f8f8] border border-[#e5e5e5] rounded-lg p-4 font-mono text-sm leading-relaxed">
                <span className="text-[#999]"># enable on your server</span>
                <br />
                nadirclaw serve --optimize safe
                <br />
                <br />
                <span className="text-[#999]"># or per-request</span>
                <br />
                {`{"optimize": "safe", "model": "auto", ...}`}
                <br />
                <br />
                <span className="text-[#999]"># dry-run on any file</span>
                <br />
                nadirclaw optimize payload.json
              </div>

              <p className="text-xs text-[#999] mt-3">
                All transforms are lossless. Code blocks, URLs, and unicode are
                never modified. Off by default -- zero overhead when disabled.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
