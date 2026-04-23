import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { HeroSection } from "@/components/homepage/HeroSection";
import { StatBand } from "@/components/homepage/StatBand";
import { CalculatorTeaser } from "@/components/homepage/CalculatorTeaser";
import { HowItWorks } from "@/components/homepage/HowItWorks";
import { FeaturesGrid } from "@/components/homepage/FeaturesGrid";
import { ComparisonTable } from "@/components/homepage/ComparisonTable";
import { PricingSection } from "@/components/homepage/PricingSection";
import { FAQSection } from "@/components/homepage/FAQSection";
import { BottomCta } from "@/components/homepage/BottomCta";
import { trackPageView } from "@/utils/analytics";

const Homepage = () => {
  useEffect(() => {
    trackPageView("homepage");
  }, []);
  return (
    <MarketingLayout>
      <SEO
        title="Nadir: Cut your LLM bill up to 40%"
        description="Nadir routes every prompt to the cheapest model that can handle it. OpenAI compatible. Open source. Cut your Claude, GPT, and Gemini spend with a two-line change."
        path="/"
      />
      <HeroSection />
      <StatBand />
      {/* Calculator teaser lives high in the scroll so the dollar-amount aha
          moment happens before we ask the visitor to do anything. Replaces
          the previous "you have to navigate to /calculator to see it" gap. */}
      <CalculatorTeaser />
      <HowItWorks />
      <FeaturesGrid />
      <ComparisonTable />
      <PricingSection />
      <FAQSection />
      <BottomCta />
    </MarketingLayout>
  );
};

export default Homepage;
