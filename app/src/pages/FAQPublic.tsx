import { useEffect } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, ArrowRight } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { trackPageView } from "@/utils/analytics";
import { faqItems, FaqAccordion } from "./FAQ";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.question,
    },
  })),
};

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
        jsonLd={faqJsonLd}
      />
      <div className="container mx-auto px-6 py-12 max-w-3xl">
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-2">
            <HelpCircle className="w-6 h-6 text-primary" />
            <h1 className="text-4xl font-semibold text-foreground">Help &amp; FAQ</h1>
          </div>
          <p className="text-muted-foreground">
            Common questions about using the Nadir routing platform.
          </p>
        </div>

        <FaqAccordion />

        <div className="pt-6 mt-6 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Still have questions?{" "}
            <Link
              to="/contact"
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              Contact support
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </p>
        </div>
      </div>
    </MarketingLayout>
  );
}
