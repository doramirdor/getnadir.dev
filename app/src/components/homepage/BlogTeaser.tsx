const posts = [
  {
    date: "May 14, 2026",
    tag: "Research",
    title: "56% of AI teams have no cost guardrails. Here is what the other 44% do.",
    excerpt:
      "The FinOps Foundation surveyed 1,192 organizations. Fewer than half have financial guardrails for AI. The ones that do spend 3.2x less per completed task.",
    href: "/blog/finops-for-ai-cost-governance",
  },
  {
    date: "May 13, 2026",
    tag: "Deep Dive",
    title: "Tokens got 280x cheaper. Your AI bill still tripled. Here is why.",
    excerpt:
      "Per-token prices fell 99.7% in two years. Enterprise AI spend tripled anyway. The Jevons Paradox, applied to inference.",
    href: "/blog/ai-jevons-paradox-token-costs",
  },
  {
    date: "May 12, 2026",
    tag: "Research",
    title: "Enterprise AI costs dropped 67% this year. Routing is the reason.",
    excerpt:
      "Average enterprise cost per million tokens fell from $18.40 to $6.07. Token price cuts explain half. Multi-model routing explains the rest.",
    href: "/blog/enterprise-ai-costs-routing-2026",
  },
  {
    date: "May 11, 2026",
    tag: "Deep Dive",
    title: "Opus 4.7 costs more than 4.6. Anthropic just did not change the price.",
    excerpt:
      "A new tokenizer produces up to 35% more tokens from the same text. Same rate card. Higher bill. We break down the real numbers.",
    href: "/blog/opus-4-7-tokenizer-hidden-cost",
  },
];

export const BlogTeaser = () => {
  return (
    <section
      id="blog"
      className="py-6 md:py-10 bg-gradient-to-b from-white via-[#fafafa] to-white"
    >
      <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
        <div className="text-center mb-8 md:mb-16">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            From the blog
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666]">
            Practical guides to cutting your LLM costs.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5 max-w-[960px] mx-auto">
          {posts.map((post, i) => (
            <a
              key={post.title}
              href={post.href}
              className={`block p-6 rounded-xl bg-white hover:-translate-y-0.5 hover:shadow-lg transition-all no-underline group ${
                i === 0
                  ? "border-2 border-[#0066ff]/20 md:col-span-2"
                  : "border border-[#e5e5e5]"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider bg-[#0066ff]/8 text-[#0066ff]">
                  {post.tag}
                </span>
                <span className="text-[12px] text-[#999]">{post.date}</span>
              </div>
              <h3 className={`font-semibold text-[#0a0a0a] mb-2 group-hover:text-[#0066ff] transition-colors leading-tight ${
                i === 0 ? "text-xl" : "text-base"
              }`}>
                {post.title}
              </h3>
              <p className="text-[14px] text-[#666] leading-relaxed">
                {post.excerpt}
              </p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};
