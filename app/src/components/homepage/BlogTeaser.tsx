const posts = [
  {
    date: "March 24, 2026",
    tag: "Benchmark",
    title: "Routing benchmark: 96% accuracy, 38% savings",
    excerpt:
      "We ran 50 real-world prompts through Nadir's classifier. Simple prompts went to Gemini Flash, complex stayed on Sonnet. 96% routing accuracy.",
    href: "/blog/50-prompt-benchmark",
  },
  {
    date: "March 20, 2026",
    tag: "Deep Dive",
    title: "Context Optimize saved 61% of input tokens on Opus",
    excerpt:
      "Agentic sessions bloat context with repeated tool schemas and pretty-printed JSON. Lossless compression across 5 real scenarios.",
    href: "/blog/context-optimize-savings",
  },
  {
    date: "March 15, 2026",
    tag: "Story",
    title: "Why we built Nadir: the $0.45 docstring problem",
    excerpt:
      "We were paying Claude Opus prices for 'write a docstring'. That's when we decided to route simple prompts to cheaper models.",
    href: "/blog/why-we-built-nadir",
  },
  {
    date: "March 10, 2026",
    tag: "Technical",
    title: "How our binary classifier routes prompts in 50ms",
    excerpt:
      "DistilBERT embeddings, centroid matching, and a 3-tier system that decides if your prompt needs a premium model or not.",
    href: "/blog/how-binary-classifier-works",
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
