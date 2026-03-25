import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const StickyCtaBar = () => {
  const navigate = useNavigate();

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="font-semibold text-lg text-foreground">
              Nadir AI
            </div>
            <div className="hidden sm:block text-sm text-muted-foreground">
              Smart LLM Gateway Platform
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard")}
              className="whitespace-nowrap"
            >
              Login
            </Button>
            <Button
              onClick={() => navigate("/dashboard")}
              size="sm"
              className="whitespace-nowrap"
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
