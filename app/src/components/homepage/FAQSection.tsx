import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "What is Nadir?",
    a: "Nadir is an open-source LLM router that sits between your application and LLM providers. It analyzes prompt complexity in real-time and automatically routes simple requests to cheaper models while keeping complex tasks on premium models, saving 30-60% on API costs without changing any code.",
  },
  {
    q: "How does Nadir reduce costs?",
    a: "Nadir classifies each prompt by complexity. Simple tasks like status checks, formatting, and basic Q&A are routed to budget-tier models. Complex tasks like code generation and reasoning stay on premium models. You pay less per token on average without sacrificing quality where it matters.",
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
    q: "How does the classifier work?",
    a: 'Nadir uses sentence embeddings (DistilBERT-based) to compute cosine similarity against pre-trained centroid vectors for simple and complex prompts. Classification takes ~10ms. It also detects agentic workflows (tool calls), reasoning chains ("step by step"), and vision content (images) as separate routing signals.',
  },
  {
    q: "What happens when the classifier is wrong?",
    a: "Nadir biases toward the complex model on low-confidence classifications (threshold: 0.06). This means it's more likely to over-serve (send a simple prompt to a premium model) than under-serve. You can test any prompt with nadirclaw classify \"your prompt\" and tune the threshold.",
  },
  {
    q: "How much latency does routing add?",
    a: "~10ms for the sentence embedding classification. The router runs locally on your machine, so there is no network hop. For comparison, a typical LLM API call takes 500ms-5s. The routing overhead is less than 1% of total request time.",
  },
  {
    q: 'Where does the "30-60% savings" claim come from?',
    a: "We benchmarked 50 real-world prompts across simple, medium, and complex tiers. Simple and medium prompts routed to Gemini Flash saved 97%. Complex prompts stayed on Sonnet but saved 12% via Context Optimize. Blended average: 38%. Workloads with more simple prompts see 50-60% savings; complex-heavy workloads see 30%. Your actual savings depend on your prompt mix.",
  },
];

export const FAQSection = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-6 md:py-10">
      <div className="max-w-[1120px] mx-auto px-4 sm:px-8">
        <div className="text-center mb-8 md:mb-16">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            Frequently asked questions
          </h2>
          <div className="w-12 h-[3px] bg-gradient-to-r from-[#0066ff] to-[#00a86b] rounded-full mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666]">
            Everything you need to know about Nadir.
          </p>
        </div>

        <div className="max-w-[720px] mx-auto divide-y divide-[#e5e5e5]">
          {faqs.map((faq, i) => (
            <div key={faq.q}>
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between py-5 text-left gap-4"
              >
                <h3 className="text-base font-semibold text-[#0a0a0a]">{faq.q}</h3>
                <ChevronDown
                  className={`w-4 h-4 flex-shrink-0 text-[#999] transition-transform ${
                    openIndex === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openIndex === i && (
                <p className="text-[15px] text-[#666] leading-relaxed pb-5 -mt-1">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
