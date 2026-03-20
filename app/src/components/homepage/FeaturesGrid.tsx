export const FeaturesGrid = () => {
  return (
    <>
      {/* Pain Points */}
      <section className="py-24 bg-gradient-to-b from-white via-[#fafafa] to-white">
        <div className="max-w-[960px] mx-auto px-8">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-lg hover:bg-white/80 transition-all">
              <h3 className="text-lg font-semibold mb-2 tracking-tight">
                Most prompts don't need your best model
              </h3>
              <p className="text-[15px] text-[#666] leading-relaxed">
                Code formatting, basic questions, simple edits. They don't need{" "}
                <code className="text-xs bg-[#f8f8f8] px-1 py-0.5 rounded border border-[#e5e5e5]">
                  gpt-5.2
                </code>{" "}
                at $1.75/$14 per 1M tokens or{" "}
                <code className="text-xs bg-[#f8f8f8] px-1 py-0.5 rounded border border-[#e5e5e5]">
                  opus-4.6
                </code>{" "}
                at $15/$75, but that's what you're paying for.
              </p>
            </div>
            <div className="p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-lg hover:bg-white/80 transition-all">
              <h3 className="text-lg font-semibold mb-2 tracking-tight">
                You're blind to where money goes
              </h3>
              <p className="text-[15px] text-[#666] leading-relaxed">
                API bills show totals, not breakdowns. You have no idea which
                prompts cost $0.001 and which cost $0.50.
              </p>
            </div>
            <div className="p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-lg hover:bg-white/80 transition-all">
              <h3 className="text-lg font-semibold mb-2 tracking-tight">
                Changing models breaks workflow
              </h3>
              <p className="text-[15px] text-[#666] leading-relaxed">
                Switching between{" "}
                <code className="text-xs bg-[#f8f8f8] px-1 py-0.5 rounded border border-[#e5e5e5]">
                  gpt-5.2
                </code>{" "}
                and{" "}
                <code className="text-xs bg-[#f8f8f8] px-1 py-0.5 rounded border border-[#e5e5e5]">
                  gpt-5-mini
                </code>{" "}
                in your editor kills momentum. So you just pay more.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="max-w-[1120px] mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight mb-3">
              How it works
            </h2>
            <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
            <p className="text-lg text-[#666]">Install once. Route forever.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 max-w-[800px] mx-auto">
            {[
              {
                step: "STEP 1",
                title: "Start the router",
                desc: "Run NadirClaw locally. It sits between your app and OpenAI's API. No cloud services, no signup, no tracking.",
              },
              {
                step: "STEP 2",
                title: "Point your tools to localhost",
                desc: "Change your base URL from api.openai.com to localhost:8856. Works with Claude Code, Cursor, Codex, Aider, or any OpenAI-compatible client.",
              },
              {
                step: "STEP 3",
                title: "Watch costs drop",
                desc: "NadirClaw classifies every prompt and routes it to the cheapest model that can handle it. Check the dashboard to see where you're actually spending.",
              },
              {
                step: "STEP 4",
                title: "See exactly where your money goes",
                desc: "Full request logs, per-model costs, latency tracking. Know which features of your app are expensive before the bill arrives.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="text-left p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-lg transition-all"
              >
                <div className="text-sm font-semibold text-[#0066ff] mb-3 tracking-wider">
                  {item.step}
                </div>
                <h3 className="text-[22px] font-semibold mb-2 tracking-tight">
                  {item.title}
                </h3>
                <p className="text-[15px] text-[#666] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Swap Section */}
      <section className="py-24 bg-gradient-to-b from-white via-[#fafafa] to-white">
        <div className="max-w-[1120px] mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight mb-3">
              One line changes everything
            </h2>
            <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
            <p className="text-lg text-[#666]">
              Literally one URL swap. That's it.
            </p>
          </div>

          <div className="max-w-[720px] mx-auto space-y-8">
            {/* Before */}
            <div className="border border-[#e5e5e5] rounded-lg overflow-hidden hover:shadow-md hover:-translate-y-px transition-all">
              <div className="px-4 py-2.5 bg-[#f8f8f8] border-b border-[#e5e5e5] text-xs font-semibold text-[#999] uppercase tracking-wider">
                Before
              </div>
              <pre className="p-4 text-sm font-mono leading-relaxed overflow-x-auto">
                <code>
                  {`import openai

client = openai.OpenAI(
    base_url="https://api.openai.com/v1",
    api_key="sk-..."
)`}
                </code>
              </pre>
            </div>

            {/* After */}
            <div className="border border-[#e5e5e5] rounded-lg overflow-hidden hover:shadow-md hover:-translate-y-px transition-all">
              <div className="px-4 py-2.5 bg-[#f8f8f8] border-b border-[#e5e5e5] text-xs font-semibold text-[#999] uppercase tracking-wider">
                After
              </div>
              <pre className="p-4 text-sm font-mono leading-relaxed overflow-x-auto">
                <code>
                  {`import openai

client = openai.OpenAI(`}
                  {"\n"}
                  <span className="bg-[#0066ff]/5 text-[#0066ff]">
                    {'    base_url="http://localhost:8856",'}
                  </span>
                  {"\n"}
                  {'    api_key="sk-..."'}
                  {"\n)"}
                </code>
              </pre>
            </div>

            <div className="text-center p-6 bg-[#fafafa] rounded-lg border border-[#e5e5e5]">
              <p className="text-[15px] text-[#666] mb-2">
                Simple prompts route to{" "}
                <code className="text-xs bg-white px-1 py-0.5 rounded border border-[#e5e5e5]">
                  gpt-5-mini
                </code>{" "}
                ($0.25/1M) or{" "}
                <code className="text-xs bg-white px-1 py-0.5 rounded border border-[#e5e5e5]">
                  haiku-4.5
                </code>{" "}
                ($1/1M) instead of{" "}
                <code className="text-xs bg-white px-1 py-0.5 rounded border border-[#e5e5e5]">
                  gpt-5.2
                </code>{" "}
                ($1.75/$14) or{" "}
                <code className="text-xs bg-white px-1 py-0.5 rounded border border-[#e5e5e5]">
                  opus-4.6
                </code>{" "}
                ($15/$75)
              </p>
              <p className="text-2xl font-bold text-[#0066ff]">
                Up to 7x cheaper input, 37x cheaper output
              </p>
              <p className="text-[13px] text-[#999] mt-2">
                Your actual savings depend on your prompt mix. Run{" "}
                <code className="text-xs bg-white px-1 py-0.5 rounded border border-[#e5e5e5]">
                  nadirclaw report
                </code>{" "}
                to see your real breakdown.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Observability */}
      <section className="py-24">
        <div className="max-w-[1120px] mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight mb-3">
              Observability built in
            </h2>
            <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
            <p className="text-lg text-[#666] max-w-[560px] mx-auto">
              Every request through{" "}
              <code className="text-sm bg-[#f8f8f8] px-1 py-0.5 rounded border border-[#e5e5e5]">
                nadirclaw
              </code>{" "}
              is logged automatically. No SDK changes, no decorators, no
              instrumentation.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-[960px] mx-auto">
            {[
              {
                title: "Cost per request",
                desc: "See exactly what each prompt costs. Break down spend by model, by task, by user. Find the $5 prompt hiding in your $200 bill.",
              },
              {
                title: "Full request logs",
                desc: "Every prompt and response captured. Debug weird agent behavior by reading the actual conversation, not guessing.",
              },
              {
                title: "Latency tracking",
                desc: "p50, p95, p99 per model. See which calls are slow. Spot timeouts before they become a problem.",
              },
              {
                title: "Error rates and retries",
                desc: "How often are calls failing? Which models have the highest error rates? Are you retrying intelligently or burning money?",
              },
              {
                title: "Classification breakdown",
                desc: "See what percentage of your traffic is simple vs complex. Understand your actual usage patterns, not assumptions.",
              },
              {
                title: "Zero instrumentation",
                desc: "Other tools require decorators, SDK wrappers, or OpenTelemetry setup. nadirclaw logs everything at the proxy layer. Point your app at it and you're done.",
              },
            ].map((item) => (
              <div key={item.title} className="p-4">
                <h3 className="text-base font-semibold mb-2">{item.title}</h3>
                <p className="text-[15px] text-[#666] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
};
