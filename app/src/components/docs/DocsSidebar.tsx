import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { docsNavigation } from "@/data/docsNavigation";
import { cn } from "@/lib/utils";

interface DocsSidebarProps {
  activeSection: string;
}

const NavContent = ({
  activeSection,
  onNavigate,
}: {
  activeSection: string;
  onNavigate: (slug: string) => void;
}) => (
  <nav className="space-y-6">
    {docsNavigation.map((group) => (
      <div key={group.title}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-3">
          {group.title}
        </h3>
        <div className="space-y-0.5">
          {group.sections.map((section) => {
            const isActive = section.slug === activeSection;
            const Icon = section.icon;
            return (
              <button
                key={section.slug}
                onClick={() => onNavigate(section.slug)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm w-full text-left transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </nav>
);

/** Desktop: sticky inline sidebar. Mobile: floating button + Sheet. */
export const DocsSidebar = ({ activeSection }: DocsSidebarProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleNavigate = (slug: string) => {
    navigate(`/docs/${slug}`);
    setOpen(false);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8">
          <NavContent activeSection={activeSection} onNavigate={handleNavigate} />
        </div>
      </aside>

      {/* Mobile floating button + Sheet */}
      <div className="lg:hidden fixed bottom-6 right-6 z-40">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="icon" className="rounded-full h-12 w-12 shadow-lg">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto">
            <SheetHeader className="mb-4">
              <SheetTitle>Documentation</SheetTitle>
            </SheetHeader>
            <NavContent
              activeSection={activeSection}
              onNavigate={handleNavigate}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
};
