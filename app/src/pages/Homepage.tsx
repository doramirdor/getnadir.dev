import MarketingLayout from "@/components/marketing/MarketingLayout";
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
