import { useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { HeroAnnotated } from "@/components/homepage/HeroAnnotated";
import { trackPageView } from "@/utils/analytics";

// Throwaway A/B surface for the annotated-hero experiment. Lets us compare the
// script.it-style treatment against the live `/` hero without touching the
// shipped homepage. Delete with the experiment branch.
const HeroAnnotatedPreview = () => {
  useEffect(() => {
    trackPageView("hero_annotated_preview");
  }, []);
  return (
    <MarketingLayout>
      <HeroAnnotated />
    </MarketingLayout>
  );
};

export default HeroAnnotatedPreview;
