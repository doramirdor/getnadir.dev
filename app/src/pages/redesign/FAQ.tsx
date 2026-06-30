/**
 * Nadir blueprint redesign — FAQ (/faq). Reuses faqItems from the shared FAQ.
 */
import { Link } from "react-router-dom";
import { RedesignLayout, PageHero, Section } from "@/components/brand/redesign";
import { SeedCluster } from "@/components/brand/motifs";
import { faqItems } from "@/pages/FAQ";

export default function FAQ() {
  return (
    <RedesignLayout
      title="Nadir · Questions, answered"
      description="How Nadir routes your prompts, what it costs, and how your data is handled."
      path="/faq"
      track="brand_redesign_faq"
    >
      <PageHero
        eyebrow="Help & FAQ"
        title="Questions,"
        accent="answered."
        sub={<>How Nadir routes your prompts, what it costs, and how your data is handled.</>}
        hand="ask us anything"
        motif={<SeedCluster className="h-20 w-28 opacity-80" color="var(--ink)" />}
      />

      <Section rule={false}>
        <div className="mx-auto max-w-[820px]">
          <div className="flex flex-col">
            {faqItems.map((item) => (
              <details key={item.id} className="group border-b border-[var(--line)] py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-editorial text-[19px] leading-snug text-[var(--ink)]">
                  <span>{item.question}</span>
                  <span className="shrink-0 font-mono text-[20px] text-[var(--strawberry)] transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <div className="brand-prose mt-3 max-w-[720px] space-y-2 text-[15px] leading-relaxed text-[var(--ink)]/75 [&_a]:text-[var(--terracotta)] [&_code]:bg-[var(--shell-deep)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_strong]:text-[var(--ink)] [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
          <p className="mt-12 text-center text-[14px] text-[var(--ink)]/60">
            Still have a question? <Link to="/contact" className="font-medium text-[var(--terracotta)] underline-offset-2 hover:underline">Talk to us</Link>. We read every email.
          </p>
        </div>
      </Section>
    </RedesignLayout>
  );
}
