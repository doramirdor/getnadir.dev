const posts = [
  {
    date: "March 20, 2026",
    title: "Context Optimize: How We Cut LLM Input Tokens 30-70%",
    excerpt:
      "Safe mode applies lossless transforms. Aggressive mode adds diff-preserving semantic dedup. Both backed by 60 automated accuracy tests.",
    href: "/blog/context-optimize-cut-llm-input-tokens",
  },
  {
    date: "March 10, 2026",
    title: "How NadirClaw Saves 40-70% on LLM API Costs",
    excerpt:
      "Most LLM API costs are wasted on simple requests. NadirClaw analyzes prompt complexity in real-time and routes simple prompts to cheaper models.",
    href: "/blog/how-nadirclaw-saves-40-70-percent-on-llm-api-costs",
  },
  {
    date: "March 7, 2026",
    title: "NadirClaw + Claude Code: A Cost Optimization Guide",
    excerpt:
      "Claude Code generates thousands of API calls per session. Without routing, every call hits the same expensive model.",
    href: "/blog/nadirclaw-claude-code-cost-optimization-guide",
  },
  {
    date: "March 4, 2026",
    title: "Why Open-Source LLM Routing Matters",
    excerpt:
      "Proprietary LLM routers create a dependency you cannot inspect, audit, or customize. Open-source routing changes this entirely.",
    href: "/blog/why-open-source-llm-routing-matters",
  },
];

export const BlogTeaser = () => {
  return (
    <section
      id="blog"
      className="py-24 bg-gradient-to-b from-white via-[#fafafa] to-white"
    >
      <div className="max-w-[1120px] mx-auto px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight mb-3">
            From the blog
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666]">
            Practical guides to cutting your LLM costs.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-[960px] mx-auto">
          {posts.map((post) => (
            <a
              key={post.title}
              href={post.href}
              className="block p-6 border border-[#e5e5e5] rounded-xl bg-white hover:-translate-y-0.5 hover:shadow-lg transition-all no-underline group"
            >
              <div className="text-[13px] text-[#999] mb-2">{post.date}</div>
              <h3 className="text-lg font-semibold text-[#0a0a0a] mb-2 group-hover:text-[#0066ff] transition-colors leading-tight">
                {post.title}
              </h3>
              <p className="text-[15px] text-[#666] leading-relaxed mb-3">
                {post.excerpt}
              </p>
              <span className="text-sm font-medium text-[#0066ff]">
                Read more &rarr;
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};
