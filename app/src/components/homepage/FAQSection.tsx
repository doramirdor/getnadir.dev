import { trackFaqOpen } from "@/utils/analytics";

const FAQS: [string, string][] = [
  [
    "Do I need to change my code?",
    "No. Nadir exposes an OpenAI compatible API. Change your base URL to api.getnadir.com and set model to auto. That is the entire change.",
  ],
  [
    "How does routing decide?",
    "A lightweight classifier reads each prompt, scores it on complexity and task type, and picks the cheapest model above your quality threshold. It adds under ten milliseconds.",
  ],
  [
    "What about quality?",
    "You set a quality floor per API key. Simple prompts route to Haiku class models. Anything above your threshold routes to your configured premium model.",
  ],
  [
    "Do you store my prompts?",
    "Only if you turn on logging. With BYOK and logging off, we never see your plaintext. Just headers and token counts.",
  ],
  [
    "Can I bring my own keys?",
    "Yes. BYOK is supported on every tier, including Free. Your keys stay in your environment.",
  ],
  [
    "What if a provider is down?",
    "Automatic failover. If Anthropic errors, Nadir retries against OpenAI or Google on your configured chain. Your app stays up.",
  ],
];

export const FAQSection = () => {
  return (
    <section className="py-24 md:py-36">
      <div className="max-w-[880px] mx-auto px-6 sm:px-8">
        <div className="text-center max-w-[760px] mx-auto mb-16 md:mb-20">
          <h2 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] m-0 mb-5 text-[#1d1d1f] leading-[1.05]">
            Answers, not hedges.
          </h2>
          <p className="text-lg md:text-[21px] text-[#424245] m-0 leading-[1.4] tracking-[-0.01em]">
            Everything teams ask before swapping their base URL.
          </p>
        </div>

        <div className="flex flex-col">
          {FAQS.map(([q, a]) => (
            <details
              key={q}
              className="group border-b border-black/[0.08] py-6"
              onToggle={(e) => {
                if ((e.currentTarget as HTMLDetailsElement).open) {
                  trackFaqOpen(q, "home_faq");
                }
              }}
            >
              <summary className="flex justify-between items-center text-[17px] md:text-[19px] font-medium text-[#1d1d1f] cursor-pointer list-none tracking-[-0.015em]">
                <span>{q}</span>
                <span className="text-[20px] text-[#86868b] font-light transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="text-[15px] md:text-[16px] text-[#424245] leading-[1.55] mt-3.5 mb-0 max-w-[720px] tracking-[-0.005em]">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};
