import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { trackAuthSuccess } from "@/utils/analytics";

/**
 * Handles the OAuth callback from Supabase.
 * Supabase redirects here with tokens in the URL hash (#access_token=...).
 * The Supabase client automatically picks them up via onAuthStateChange,
 * then we redirect to the dashboard.
 *
 * This is the ONLY place OAuth signins land. Any analytics for OAuth
 * success (identify + auth_success capture) has to happen here —
 * `handleSignIn` in Auth.tsx only covers the email/password path.
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
        // `app_metadata.provider` is set by Supabase to the OAuth provider
        // name ("google" | "github"). For email signins the caller in
        // Auth.tsx already fires trackAuthSuccess("email", ...); this path
        // only runs for OAuth so passing the provider is the right label.
        const provider = session.user.app_metadata?.provider ?? "oauth";
        trackAuthSuccess(provider, session.user.id);
        navigate("/dashboard", { replace: true });
      } else {
        // If no session yet, the onAuthStateChange listener in AuthProvider
        // will handle it. Give it a moment then redirect. (Analytics on
        // this branch would double-count when the listener fires, so we
        // skip it here and rely on the next mount.)
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
