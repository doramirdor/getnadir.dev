import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CreditCard,
  TrendingDown,
  ExternalLink,
  DollarSign,
  Receipt,
  Info,
  Check,
  Loader2,
  XCircle,
  Tag,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiKey } from "@/hooks/useApiKey";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { trackBillingView } from "@/utils/analytics";
import { useSearchParams } from "react-router-dom";

// ── Fee calculator ───────────────────────────────────────────────────────

function calculateFee(totalSavings: number) {
  const base = 9;
  const first2k = Math.min(totalSavings, 2000) * 0.25;
  const above2k = Math.max(totalSavings - 2000, 0) * 0.10;
  const variable = first2k + above2k;
  return { base, first2k, above2k, variable, total: base + variable };
}

// ── Supabase-direct savings summary (no API key required) ───────────────

async function fetchCurrentMonthSavings(): Promise<{
  total_savings_usd: number;
  total_spent_usd: number;
  requests_routed: number;
} | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const { data } = await supabase
    .from("savings_tracking")
    .select("routed_cost_usd, savings_usd")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString())
    .lt("created_at", monthEnd.toISOString());

  const rows = data ?? [];
  return {
    total_savings_usd: rows.reduce((s, r: any) => s + Number(r.savings_usd || 0), 0),
    total_spent_usd: rows.reduce((s, r: any) => s + Number(r.routed_cost_usd || 0), 0),
    requests_routed: rows.length,
  };
}

async function fetchInvoicesFromSupabase(): Promise<InvoiceItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("savings_invoices")
    .select("id, billing_period_start, billing_period_end, total_savings_usd, base_fee_usd, savings_fee_usd, total_invoice_usd, status, created_at")
    .eq("user_id", user.id)
    .order("billing_period_start", { ascending: false });
  return (data ?? []) as InvoiceItem[];
}

// ── API helper ───────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function billingRequest<T = any>(
  path: string,
  apiKey: string,
  options: { method?: string; body?: Record<string, unknown> } = {}
): Promise<T> {
  const { method = "GET", body } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody.detail) detail = errBody.detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────

interface InvoiceItem {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  total_savings_usd: number;
  base_fee_usd: number;
  savings_fee_usd: number;
  total_invoice_usd: number;
  status: string;
  created_at: string;
}

// ── Component ────────────────────────────────────────────────────────────

