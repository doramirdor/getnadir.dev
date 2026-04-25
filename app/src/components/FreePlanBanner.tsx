import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ArrowRight, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { trackCheckoutStart, trackCtaClick } from "@/utils/analytics";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const FreePlanBanner = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  // In-memory only — dismissal lasts until the next refresh, not across sessions.
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: subscription } = useQuery({
    queryKey: ["subscription", "supabase", "banner"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    retry: 1,
    staleTime: 60_000,
  });

  const isActive = subscription?.status === "active";

  if (isActive || dismissed) return null;

  const handleClaim = async () => {
    trackCtaClick("claim_free_month", "global_banner");
    setSubmitting(true);
    try {
      // Backend /v1/billing/checkout authenticates with the Supabase JWT,
      // not an API key. This works on a freshly-signed-in account that
      // hasn't created a key yet.
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData.session) {
        throw new Error("Please sign in to claim your free month.");
      }
      const accessToken = sessionData.session.access_token;

      const res = await fetch(`${API_BASE}/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          plan_id: "pro",
          promo_code: "FIRST1",
          success_url: `${window.location.origin}/dashboard/billing?status=success`,
          cancel_url: `${window.location.origin}/dashboard/billing?status=cancelled`,
        }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody.detail) detail = errBody.detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const data = (await res.json()) as { checkout_url: string };
      trackCheckoutStart("pro", "global_banner");
      window.location.href = data.checkout_url;
    } catch (error: any) {
      logger.error("Banner checkout failed:", error);
      toast({
        title: "Couldn't start checkout",
        description: error?.message || "Sending you to billing instead.",
        variant: "destructive",
      });
      // Fall back to the billing page with the promo prefilled so the user
      // can complete checkout manually.
      navigate("/dashboard/billing?promo=FIRST1");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="sticky top-0 z-50 w-full border-b"
      style={{
        background: "hsl(var(--brand-blue-soft))",
        borderColor: "hsl(var(--brand-blue) / 0.3)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles className="w-4 h-4 text-[hsl(var(--brand-blue-strong))] shrink-0" />
          <p className="text-sm text-[hsl(var(--brand-blue-strong))] truncate">
            <strong>You're on the limited Free plan.</strong>{" "}
            <span className="hidden sm:inline">
              Get your first month of Pro free with code{" "}
              <span className="mono font-semibold">FIRST1</span>, unlimited routing and full optimization.
            </span>
            <span className="sm:hidden">First month free with FIRST1.</span>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            onClick={handleClaim}
            disabled={submitting}
            className="whitespace-nowrap h-8"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <span className="hidden sm:inline">Claim free month</span>
                <span className="sm:hidden">Claim</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </>
            )}
          </Button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="p-1.5 rounded-md text-[hsl(var(--brand-blue-strong))] hover:bg-[hsl(var(--brand-blue)/0.15)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FreePlanBanner;
