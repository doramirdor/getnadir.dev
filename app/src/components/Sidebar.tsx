
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
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";

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
  { id: "settings", label: "Settings", icon: Settings, path: "/dashboard/settings" },
];

interface SidebarProps {
  activeItem?: string;
}

export const Sidebar = ({ activeItem = "dashboard" }: SidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();

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
                onClick={() => navigate(item.path)}
                className={cn(
                  "w-full flex items-center rounded-lg transition-all duration-150 text-left",
                  isCollapsed ? "px-3 py-2.5 justify-center" : "px-3 py-2",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon
                  className={cn(
                    "w-[18px] h-[18px] flex-shrink-0",
                    !isCollapsed && "mr-3"
                  )}
                  strokeWidth={isActive ? 2 : 1.5}
                />
                {!isCollapsed && (
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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {renderMenuSection(mainMenuItems)}
        {renderMenuSection(manageMenuItems, "Manage")}
        {renderMenuSection(accountMenuItems, "Account")}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
        <ThemeToggle collapsed={isCollapsed} />
        <button
          onClick={handleSignOut}
          className={cn(
            "w-full flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
            isCollapsed && "justify-center"
          )}
        >
          <LogOut className={cn("w-[18px] h-[18px] flex-shrink-0", !isCollapsed && "mr-3")} strokeWidth={1.5} />
          {!isCollapsed && <span className="text-[13px]">Sign out</span>}
        </button>
      </div>
    </div>
  );
};
