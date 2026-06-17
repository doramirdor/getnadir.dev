import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { HeroSection } from "@/components/homepage/HeroSection";
import { StatBand } from "@/components/homepage/StatBand";
import { BenchmarkSection } from "@/components/homepage/BenchmarkSection";
import { CalculatorTeaser } from "@/components/homepage/CalculatorTeaser";
import { HowItWorks } from "@/components/homepage/HowItWorks";
import { CodeSwitchSection } from "@/components/homepage/CodeSwitchSection";
import { FeaturesGrid } from "@/components/homepage/FeaturesGrid";
import { ComparisonTable } from "@/components/homepage/ComparisonTable";
import { PricingSection } from "@/components/homepage/PricingSection";
import { FAQSection } from "@/components/homepage/FAQSection";
import { BottomCta } from "@/components/homepage/BottomCta";
import { Reveal } from "@/components/marketing/Reveal";
import { trackPageView } from "@/utils/analytics";

const Homepage = () => {
  useEffect(() => {
    trackPageView("homepage");
  }, []);
  return (
    <MarketingLayout>
      <SEO
        title="Nadir: Stop paying Opus prices for Haiku problems"
        description="Nadir routes every prompt to the cheapest model that can handle it. OpenAI compatible. Open source. Cut your Claude, GPT, and Gemini spend with a two-line change."
        path="/"
      />
      <HeroSection />
      <StatBand />
      {/* Benchmark evidence lands right after the headline numbers, before
          any product narrative. The verifier-gated cascade thesis needs the
          eval table to back it up while it is still in the visitor's head. */}
      <Reveal><BenchmarkSection /></Reveal>
      {/* Calculator teaser lives high in the scroll so the dollar-amount aha
          moment happens before we ask the visitor to do anything. */}
      <Reveal><CalculatorTeaser /></Reveal>
      <Reveal><HowItWorks /></Reveal>
      <Reveal><CodeSwitchSection /></Reveal>
      <FeaturesGrid />
      <Reveal><ComparisonTable /></Reveal>
      <Reveal><PricingSection /></Reveal>
      <Reveal><FAQSection /></Reveal>
      <Reveal><BottomCta /></Reveal>
    </MarketingLayout>
  );
};

export default Homepage;
