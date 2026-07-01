import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Gift, X, Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Persistent, dismissible "keep saving for $5" nudge shown across the dashboard
// for users who are NOT billing-active. It reads the user's real savings this
// month (savings_tracking) to personalize the ask, and fires the same
// $5 (→$7) credit-top-up checkout used by onboarding / the Billing page.
//
// Scoped to `.nadir-brand` so it wears the blueprint look — a warm-paper offer
// card that stands out against the (still shadcn) dashboard as a deliberate promo.

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const DISMISS_KEY = "nadir_billing_nudge_dismissed";

export function BillingNudge() {
  const [state, setState] = useState<"loading" | "hidden" | "show">("loading");
  const [savings, setSavings] = useState(0);
  const [subscribing, setSubscribing] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setState("hidden"); return; }

      // Billing-active? (synthetic marker or real sub both land as status=active)
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (sub?.status === "active") { if (!cancelled) setState("hidden"); return; }

      // Savings so far this month, to personalize the ask.
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const { data: rows } = await supabase
        .from("savings_tracking")
        .select("savings_usd")
        .eq("user_id", user.id)
        .gte("created_at", monthStart.toISOString());
      if (cancelled) return;
      const total = (rows || []).reduce((s, r: any) => s + (Number(r.savings_usd) || 0), 0);
      setSavings(total);
      setState("show");
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAdd = async () => {
    setSubscribing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const res = await fetch(`${API_BASE}/v1/billing/credits/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount_usd: 5,
          success_url: `${window.location.origin}/dashboard/billing?status=topup_success`,
          cancel_url: window.location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Checkout failed");
      window.location.href = data.checkout_url;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
      setSubscribing(false);
    }
  };

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  if (state !== "show" || dismissed) return null;

  const hasSavings = savings > 0.005;

  return (
    <div className="nadir-brand mb-6">
      <div className="relative overflow-hidden rounded-[3px] border-[1.5px] border-[var(--ink)] bg-[var(--paper)] px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--terracotta)]/[0.12]">
              <Gift className="h-4 w-4 text-[var(--terracotta)]" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-editorial text-[17px] leading-tight text-[var(--ink)]">
                  {hasSavings ? (
                    <>You've saved <span className="text-[var(--terracotta)]">${savings.toFixed(2)}</span> this month. Keep it going.</>
                  ) : (
                    <>Add <span className="text-[var(--terracotta)]">$5</span>, get <span className="text-[var(--terracotta)]">$7</span> of credit.</>
                  )}
                </p>
                <span className="rounded-[2px] bg-[var(--strawberry)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--shell)]">
                  first-time +$2
                </span>
              </div>
              <p className="mt-0.5 text-[12.5px] text-[var(--ink)]/60">
                Your first $5 becomes $7. No monthly fee, you only pay on what we save you.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleAdd}
              disabled={subscribing}
              className="press inline-flex items-center justify-center gap-2 rounded-[2px] bg-[var(--ink)] px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[var(--shell)] transition-colors hover:bg-[var(--ink-soft)] disabled:pointer-events-none disabled:opacity-60"
            >
              {subscribing ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Redirecting</>
              ) : (
                <>Add $5, get $7 <ArrowRight className="h-3.5 w-3.5" /></>
              )}
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="grid h-8 w-8 place-items-center rounded-full text-[var(--ink)]/40 transition-colors hover:bg-[var(--ink)]/5 hover:text-[var(--ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BillingNudge;
