import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Handles the OAuth callback from Supabase.
 * Supabase redirects here with tokens in the URL hash (#access_token=...).
 * The Supabase client automatically picks them up via onAuthStateChange,
 * then we redirect to the dashboard.
 */
const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase JS client auto-detects hash fragments and exchanges them
      // for a session. We just need to wait for it to finish.
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Auth callback error:", error.message);
        navigate("/auth");
        return;
      }

      if (session) {
        navigate("/dashboard", { replace: true });
      } else {
        // If no session yet, the onAuthStateChange listener in AuthProvider
        // will handle it. Give it a moment then redirect.
        const timeout = setTimeout(() => {
          navigate("/dashboard", { replace: true });
        }, 1000);
        return () => clearTimeout(timeout);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <span className="text-primary-foreground font-semibold text-xs">N</span>
        </div>
        <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-primary rounded-full animate-pulse" />
        </div>
        <p className="text-sm text-muted-foreground mt-2">Signing you in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
