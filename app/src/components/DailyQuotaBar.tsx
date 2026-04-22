import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Zap } from "lucide-react";

const MONTHLY_FREE_LIMIT = 50;

const startOfMonthUtcIso = () => {
  const now = new Date();
  const utcMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  return utcMonthStart.toISOString();
};

export const DailyQuotaBar = () => {
  const [used, setUsed] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);

      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();

      const paid = sub?.status === "active" || sub?.status === "trialing";
      if (cancelled) return;
      setIsPaid(paid);
      if (paid) return;

      const { count } = await supabase
        .from("usage_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startOfMonthUtcIso());
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
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  if (!userId || isPaid === null || isPaid) return null;
  if (used === null) return null;

  const overLimit = used >= MONTHLY_FREE_LIMIT;
  const pct = Math.min(100, (used / MONTHLY_FREE_LIMIT) * 100);

  const barColor = overLimit
    ? "bg-amber-500"
    : used >= MONTHLY_FREE_LIMIT - 10
    ? "bg-amber-400"
    : "bg-emerald-500";

  return (
    <Card className="clean-card">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Free trial usage this month
            </span>
          </div>
          <span className="text-sm mono text-muted-foreground">
            {Math.min(used, MONTHLY_FREE_LIMIT)} / {MONTHLY_FREE_LIMIT}
            {overLimit && (
              <span className="ml-2 text-foreground">
                +{used - MONTHLY_FREE_LIMIT} billed
              </span>
            )}
          </span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {overLimit
            ? "Monthly free cap reached. Additional requests are billed per savings (25% of net). Cancel anytime."
            : `${MONTHLY_FREE_LIMIT - used} free requests left this month. After that, pay-per-savings kicks in.`}
        </p>
      </CardContent>
    </Card>
  );
};
