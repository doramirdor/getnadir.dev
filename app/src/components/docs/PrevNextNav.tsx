import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPrevNext } from "@/data/docsNavigation";

export const PrevNextNav = ({ currentSlug }: { currentSlug: string }) => {
  const navigate = useNavigate();
  const { prev, next } = getPrevNext(currentSlug);

  if (!prev && !next) return null;

  return (
    <div className="flex items-center justify-between pt-8 mt-12 border-t border-border">
      {prev ? (
        <button
          onClick={() => navigate(`/docs/${prev.slug}`)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          <div className="text-left">
            <div className="text-xs text-muted-foreground">Previous</div>
            <div className="font-medium text-foreground">{prev.label}</div>
          </div>
        </button>
      ) : (
        <div />
      )}
      {next ? (
        <button
          onClick={() => navigate(`/docs/${next.slug}`)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group text-right"
        >
          <div>
            <div className="text-xs text-muted-foreground">Next</div>
            <div className="font-medium text-foreground">{next.label}</div>
          </div>
          <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      ) : (
        <div />
      )}
    </div>
  );
};
