import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { HeroSection } from "@/components/homepage/HeroSection";
import { FeaturesGrid } from "@/components/homepage/FeaturesGrid";
import { ClassifierDemo } from "@/components/homepage/ClassifierDemo";
import { ComparisonTable } from "@/components/homepage/ComparisonTable";
import { BenefitsSection } from "@/components/homepage/BenefitsSection";
import { BenchmarkResults } from "@/components/homepage/BenchmarkResults";
import { OnboardingSteps } from "@/components/homepage/OnboardingSteps";
import { PricingSection } from "@/components/homepage/PricingSection";
import { WaitlistForm } from "@/components/WaitlistForm";
import { FAQSection } from "@/components/homepage/FAQSection";
import { BlogTeaser } from "@/components/homepage/BlogTeaser";
import { ContactFooter } from "@/components/homepage/ContactFooter";
import { trackPageView } from "@/utils/analytics";

const Homepage = () => {
  useEffect(() => { trackPageView("homepage"); }, []);
  return (
    <MarketingLayout>
      <SEO
        title="Nadir - Cut LLM API Costs 30-60% | Open-Source LLM Router"
        description="Open-source LLM router that routes simple prompts to cheaper models automatically. Save 30-60% on Claude, GPT, and Gemini API costs without changing code."
        path="/"
      />
      {/* 1. Hero */}
      <HeroSection />
      {/* 2. How it works */}
      <FeaturesGrid />
      {/* 3. One line changes everything */}
      <OnboardingSteps />
      {/* 4. How we compare */}
      <ComparisonTable />
      {/* 5. Pricing + Waitlist */}
      <PricingSection />
      <section className="py-8 md:py-14">
        <div className="max-w-[560px] mx-auto px-4 sm:px-8">
          <WaitlistForm variant="card" source="homepage" />
        </div>
      </section>
      {/* 6. The rest */}
      <BenchmarkResults />
      <ClassifierDemo />
      <BenefitsSection />
      <FAQSection />
      <BlogTeaser />
      <ContactFooter />
    </MarketingLayout>
  );
};

export default Homepage;
