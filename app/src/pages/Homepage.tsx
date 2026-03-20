import { HeroSection } from "@/components/homepage/HeroSection";
import { OnboardingSteps } from "@/components/homepage/OnboardingSteps";
import { FeaturesGrid } from "@/components/homepage/FeaturesGrid";
import { BenefitsSection } from "@/components/homepage/BenefitsSection";
import { AdvancedRoutingSection } from "@/components/homepage/AdvancedRoutingSection";
import { ClusteringSection } from "@/components/homepage/ClusteringSection";
import { ArchitectureDiagram } from "@/components/homepage/ArchitectureDiagram";
import { BlogTeaser } from "@/components/homepage/BlogTeaser";
import { ContactFooter } from "@/components/homepage/ContactFooter";
import { StickyCtaBar } from "@/components/homepage/StickyCtaBar";

const Homepage = () => {
  return (
    <div className="min-h-screen bg-background">
      <StickyCtaBar />
      <HeroSection />
      <OnboardingSteps />
      <FeaturesGrid />
      <AdvancedRoutingSection />
      <ClusteringSection />
      <BenefitsSection />
      <ArchitectureDiagram />
      <BlogTeaser />
      <ContactFooter />
    </div>
  );
};

export default Homepage;
