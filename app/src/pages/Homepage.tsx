import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { HeroSection } from "@/components/homepage/HeroSection";
import { FeaturesGrid } from "@/components/homepage/FeaturesGrid";
import { ClassifierDemo } from "@/components/homepage/ClassifierDemo";
import { ComparisonTable } from "@/components/homepage/ComparisonTable";
import { BenefitsSection } from "@/components/homepage/BenefitsSection";
import { BenchmarkResults } from "@/components/homepage/BenchmarkResults";
import { OnboardingSteps } from "@/components/homepage/OnboardingSteps";
import { FAQSection } from "@/components/homepage/FAQSection";
import { BlogTeaser } from "@/components/homepage/BlogTeaser";
import { ContactFooter } from "@/components/homepage/ContactFooter";

const Homepage = () => {
  return (
    <MarketingLayout>
      <SEO
        title="Nadir — Cut LLM API Costs Up to 30% | Open-Source LLM Router"
        description="Open-source LLM router that routes simple prompts to cheaper models automatically. Save up to 30% on Claude, GPT, and Gemini API costs without changing code."
        path="/"
      />
      <HeroSection />
      <FeaturesGrid />
      <ClassifierDemo />
      <ComparisonTable />
      <BenefitsSection />
      <BenchmarkResults />
      <OnboardingSteps />
      <FAQSection />
      <BlogTeaser />
      <ContactFooter />
    </MarketingLayout>
  );
};

export default Homepage;
