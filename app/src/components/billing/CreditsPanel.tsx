import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Wallet, Loader2, ExternalLink, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { formatUSD } from "@/utils/format";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TOPUP_INCREMENT_USD = 5;
const PRESET_AMOUNTS = [5, 10, 25, 50];

type CreditsRow = {
  balance: number;
  auto_charge_enabled: boolean;
  auto_charge_threshold: number;
  auto_charge_amount: number;
  upper_limit: number | null;
};

type LedgerRow = {
  id: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
};

function isValidTopup(amount: number): boolean {
  return amount > 0 && amount % TOPUP_INCREMENT_USD === 0;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You're signed out. Please sign in and try again.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function fetchCredits(): Promise<CreditsRow | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_credits")
    .select("balance, auto_charge_enabled, auto_charge_threshold, auto_charge_amount, upper_limit")
    .eq("user_id", user.id)
    .maybeSingle();
  return (
    data ?? {
      balance: 0,
      auto_charge_enabled: false,
      auto_charge_threshold: 5,
      auto_charge_amount: 20,
      upper_limit: null,
    }
  );
}

async function fetchLedger(): Promise<LedgerRow[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("credit_transactions")
    .select("id, transaction_type, amount, balance_after, description, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []) as LedgerRow[];
}

export function CreditsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busyAmount, setBusyAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [savingAuto, setSavingAuto] = useState(false);

  const { data: credits } = useQuery({
    queryKey: ["billing", "credits"],
    queryFn: fetchCredits,
    retry: 1,
    staleTime: 30_000,
  });

  const { data: ledger } = useQuery({
    queryKey: ["billing", "credits", "ledger"],
    queryFn: fetchLedger,
    retry: 1,
    staleTime: 30_000,
  });

  const balance = credits?.balance ?? 0;
  const autoEnabled = credits?.auto_charge_enabled ?? false;

  const handleTopUp = async (amount: number) => {
    if (!isValidTopup(amount)) {
      toast({
        title: "Invalid amount",
        description: `Top-ups must be a positive multiple of $${TOPUP_INCREMENT_USD}.`,
        variant: "destructive",
      });
      return;
    }
    setBusyAmount(amount);
    try {
      const res = await fetch(`${API_BASE}/v1/billing/credits/checkout`, {
        method: "POST",
        headers: await authHeader(),
        body: JSON.stringify({
          amount_usd: amount,
          success_url: `${window.location.origin}/dashboard/billing?status=topup_success`,
          cancel_url: `${window.location.origin}/dashboard/billing?status=topup_cancelled`,
        }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          if (err.detail) detail = err.detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      const data = (await res.json()) as { checkout_url: string };
      window.location.href = data.checkout_url;
    } catch (error: any) {
      logger.error("Credit top-up failed:", error);
      toast({
        title: "Top-up failed",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyAmount(null);
    }
  };

  const handleToggleAutoRecharge = async () => {
    setSavingAuto(true);
    try {
      const next = !autoEnabled;
      const res = await fetch(`${API_BASE}/v1/billing/credits/auto-recharge`, {
        method: "POST",
        headers: await authHeader(),
        body: JSON.stringify({
          enabled: next,
          threshold_usd: credits?.auto_charge_threshold ?? 5,
          amount_usd: credits?.auto_charge_amount ?? 20,
          upper_limit_usd: credits?.upper_limit ?? null,
        }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          if (err.detail) detail = err.detail;
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      await queryClient.invalidateQueries({ queryKey: ["billing", "credits"] });
      toast({
        title: next ? "Auto-recharge on" : "Auto-recharge off",
        description: next
          ? `We'll top up $${credits?.auto_charge_amount ?? 20} when your balance drops below $${credits?.auto_charge_threshold ?? 5}.`
          : "Your balance won't be topped up automatically.",
      });
    } catch (error: any) {
      logger.error("Auto-recharge update failed:", error);
      toast({
        title: "Couldn't update auto-recharge",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingAuto(false);
    }
  };

  const customValue = Number(customAmount);
  const customValid = isValidTopup(customValue);

  return (
    <Card className="clean-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[hsl(var(--brand-blue-strong))]" strokeWidth={1.75} />
            <CardTitle className="text-foreground">Nadir credits</CardTitle>
          </div>
          <Badge variant={balance > 0 ? "default" : "secondary"} className="mono">
            ${formatUSD(balance)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Prepaid balance for hosted (Nadir-managed keys) usage. Each request draws down at
          provider cost + 20%. Top up in ${TOPUP_INCREMENT_USD} increments. Using your own keys
          (BYOK)? You don't need credits.
        </p>

        {/* Top-up buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {PRESET_AMOUNTS.map((amt) => (
            <Button
              key={amt}
              variant="outline"
              size="sm"
              disabled={busyAmount !== null}
              onClick={() => handleTopUp(amt)}
            >
              {busyAmount === amt ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              )}
              ${amt}
            </Button>
          ))}
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={TOPUP_INCREMENT_USD}
              step={TOPUP_INCREMENT_USD}
              placeholder="Custom"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="h-9 w-24 text-sm"
            />
            <Button
              size="sm"
              disabled={busyAmount !== null || !customValid}
              onClick={() => handleTopUp(customValue)}
            >
              {busyAmount === customValue ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : null}
              Top up
            </Button>
          </div>
        </div>
        {customAmount !== "" && !customValid && (
          <p className="text-xs text-destructive mb-4">
            Amount must be a positive multiple of ${TOPUP_INCREMENT_USD}.
          </p>
        )}

        {/* Auto-recharge */}
        <div className="flex items-center justify-between rounded-lg border border-border p-3 mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Auto-recharge</p>
              <p className="text-xs text-muted-foreground">
                {autoEnabled
                  ? `On — top up $${credits?.auto_charge_amount ?? 20} when below $${credits?.auto_charge_threshold ?? 5}`
                  : "Off — top up manually"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" disabled={savingAuto} onClick={handleToggleAutoRecharge}>
            {savingAuto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : autoEnabled ? "Turn off" : "Turn on"}
          </Button>
        </div>

        {/* Ledger */}
        {ledger && ledger.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Recent transactions</p>
            <div className="divide-y divide-border rounded-lg border border-border">
              {ledger.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="text-foreground">
                      {tx.description || (tx.transaction_type === "credit" ? "Top-up" : "Usage")}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span
                    className={`mono ${tx.transaction_type === "credit" ? "text-[hsl(var(--ok))]" : "text-foreground"}`}
                  >
                    {tx.transaction_type === "credit" ? "+" : "−"}${formatUSD(Math.abs(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CreditsPanel;
