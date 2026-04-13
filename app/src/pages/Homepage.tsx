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
import { Link } from "react-router-dom";
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
      {/* 5. Pricing + Sign Up */}
      <PricingSection />
      <section className="py-8 md:py-14 text-center">
        <div className="max-w-[560px] mx-auto px-4 sm:px-8">
          <h3 className="text-2xl font-bold mb-2">Ready to start saving?</h3>
          <p className="text-[#666] mb-6">Sign up for the hosted Pro plan and cut your LLM costs today.</p>
          <Link
            to="/auth?mode=signup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a0a0a] text-white rounded-lg text-[15px] font-semibold hover:bg-[#333] transition-all no-underline"
          >
            Sign Up
          </Link>
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
