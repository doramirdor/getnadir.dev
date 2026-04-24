import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { SignupDialog } from "@/components/marketing/SignupDialog";
import { trackCtaClick, trackPageView } from "@/utils/analytics";

const PIPELINE = [
  {
    n: "01",
    title: "Your app calls Nadir",
    body: "You keep using the OpenAI SDK you already have. Point it at our endpoint, done. No new library, no code changes beyond a base URL swap.",
  },
  {
    n: "02",
    title: "We read the prompt",
    body: "We look at what the request actually needs: how long it is, whether it involves code, reasoning, tool calls, or structured output. It's a read-only pass that takes a few milliseconds.",
  },
  {
    n: "03",
    title: "We score the complexity",
    body: "Our router decides how hard the prompt really is, on a simple three-way split: is this a Haiku-class prompt, a Sonnet-class prompt, or genuinely Opus-worthy? You'd be surprised how often the answer is \"Haiku is plenty.\"",
  },
  {
    n: "04",
    title: "We pick the cheapest model that still fits",
    body: "The router picks the cheapest model whose quality clears the floor you set. When in doubt, it upgrades rather than downgrades. You stay in control of how aggressive that trade-off is.",
  },
  {
    n: "05",
    title: "We check the provider is healthy",
    body: "If the chosen provider is throttling, slow, or erroring, we automatically send the request to an equivalent model on a healthy provider instead. Your app doesn't notice.",
  },
  {
    n: "06",
    title: "The response streams back",
    body: "Same response shape you'd get calling the provider directly. We log the cost, latency, and outcome so you can see exactly what happened on that request, later.",
  },
];

