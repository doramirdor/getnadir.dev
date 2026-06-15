import { useEffect } from "react";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { trackPageView, trackFaqOpen } from "@/utils/analytics";
import { faqItems } from "./FAQ";

export default function FAQPublic() {
  useEffect(() => {
    trackPageView("faq_public");
  }, []);

  return (
    <MarketingLayout>
      <SEO
        title="Help & FAQ - Nadir"
        description="Answers to common questions about Nadir's intelligent LLM routing, BYOK vs hosted mode, savings, pricing, and data security."
        path="/faq"
      />

      <section className="pt-20 pb-12 md:pt-28 md:pb-16">
        <div className="max-w-[880px] mx-auto px-6 sm:px-8 text-center">
          <p className="text-[12px] text-[#028a3e] uppercase tracking-[0.12em] font-semibold mb-4">
            Help &amp; FAQ
          </p>
          <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.034em] m-0 mb-5 text-[#1d1d1f] leading-[1.05]">
            Questions, answered.
          </h1>
          <p className="text-lg md:text-[21px] text-[#424245] m-0 leading-[1.4] tracking-[-0.01em] max-w-[640px] mx-auto">
            How Nadir routes your prompts, what it costs, and how your data is
            handled.
          </p>
        </div>
      </section>

      <section className="pb-24">
        <div className="max-w-[880px] mx-auto px-6 sm:px-8">
          <div className="flex flex-col">
            {faqItems.map((item) => (
              <details
                key={item.id}
                className="group border-b border-black/[0.08] py-6"
                onToggle={(e) => {
                  if ((e.currentTarget as HTMLDetailsElement).open) {
                    trackFaqOpen(item.question, "faq_page");
                  }
                }}
              >
                <summary className="flex justify-between items-center gap-6 text-[17px] md:text-[19px] font-medium text-[#1d1d1f] cursor-pointer list-none tracking-[-0.015em]">
                  <span>{item.question}</span>
                  <span className="shrink-0 text-[20px] text-[#86868b] font-light transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="text-[15px] md:text-[16px] text-[#424245] leading-[1.6] mt-4 max-w-[760px] tracking-[-0.005em] space-y-2 [&_strong]:text-[#1d1d1f] [&_strong]:font-semibold [&_em]:text-[#1d1d1f] [&_a]:text-[#028a3e] [&_a]:underline-offset-2 hover:[&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_code]:text-[13px] [&_code]:bg-black/[0.05] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-14 text-center">
            <p className="text-[14px] text-[#6e6e73] tracking-[-0.005em]">
              Still have a question?{" "}
              <Link
                to="/contact"
                className="text-[#028a3e] font-medium underline-offset-2 hover:underline"
              >
                Talk to us
              </Link>
              {". We read every email."}
            </p>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
