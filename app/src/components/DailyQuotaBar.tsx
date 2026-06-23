import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Zap, CreditCard } from "lucide-react";

// Keep in sync with the backend gates:
//   hosted  -> requires a prepaid balance (no free tier). See
//              hosted_budget.enforce_hosted_budget_or_402.
//   byok    -> subscription_guard.FREE_BYOK_MONTHLY_REQUESTS
const FREE_BYOK_REQUESTS = 50;

type Mode = "hosted" | "byok";

const startOfMonthUtcIso = () => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();
};

export const DailyQuotaBar = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("hosted");
  const [used, setUsed] = useState<number | null>(null);
  // null = still resolving; true = user is past the gate (paying / has balance)
  // so the bar should not render at all.
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);

      const [{ data: sub }, { data: profile }, { data: credits }] = await Promise.all([
        supabase
          .from("user_subscriptions")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("model_parameters")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("user_credits")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const mp = (profile?.model_parameters as Record<string, unknown>) || {};
      const m: Mode = (mp.key_mode as string) === "byok" ? "byok" : "hosted";
      setMode(m);

      const billingActive = sub?.status === "active" || sub?.status === "trialing";
      const balance = Number(credits?.balance ?? 0);

      // Past the gate -> hide the bar entirely:
      //  - BYOK with a payment method on file -> unlimited, billed on savings
      //  - Hosted with a positive prepaid balance -> drawing down credits
      if ((m === "byok" && billingActive) || (m === "hosted" && balance > 0)) {
        setHidden(true);
        return;
      }
      setHidden(false);

      // Hosted with no balance has no free allowance, so there's no usage to
      // count: we just prompt for a top-up. Only BYOK has a free monthly trial.
      if (m === "byok") {
        const monthStart = startOfMonthUtcIso();
        const { count } = await supabase
          .from("usage_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", monthStart);
        if (cancelled) return;
        setUsed(count ?? 0);

        channel = supabase
          .channel(`monthly_quota_${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "usage_logs",
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              if (!cancelled) setUsed((prev) => (prev ?? 0) + 1);
            }
          )
          .subscribe();
      }
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  if (!userId || hidden === null || hidden) return null;

  // ── Hosted, no prepaid balance: there is no free tier, so prompt a top-up.
  if (mode === "hosted") {
    return (
      <Card className="clean-card">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Hosted keys need credits
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Hosted routing runs on Nadir-managed models and needs a prepaid
            balance. Add credits to make your first call, or bring your own
            provider keys to route for free, billed only on the savings Nadir finds.
          </p>
          <Button asChild size="sm" className="w-full">
            <Link to="/dashboard/billing">Add credits</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── BYOK free trial: a monthly request allowance, then add a payment method.
  if (used === null) return null;

  const limit = FREE_BYOK_REQUESTS;
  const overLimit = used >= limit;
  const reqPct = Math.min(100, (used / limit) * 100);
  const nearThreshold = Math.max(1, Math.floor(limit * 0.1));
  const barColor = overLimit
    ? "bg-amber-500"
    : used >= limit - nearThreshold
    ? "bg-amber-400"
    : "bg-emerald-500";

  const overCopy =
    "Free trial used up. Add a payment method to keep routing with your own keys, you're only billed on the savings Nadir finds, never a base fee.";
  const remainingCopy = `${limit - used} of ${limit} free requests left this month.`;

  return (
    <Card className="clean-card">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Free trial, bring your own key
            </span>
          </div>
          <span className="text-sm mono text-muted-foreground">
            {Math.min(used, limit)} / {limit} requests
          </span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full transition-all ${barColor}`}
            style={{ width: `${reqPct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {overLimit ? overCopy : remainingCopy}
        </p>
      </CardContent>
    </Card>
  );
};
