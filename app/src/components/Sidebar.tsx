
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Activity,
  Settings,
  Key,
  CreditCard,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Zap,
  HelpCircle,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

const mainMenuItems = [
  { id: "dashboard", label: "Dashboard", icon: Activity, path: "/dashboard" },
  { id: "analytics", label: "Analytics", icon: TrendingUp, path: "/dashboard/analytics" },
  { id: "savings", label: "Savings", icon: TrendingDown, path: "/dashboard/savings" },
];

const manageMenuItems = [
  { id: "api-keys", label: "API Keys", icon: Key, path: "/dashboard/api-keys" },
  { id: "integrations", label: "Provider Keys", icon: Zap, path: "/dashboard/integrations" },
];

const accountMenuItems = [
  { id: "logs", label: "Logs", icon: FileText, path: "/dashboard/logs" },
  { id: "billing", label: "Billing", icon: CreditCard, path: "/dashboard/billing" },
  { id: "help", label: "Help", icon: HelpCircle, path: "/dashboard/help" },
  { id: "settings", label: "Settings", icon: Settings, path: "/dashboard/settings" },
];

interface SidebarProps {
  activeItem?: string;
}

export const Sidebar = ({ activeItem = "dashboard" }: SidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const renderMenuSection = (
    items: typeof mainMenuItems,
    label?: string
  ) => (
    <div className="mb-1">
      {label && !isCollapsed && (
        <div className="section-label">{label}</div>
      )}
      {isCollapsed && label && <div className="h-px bg-border mx-3 my-2" />}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

          return (
            <li key={item.id}>
              <button
                onClick={() => handleNavigate(item.path)}
                className={cn(
                  "w-full flex items-center rounded-lg transition-all duration-150 text-left",
                  isCollapsed && !isMobile ? "px-3 py-2.5 justify-center" : "px-3 py-2",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon
                  className={cn(
                    "w-[18px] h-[18px] flex-shrink-0",
                    (!isCollapsed || isMobile) && "mr-3"
                  )}
                  strokeWidth={isActive ? 2 : 1.5}
                />
                {(!isCollapsed || isMobile) && (
                  <span className="text-[13px]">{item.label}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const sidebarContent = (
    <>
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {renderMenuSection(mainMenuItems)}
        {renderMenuSection(manageMenuItems, "Manage")}
        {renderMenuSection(accountMenuItems, "Account")}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
        <ThemeToggle collapsed={isCollapsed && !isMobile} />
        <button
          onClick={handleSignOut}
          className={cn(
            "w-full flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            isCollapsed && !isMobile && "justify-center"
          )}
        >
          <LogOut className={cn("w-[18px] h-[18px] flex-shrink-0", (!isCollapsed || isMobile) && "mr-3")} strokeWidth={1.5} />
          {(!isCollapsed || isMobile) && <span className="text-[13px]">Sign out</span>}
        </button>
      </div>
    </>
  );

  // Mobile: render as a Sheet drawer
  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <div className="fixed top-0 left-0 right-0 z-40 h-14 bg-sidebar border-b border-sidebar-border flex items-center px-4 gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-semibold text-xs">N</span>
            </div>
            <span className="text-sm font-semibold text-foreground">Nadir</span>
          </div>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {/* Sheet header */}
            <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
                  <span className="text-primary-foreground font-semibold text-xs">N</span>
                </div>
                <span className="text-sm font-semibold text-foreground">Nadir</span>
              </div>
            </div>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: render as a fixed sidebar column
  return (
    <div
      className={cn(
        "bg-sidebar border-r border-sidebar-border transition-all duration-200 flex flex-col h-screen sticky top-0",
        isCollapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-sidebar-border">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 pl-1">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-semibold text-xs">N</span>
            </div>
            <span className="text-sm font-semibold text-foreground">Nadir</span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors",
            isCollapsed && "mx-auto"
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {sidebarContent}
    </div>
  );
};
