const faqs = [
  {
    q: "What is Nadir?",
    a: "Nadir is an open-source LLM router that sits between your application and LLM providers. It analyzes prompt complexity in real-time and automatically routes simple requests to cheaper models while keeping complex tasks on premium models, saving 40-70% on API costs without changing any code.",
  },
  {
    q: "How does Nadir reduce costs?",
    a: "Nadir classifies each prompt by complexity. Simple tasks like status checks, formatting, and basic Q&A are routed to budget-tier models. Complex tasks like code generation and reasoning stay on premium models. You pay less per token on average — without sacrificing quality where it matters.",
  },
  {
    q: "Does Nadir require code changes?",
    a: "No. Nadir is a drop-in proxy. Point your LLM client's base URL to Nadir instead of the provider directly. It works with Claude Code, Cursor, Aider, and any OpenAI-compatible client.",
  },
  {
    q: "Is Nadir free?",
    a: "Yes. Nadir is free and open-source under the MIT license. You can self-host it on your own infrastructure at no cost.",
  },
  {
    q: "What LLM providers does Nadir support?",
    a: "Nadir supports Anthropic (Claude), OpenAI (GPT), and Google (Gemini) models out of the box. You can configure custom model tiers and routing rules for any OpenAI-compatible provider.",
  },
  {
    q: "How do I install Nadir?",
    a: "Run pip install nadir or use Docker: docker run -p 8000:8000 nadir/nadir. Configuration is done through environment variables or a config file.",
  },
  {
    q: "How does the classifier work?",
    a: 'Nadir uses sentence embeddings (DistilBERT-based) to compute cosine similarity against pre-trained centroid vectors for simple and complex prompts. Classification takes ~10ms. It also detects agentic workflows (tool calls), reasoning chains ("step by step"), and vision content (images) as separate routing signals.',
  },
  {
    q: "What happens when the classifier is wrong?",
    a: "Nadir biases toward the complex model on low-confidence classifications (threshold: 0.06). This means it's more likely to over-serve (send a simple prompt to a premium model) than under-serve. You can test any prompt with nadir classify \"your prompt\" and tune the threshold via NADIR_CONFIDENCE_THRESHOLD.",
  },
  {
    q: "How much latency does routing add?",
    a: "~10ms for the sentence embedding classification. The router runs locally on your machine, so there is no network hop. For comparison, a typical LLM API call takes 500ms-5s. The routing overhead is less than 1% of total request time.",
  },
  {
    q: 'Where does the "40-70% savings" claim come from?',
    a: "In typical coding sessions, 60-70% of prompts are simple (file reads, formatting, basic questions, docstrings). If those route to models that cost 10-20x less per token, your blended cost drops 40-70%. Your actual savings depend on your prompt mix. Run nadir report to see your real breakdown after a day of use.",
  },
];

export const FAQSection = () => {
  return (
    <section id="faq" className="py-24">
      <div className="max-w-[1120px] mx-auto px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold tracking-tight mb-3">
            Frequently asked questions
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666]">
            Everything you need to know about Nadir.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-x-12 gap-y-8 max-w-[960px] mx-auto">
          {faqs.map((faq) => (
            <div key={faq.q} className="pb-6 border-b border-[#e5e5e5]">
              <h3 className="text-base font-semibold mb-2">{faq.q}</h3>
              <p className="text-[15px] text-[#666] leading-relaxed">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
