import MarketingLayout from "@/components/marketing/MarketingLayout";
import { HeroSection } from "@/components/homepage/HeroSection";
import { FeaturesGrid } from "@/components/homepage/FeaturesGrid";
import { BenefitsSection } from "@/components/homepage/BenefitsSection";
import { OnboardingSteps } from "@/components/homepage/OnboardingSteps";
import { FAQSection } from "@/components/homepage/FAQSection";
import { BlogTeaser } from "@/components/homepage/BlogTeaser";
import { ContactFooter } from "@/components/homepage/ContactFooter";

const Homepage = () => {
  return (
    <MarketingLayout>
      <HeroSection />
      <FeaturesGrid />
      <BenefitsSection />
      <OnboardingSteps />
      <FAQSection />
      <BlogTeaser />
      <ContactFooter />
    </MarketingLayout>
  );
};

export default Homepage;
