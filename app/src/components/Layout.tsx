import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/hooks/useAuth";
import Auth from "@/pages/Auth";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const AUTH_TIMEOUT_MS = 15_000;

const Layout = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!loading) {
      setAuthTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setAuthTimedOut(true), AUTH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  // Redirect new users (no API keys) to onboarding
  useEffect(() => {
    if (!user) return;
    if (location.pathname === "/dashboard/onboarding") return;

    const checkOnboarding = async () => {
      const { count } = await supabase
        .from("api_keys")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (count === 0) {
        navigate("/dashboard/onboarding");
      }
    };
    checkOnboarding();
  }, [user]);

  if (loading) {
    if (authTimedOut) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
          <p className="text-sm text-muted-foreground">
            Authentication is taking longer than expected.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-semibold text-xs">N</span>
          </div>
          <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
            <div className="h-full w-1/2 bg-primary rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === '/dashboard' || path === '/dashboard/') return 'dashboard';
    const segments = path.replace('/dashboard/', '').split('/');
    return segments[0] || 'dashboard';
  };

  return (
    <div className="min-h-screen bg-background flex w-full">
      <Sidebar activeItem={getCurrentPage()} />
      <main className={cn("flex-1 min-w-0", isMobile && "pt-14")}>
        <div className="h-full max-w-6xl mx-auto px-4 md:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