export default function SolutionRouting() {
  useEffect(() => {
    trackPageView("solutions_routing");
  }, []);
  return (
    <MarketingLayout>
      <SEO
        title="LLM Routing - Nadir"
        description="Route every prompt to the cheapest model that can still handle it. Nadir's trained router saves up to 47% vs always-Opus with 0% catastrophic routes."
        path="/solutions/routing"
      />

      <section className="max-w-4xl mx-auto px-6 pt-20 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          LLM Routing
        </h1>
        <p className="text-xl text-[#666] max-w-2xl mx-auto mb-8">
          Every prompt goes to the cheapest model that can still handle it. Opus only when Opus is actually needed, Haiku when Haiku is enough, and a learned classifier deciding in under 10ms.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { k: "Up to 47%", v: "cheaper than always-Opus on the same traffic mix" },
            { k: "< 10ms", v: "added latency for the routing decision" },
            { k: "0%", v: "catastrophic routes in our internal eval" },
          ].map((s) => (
            <div key={s.k} className="p-5 bg-white border border-[#e5e5e5] rounded-xl">
              <div className="text-2xl font-bold text-[#0a0a0a]">{s.k}</div>
              <div className="text-sm text-[#666] mt-1">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2 text-center">How the system works</h2>
        <p className="text-center text-[#666] mb-8 max-w-2xl mx-auto">
          Six stages between your request and the model call. All of it runs in our edge path, not yours.
        </p>
        <div className="space-y-3">
          {PIPELINE.map((s) => (
            <div
              key={s.n}
              className="flex gap-4 p-5 bg-white border border-[#e5e5e5] rounded-xl"
            >
              <div className="text-[#999] font-mono text-sm shrink-0 w-10 pt-0.5">
                {s.n}
              </div>
              <div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-sm text-[#666]">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2 text-center">Three tiers, one decision</h2>
        <p className="text-center text-[#666] mb-8 max-w-2xl mx-auto">
          Instead of staring at a wall of twenty models, the router thinks in three tiers. Every incoming prompt lands in one of them.
        </p>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-5 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-[#00a86b]" />
              <span className="font-semibold">Fast tier</span>
            </div>
            <p className="text-sm text-[#666]">
              Quick answers, classifications, short rewrites, simple lookups. Most traffic lives here and most teams are surprised how much.
            </p>
          </div>
          <div className="p-5 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-[#0066ff]" />
              <span className="font-semibold">Everyday tier</span>
            </div>
            <p className="text-sm text-[#666]">
              Multi-turn chat, light reasoning, code snippets, structured data extraction. The workhorse tier for most product surfaces.
            </p>
          </div>
          <div className="p-5 bg-white border border-[#e5e5e5] rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-[#7c3aed]" />
              <span className="font-semibold">Heavy tier</span>
            </div>
            <p className="text-sm text-[#666]">
              Hard reasoning, long documents, agent loops, cross-file code review. Expensive, so we only send here when the prompt genuinely needs it.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">How the router stays honest</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-3">It's trained on real traffic</h3>
            <p className="text-sm text-[#666]">
              The router is a trained model, not a handful of if-statements. It's learned from hundreds of thousands of labeled prompts, and it keeps learning from your workloads once you opt in.
            </p>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-3">It prefers to be safe</h3>
            <p className="text-sm text-[#666]">
              When the router is unsure, it picks the stronger model. Saving money is the goal, but quietly regressing your product is not. You set the strictness; the router respects it.
            </p>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-3">It gets smarter over time</h3>
            <p className="text-sm text-[#666]">
              Every routed request is signal. Over weeks, the router gets more confident about your traffic specifically, and more aggressive in the right places, without you touching a thing.
            </p>
          </div>
          <div className="p-6 bg-white border border-[#e5e5e5] rounded-xl">
            <h3 className="text-lg font-semibold mb-3">It never blocks your request</h3>
            <p className="text-sm text-[#666]">
              The routing decision itself is fast enough that, for most apps, it's invisible next to the LLM call that follows. If anything goes wrong internally, the request still goes through, just without the optimization.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">What you actually keep</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              title: "Your SLA",
              body: "Added latency stays under 10ms p99. For most apps, the routing hop is invisible next to the LLM itself.",
            },
            {
              title: "Your quality floor",
              body: "You set the floor (strict, balanced, aggressive). The router never drops below it. If it's unsure, it upgrades.",
            },
            {
              title: "Your keys",
              body: "BYOK supported. Nadir never stores your provider keys in plaintext and never proxies traffic we don't need to.",
            },
            {
              title: "Your escape hatch",
              body: "Pin a request, a user, or a cluster to a specific model any time. The router respects overrides without fighting you.",
            },
          ].map((o) => (
            <div key={o.title} className="p-5 bg-white border border-[#e5e5e5] rounded-xl">
              <h3 className="font-semibold mb-1">{o.title}</h3>
              <p className="text-sm text-[#666]">{o.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-center">Two-line integration</h2>
        <div className="bg-[#0a0a0a] text-gray-100 rounded-xl p-6 font-mono text-sm overflow-x-auto">
          <div className="text-gray-500"># Point your OpenAI client at Nadir, done.</div>
          <div><span className="text-[#ff7b72]">from</span> openai <span className="text-[#ff7b72]">import</span> OpenAI</div>
          <div>client = OpenAI(</div>
          <div>&nbsp;&nbsp;base_url=<span className="text-[#a5d6ff]">"https://api.getnadir.com/v1"</span>,</div>
          <div>&nbsp;&nbsp;api_key=<span className="text-[#a5d6ff]">"nad_..."</span>,</div>
          <div>)</div>
          <div className="mt-3">client.chat.completions.create(</div>
          <div>&nbsp;&nbsp;model=<span className="text-[#a5d6ff]">"nadir-auto"</span>,  <span className="text-gray-500"># router picks Haiku / Sonnet / Opus</span></div>
          <div>&nbsp;&nbsp;messages=[...],</div>
          <div>)</div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-20 text-center">
        <h3 className="text-2xl font-bold mb-2">Cut your LLM bill this week</h3>
        <p className="text-[#666] mb-6">
          Typical Nadir account sees measurable savings inside 48 hours. First month is free, you only pay on what we save you.
        </p>
        <SignupDialog ctaLabel="start_saving" ctaLocation="solution_routing_bottom">
          <button
            type="button"
            onClick={() => trackCtaClick("start_saving", "solution_routing_bottom")}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a0a0a] text-white rounded-lg text-[15px] font-semibold hover:bg-[#333] transition-all"
          >
            Start saving
          </button>
        </SignupDialog>
      </section>
    </MarketingLayout>
  );
}
