import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { PrevNextNav } from "@/components/docs/PrevNextNav";
import { docsContentMap } from "@/data/docsContent";
import { validSlugs } from "@/data/docsNavigation";
import { trackDocsView } from "@/utils/analytics";

const DEFAULT_SECTION = "quickstart";

export default function Docs() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();

  const activeSection =
    section && validSlugs.has(section) ? section : DEFAULT_SECTION;

  // Redirect invalid slugs to quickstart
  useEffect(() => {
    if (section && !validSlugs.has(section)) {
      navigate(`/docs/${DEFAULT_SECTION}`, { replace: true });
    }
  }, [section, navigate]);

  // Scroll to top on section change & track
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    trackDocsView(activeSection);
  }, [activeSection]);

  const ContentComponent = docsContentMap[activeSection];

  return (
    <MarketingLayout>
      <SEO
        title="Documentation - Nadir | Setup, Config & API Reference"
        description="Get started with Nadir in 2 commands. Full docs for routing, context optimization, and CLI."
        path="/docs"
      />
      <div className="container mx-auto px-6 pt-8 pb-16 max-w-7xl">
        <Button
          variant="ghost"
          className="mb-6 hover:bg-muted"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <div className="flex gap-10">
          <DocsSidebar activeSection={activeSection} />

          <main className="flex-1 min-w-0">
            {ContentComponent ? <ContentComponent /> : null}
            <PrevNextNav currentSlug={activeSection} />
          </main>
        </div>
      </div>
    </MarketingLayout>
  );
}