const Billing = () => {
  const [searchParams] = useSearchParams();
  const [subscribing, setSubscribing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [promoCode, setPromoCode] = useState(searchParams.get("promo") || "");
  const { toast } = useToast();
  const { apiKey } = useApiKey();
  const queryClient = useQueryClient();

  useEffect(() => { trackBillingView(); }, []);

  // Fetch savings summary directly from Supabase (RLS-scoped to the user)
  // so the Billing page works without an in-memory API key.
  const { data: savingsSummary, isLoading } = useQuery({
    queryKey: ["billing", "savings", "supabase"],
    queryFn: fetchCurrentMonthSavings,
    retry: 1,
    staleTime: 60_000,
  });

  // Fetch subscription status
  const { data: subscription } = useQuery({
    queryKey: ["subscription", "supabase"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    retry: 1,
    staleTime: 60_000,
  });

  // Fetch invoice history from Supabase (RLS-scoped, no API key needed)
  const { data: invoicesData } = useQuery({
    queryKey: ["billing", "invoices", "supabase"],
    queryFn: fetchInvoicesFromSupabase,
    retry: 1,
    staleTime: 60_000,
  });

  const invoices = invoicesData ?? [];
  const currentSavings = savingsSummary?.total_savings_usd ?? 0;
  const currentSpent = savingsSummary?.total_spent_usd ?? 0;
  const fee = calculateFee(currentSavings);
  // Net savings excludes the flat base fee (billed separately as a subscription).
  const netSavings = currentSavings - fee.variable;
  const isActive = subscription?.status === "active";
  const isCanceling = subscription?.cancel_at_period_end === true;

  const handleSubscribe = async () => {
    if (!apiKey) {
      toast({ title: "Error", description: "API key is required to subscribe." });
      return;
    }
    setSubscribing(true);
    try {
      const checkoutBody: Record<string, unknown> = {
        plan_id: "pro",
        success_url: `${window.location.origin}/dashboard/billing?status=success`,
        cancel_url: `${window.location.origin}/dashboard/billing?status=cancelled`,
      };
      if (promoCode.trim()) {
        checkoutBody.promo_code = promoCode.trim();
      }
      const data = await billingRequest<{ checkout_url: string }>(
        "/v1/billing/checkout",
        apiKey,
        { method: "POST", body: checkoutBody }
      );
      window.location.href = data.checkout_url;
    } catch (error: any) {
      logger.error("Error starting checkout:", error);
      toast({
        title: "Checkout failed",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancel = async () => {
    if (!apiKey) return;
    setCanceling(true);
    try {
      const data = await billingRequest<{ status: string; message: string }>(
        "/v1/billing/cancel",
        apiKey,
        { method: "POST" }
      );
      toast({
        title: "Subscription canceled",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    } catch (error: any) {
      logger.error("Error canceling subscription:", error);
      toast({
        title: "Cancellation failed",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCanceling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Billing</h1>
        <p className="page-description">
          Savings-based pricing - we only earn when we save you money
        </p>
      </div>

      {/* Plan Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {isActive ? "Pro" : "Free"}
            </p>
            <Badge
              variant="outline"
              className={
                isActive
                  ? "text-emerald-600 border-emerald-200 bg-emerald-50"
                  : "text-muted-foreground"
              }
            >
              {isActive ? (isCanceling ? "cancels at period end" : "active") : "open source"}
            </Badge>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">This Month's Savings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              ${currentSavings.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground">
              {savingsSummary?.requests_routed ?? 0} requests routed
            </p>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">You Pay This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              ${fee.total.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground">
              ${fee.base.toFixed(2)} base + ${fee.variable.toFixed(2)} variable
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Month Fee Breakdown */}
      <Card className="clean-card border-blue-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-foreground">You Pay This Month</CardTitle>
            </div>
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
              ${fee.total.toFixed(2)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-4 gap-4 text-center mb-6">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">Base fee</div>
              <div className="text-lg font-bold text-foreground">${fee.base.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">flat monthly</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">25% on first $2K saved</div>
              <div className="text-lg font-bold text-foreground">${fee.first2k.toFixed(2)}</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">10% above $2K saved</div>
              <div className="text-lg font-bold text-foreground">${fee.above2k.toFixed(2)}</div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs text-blue-700">Total due</div>
              <div className="text-lg font-bold text-blue-600">${fee.total.toFixed(2)}</div>
              <div className="text-[10px] text-blue-600/80 mt-0.5">base + variable</div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
            <div>
              <p className="text-sm font-medium text-emerald-800">
                You saved ${currentSavings.toFixed(2)} vs always-Opus &mdash; spent ${currentSpent.toFixed(2)}
              </p>
              <p className="text-xs text-emerald-600">
                Net after ${fee.variable.toFixed(2)} variable fee: <b>${netSavings.toFixed(2)}</b>
                <span className="text-emerald-600/70"> (the $9 base is billed separately)</span>
              </p>
            </div>
            {!isActive && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    placeholder="Promo code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="h-8 pl-7 text-xs w-28"
                  />
                </div>
                <Button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  size="sm"
                >
                  {subscribing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                      Subscribe
                    </>
                  )}
                </Button>
              </div>
            )}
            {isActive && !isCanceling && (
              <Button
                onClick={handleCancel}
                disabled={canceling}
                variant="outline"
                size="sm"
                className="border-muted-foreground/30 text-muted-foreground hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:border-red-800 dark:hover:text-red-400 transition-colors"
              >
                {canceling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Canceling...
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Cancel Subscription
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoice History */}
      {invoices.length > 0 && (
        <Card className="clean-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="text-foreground">Invoice History</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Period</th>
                    <th className="text-right py-2 px-4 text-muted-foreground font-medium">Savings</th>
                    <th className="text-right py-2 px-4 text-muted-foreground font-medium">Base Fee</th>
                    <th className="text-right py-2 px-4 text-muted-foreground font-medium">Savings Fee</th>
                    <th className="text-right py-2 px-4 text-muted-foreground font-medium">Total</th>
                    <th className="text-right py-2 pl-4 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-foreground">
                        {new Date(inv.billing_period_start).toLocaleDateString()} &ndash;{" "}
                        {new Date(inv.billing_period_end).toLocaleDateString()}
                      </td>
                      <td className="text-right py-2 px-4 text-emerald-600">
                        ${inv.total_savings_usd.toFixed(2)}
                      </td>
                      <td className="text-right py-2 px-4 text-foreground">
                        ${inv.base_fee_usd.toFixed(2)}
                      </td>
                      <td className="text-right py-2 px-4 text-foreground">
                        ${inv.savings_fee_usd.toFixed(2)}
                      </td>
                      <td className="text-right py-2 px-4 font-medium text-foreground">
                        ${inv.total_invoice_usd.toFixed(2)}
                      </td>
                      <td className="text-right py-2 pl-4">
                        <Badge
                          variant="outline"
                          className={
                            inv.status === "paid"
                              ? "text-emerald-600 border-emerald-200 bg-emerald-50"
                              : inv.status === "pending"
                              ? "text-amber-600 border-amber-200 bg-amber-50"
                              : "text-muted-foreground"
                          }
                        >
                          {inv.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* How Pricing Works */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-foreground">How pricing works</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                1
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Set a benchmark model</p>
                <p className="text-xs text-muted-foreground">
                  The model you'd normally use for everything (e.g., Claude Opus 4.6)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                2
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Nadir routes + optimizes</p>
                <p className="text-xs text-muted-foreground">
                  Simple prompts → cheaper models. Context is compacted. Complex tasks stay on premium.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">
                3
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">We take a percentage of the savings</p>
                <p className="text-xs text-muted-foreground">
                  25% on the first $2K saved, dropping to 10% above $2K. Plus $9/mo base.
                </p>
              </div>
            </div>
          </div>

          {/* Example */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium text-foreground mb-3">Example: $5,000 monthly LLM spend</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Without Nadir</div>
                <div className="font-bold text-foreground">$5,000</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Nadir saves ~55%</div>
                <div className="font-bold text-emerald-600">$2,750</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Nadir fee</div>
                <div className="font-bold text-foreground">$584</div>
              </div>
              <div>
                <div className="text-emerald-700 text-xs font-medium">You keep</div>
                <div className="font-bold text-emerald-600">$2,166/mo</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison — only show when not subscribed */}
      {!isActive && <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Plans</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Free / Open Source */}
          {/* Free Hosted */}
          <Card className={`clean-card ${!isActive ? "border-2 border-emerald-300" : ""}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground">Free</CardTitle>
                {!isActive && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                    Current
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Hosted (BYOK)</p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground mb-1">Free</p>
              <p className="text-sm text-muted-foreground mb-4">no credit card required</p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Hosted proxy (api.getnadir.com)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> 15 requests/day (BYOK only)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Intelligent routing
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Web dashboard & analytics
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card className={`clean-card border-2 ${isActive ? "border-emerald-300" : "border-blue-300"}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-foreground">Pro</CardTitle>
                {isActive && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                    Current
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Hosted proxy</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-bold text-foreground">$9</span>
                <span className="text-sm text-muted-foreground">/mo + 25% of savings</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">10% above $2K saved</p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Everything in Free, unlimited
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Hosted keys or BYOK
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Semantic cache & dedup
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Fallback chains & context optimization
                </li>
              </ul>
              {!isActive && (
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Promo code"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      className="h-9 pl-8 text-sm"
                    />
                  </div>
                </div>
              )}
              <Button
                className="w-full"
                disabled={isActive || subscribing}
                onClick={handleSubscribe}
              >
                {subscribing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : isActive ? (
                  "Current Plan"
                ) : (
                  "Subscribe"
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Enterprise */}
          <Card className="clean-card">
            <CardHeader>
              <CardTitle className="text-foreground">Enterprise</CardTitle>
              <p className="text-sm text-muted-foreground">Volume pricing</p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground mb-1">Custom</p>
              <p className="text-sm text-muted-foreground mb-4">let's talk</p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Everything in Pro
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> SSO / SAML
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Custom routing models
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> 99.9% SLA
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <a href="mailto:info@getnadir.com?subject=Nadir Enterprise">
                  Contact Us
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>}
    </div>
  );
};

export default Billing;
