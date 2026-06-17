import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoutingLoader } from "@/components/RoutingLoader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Sparkles,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiKey } from "@/hooks/useApiKey";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { trackBillingView, trackCheckoutStart, trackCheckoutCancel } from "@/utils/analytics";
import { formatUSD } from "@/utils/format";
import { CreditsPanel } from "@/components/billing/CreditsPanel";
import { Link, useSearchParams } from "react-router-dom";

// ── Fee calculator ───────────────────────────────────────────────────────

// Markup applied to raw AWS Bedrock cost for Hosted-mode requests. Hosted
// usage is prepaid (drawn down in real time via credits), so it is NOT part
// of the monthly invoice. Kept here only to show the cost-plus rate in copy.
const HOSTED_COST_MARKUP = 0.20;

// Prepaid credit top-ups must be a positive multiple of this amount.
const TOPUP_INCREMENT_USD = 5;

function calculateFee(totalSavings: number) {
  // No base fee. The monthly bill is purely a percentage of the savings we
  // deliver: 25% on the first $2K, 10% above. Hosted usage is billed
  // separately via prepaid credits, not here.
  const first2k = Math.min(totalSavings, 2000) * 0.25;
  const above2k = Math.max(totalSavings - 2000, 0) * 0.10;
  const variable = first2k + above2k;
  return {
    base: 0,
    first2k,
    above2k,
    variable,
    total: variable,
  };
}

// ── Supabase-direct savings summary (no API key required) ───────────────

async function fetchCurrentMonthSavings(): Promise<{
  total_savings_usd: number;
  total_spent_usd: number;
  // Sum of routed_cost_usd for Hosted-mode requests only — the AWS Bedrock
  // cost Nadir paid that the user will be billed for (cost + 20% markup) on
  // their next invoice. Zero for BYOK-only users.
  hosted_cost_usd: number;
  requests_routed: number;
} | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const { data } = await supabase
    .from("savings_tracking")
    .select("routed_cost_usd, savings_usd, key_mode")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString())
    .lt("created_at", monthEnd.toISOString());

  const rows = data ?? [];
  return {
    total_savings_usd: rows.reduce((s, r: any) => s + Number(r.savings_usd || 0), 0),
    total_spent_usd: rows.reduce((s, r: any) => s + Number(r.routed_cost_usd || 0), 0),
    hosted_cost_usd: rows.reduce(
      (s, r: any) =>
        (r.key_mode ?? "").toLowerCase() === "hosted"
          ? s + Number(r.routed_cost_usd || 0)
          : s,
      0
    ),
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

// ── Projected-savings hero ───────────────────────────────────────────────
//
// Shown above the pricing card for users who haven't set up billing yet.
// Leads with their own observed savings (or a cohort projection for
// zero-usage users) so the value is anchored against a personalized benefit
// number instead of arriving cold.
//
// Three display states:
//   (1) real savings this month         -> "you keep ~$X/mo"
//   (2) has requests but no savings yet -> nudge to playground
//   (3) no usage at all                 -> "try the playground" CTA
// Hidden entirely once billing is active (handled by the caller).

// Fallback projection used when the user has no usage yet. Anchored to the
// rough median of real Nadir users so we're not making up numbers — adjust
// once we have a real cohort baseline in savings_tracking.
const COHORT_MEDIAN_MONTHLY_SAVINGS_USD = 38;

function daysElapsedThisMonth(now = new Date()): { elapsed: number; total: number } {
  const elapsed = now.getUTCDate();
  const total = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return { elapsed, total };
}

interface ProjectedSavingsHeroProps {
  currentSavings: number;
  requestsRouted: number;
  onSubscribe: () => void;
  subscribing: boolean;
}

function ProjectedSavingsHero({
  currentSavings,
  requestsRouted,
  onSubscribe,
  subscribing,
}: ProjectedSavingsHeroProps) {
  const { elapsed, total } = daysElapsedThisMonth();
  const monthlyProjected = elapsed > 0 ? (currentSavings * total) / elapsed : 0;
  // Projected savings fee: 25% on first $2K, 10% above. No base fee.
  const projectedFee =
    Math.min(monthlyProjected, 2000) * 0.25 + Math.max(monthlyProjected - 2000, 0) * 0.1;
  const netProjected = Math.max(monthlyProjected - projectedFee, 0);

  const hasSavings = currentSavings > 0.01;
  const hasUsage = requestsRouted > 0;

  // State 1 — real data. Lead with the projection, anchor the price.
  if (hasSavings) {
    return (
      <Card className="clean-card border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wide text-primary">
                  Projected savings
                </span>
              </div>
              <p className="mono text-[40px] font-bold tracking-tight text-foreground leading-none">
                ~${formatUSD(monthlyProjected)}
                <span className="text-muted-foreground font-normal text-lg ml-2">/ month</span>
              </p>
              <p className="text-sm text-muted-foreground mt-3 max-w-xl">
                Based on {requestsRouted} request{requestsRouted === 1 ? "" : "s"} routed this month
                (${formatUSD(currentSavings)} saved so far, {elapsed}/{total} days elapsed).
                {netProjected > 0 && (
                  <>
                    {" "}
                    At this pace you keep roughly <strong className="text-foreground">${formatUSD(netProjected)}/mo</strong> after our fee.
                  </>
                )}
              </p>
            </div>
            <div className="lg:text-right">
              <Button size="lg" onClick={onSubscribe} disabled={subscribing} className="whitespace-nowrap">
                {subscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>Set up billing <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">No base fee · 25% of savings, 10% above $2K</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State 2 — has requests but no savings yet (edge case: routing hit
  // benchmark only). Nudge to Pro's smarter router, no fake projection.
  if (hasUsage) {
    return (
      <Card className="clean-card border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wide text-primary">
                  Unlock smarter routing
                </span>
              </div>
              <p className="text-[22px] font-semibold tracking-tight text-foreground leading-tight">
                You've routed {requestsRouted} request{requestsRouted === 1 ? "" : "s"}. The Wide&amp;Deep Asym router saves a typical user 45-53%.
              </p>
              <p className="text-sm text-muted-foreground mt-3 max-w-xl">
                Set up billing to route simple requests to Haiku and reasoning to Opus automatically. We only bill when we save you money.
              </p>
            </div>
            <div className="lg:text-right">
              <Button size="lg" onClick={onSubscribe} disabled={subscribing} className="whitespace-nowrap">
                {subscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>Set up billing <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">No base fee · 25% of savings, 10% above $2K</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State 3 — no usage yet. Don't fabricate a savings number; point them
  // to the playground so we can show real data on the next visit.
  return (
    <Card className="clean-card border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardContent className="pt-6 pb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium uppercase tracking-wide text-primary">
                See your projected savings
              </span>
            </div>
            <p className="text-[22px] font-semibold tracking-tight text-foreground leading-tight">
              Route a few prompts and we'll show you the monthly savings in real terms.
            </p>
            <p className="text-sm text-muted-foreground mt-3 max-w-xl">
              Typical users save around ${COHORT_MEDIAN_MONTHLY_SAVINGS_USD}/month. Try a handful of prompts
              in the playground and we'll extrapolate your own projection here.
            </p>
          </div>
          <div className="lg:text-right flex flex-col gap-2 lg:items-end">
            <Button asChild size="lg" variant="default" className="whitespace-nowrap">
              <Link to="/dashboard/playground">
                Try the playground <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <button
              onClick={onSubscribe}
              disabled={subscribing}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              {subscribing ? "Opening checkout…" : "or set up billing now, no base fee"}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Component ────────────────────────────────────────────────────────────

const Billing = () => {
  const [searchParams] = useSearchParams();
  const [subscribing, setSubscribing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const { toast } = useToast();
  const { apiKey, requireApiKey } = useApiKey();
  const queryClient = useQueryClient();

  useEffect(() => { trackBillingView(); }, []);

  // When Stripe redirects back with ?status=cancelled the user closed the
  // checkout tab without paying. Fire a client-side `checkout_cancel` so the
  // drop-off shows up in the funnel. (The complementary server-side
  // `checkout_abandon` fires from the `checkout.session.expired` webhook
  // for users who never come back at all.)
  useEffect(() => {
    if (searchParams.get("status") === "cancelled") {
      trackCheckoutCancel("pro");
    }
  }, [searchParams]);

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
  const currentHostedCost = savingsSummary?.hosted_cost_usd ?? 0;
  const isActive = subscription?.status === "active";
  const fee = calculateFee(currentSavings);
  // Net savings = gross savings minus the variable savings fee. There is no
  // base fee, and Hosted usage is prepaid separately (not netted here).
  const netSavings = currentSavings - fee.variable;
  const isCanceling = subscription?.cancel_at_period_end === true;
  const cardFailing = subscription?.payment_method_health === "failing";
  const cardFailingReason = subscription?.payment_method_health_last_error as
    | string
    | null
    | undefined;
  const [openingPortal, setOpeningPortal] = useState(false);

  const handleOpenPortal = async () => {
    if (!apiKey) {
      // Portal endpoint authenticates via API key. New signups land here
      // without one in memory (it's cleared on refresh), so point them at
      // the API keys page to create / paste one first.
      toast({
        title: "Enter your API key first",
        description:
          "Open the API Keys page and paste your key, then come back to update your card.",
      });
      return;
    }
    setOpeningPortal(true);
    try {
      const res = await fetch(`${API_BASE}/v1/billing/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody.detail) detail = errBody.detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const data = (await res.json()) as { portal_url: string };
      window.location.href = data.portal_url;
    } catch (error: any) {
      logger.error("Open portal error:", error);
      toast({
        title: "Couldn't open billing portal",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      // Backend /v1/billing/checkout authenticates with the Supabase JWT, not
      // an API key. This means a user who's just signed in can start checkout
      // without ever creating a key (which is exactly the new-signup flow).
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData.session) {
        throw new Error("You're signed out. Please sign in and try again.");
      }
      const accessToken = sessionData.session.access_token;

      const checkoutBody: Record<string, unknown> = {
        plan_id: "pro",
        success_url: `${window.location.origin}/dashboard/billing?status=success`,
        cancel_url: `${window.location.origin}/dashboard/billing?status=cancelled`,
      };
      const res = await fetch(`${API_BASE}/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(checkoutBody),
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
      // Fire the tracking event *before* navigation — window.location.href
      // tears down the PostHog snippet immediately and any capture() call
      // made after the assignment is lost.
      trackCheckoutStart("pro", "billing_page");
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

  // Auto-start checkout when arriving with ?autostart=1. Checkout is
  // authenticated by the Supabase session, so we don't need an API key —
  // runs once per arrival.
  const [autostartAttempted, setAutostartAttempted] = useState(false);
  useEffect(() => {
    if (autostartAttempted) return;
    if (searchParams.get("autostart") !== "1") return;
    if (subscription?.status === "active") return;
    setAutostartAttempted(true);
    handleSubscribe();
  }, [searchParams, subscription, autostartAttempted]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RoutingLoader />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Billing</h1>
        <p className="page-description">
          Savings-based pricing - we only earn when we save you money
        </p>
      </div>

      {/* Card-failed banner. Surfaces when the pre-billing health check
          (signup or daily cron) couldn't verify the card. Cleared by the
          payment_method.attached webhook once the user updates it. */}
      {cardFailing && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4"
        >
          <AlertTriangle
            className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0"
            strokeWidth={2}
          />
          <div className="flex-1">
            <p className="font-semibold text-red-900 dark:text-red-100">
              We couldn't verify your card on file
            </p>
            <p className="text-sm text-red-800 dark:text-red-200 mt-1">
              {cardFailingReason
                ? `Reason from the bank: ${cardFailingReason}`
                : "Your card was declined when we tried to verify it."}{" "}
              Update it now so your next savings invoice doesn't fail.
            </p>
          </div>
          <Button
            onClick={handleOpenPortal}
            disabled={openingPortal}
            className="bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
          >
            {openingPortal ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Update card <ExternalLink className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* Projected savings hero (only for unsubscribed users) */}
      {!isActive && (
        <ProjectedSavingsHero
          currentSavings={currentSavings}
          requestsRouted={savingsSummary?.requests_routed ?? 0}
          onSubscribe={handleSubscribe}
          subscribing={subscribing}
        />
      )}

      {/* Plan Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mono text-[24px] font-bold tracking-tight text-foreground leading-none mb-2">
              {isActive ? "Active" : "Free"}
            </p>
            <span className={isActive ? "chip chip-ok" : "chip chip-neutral"}>
              {isActive ? (isCanceling ? "cancels at period end" : "billing active") : "no base fee"}
            </span>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">This Month's Savings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mono text-[24px] font-bold tracking-tight text-[hsl(var(--ok))] leading-none">
              ${formatUSD(currentSavings)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              <span className="mono">{savingsSummary?.requests_routed ?? 0}</span> requests routed
            </p>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">You Pay This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mono text-[24px] font-bold tracking-tight text-[hsl(var(--brand-blue-strong))] leading-none">
              ${formatUSD(fee.total)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              <span className="mono">${formatUSD(fee.variable)}</span> savings fee · no base fee
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Month Fee Breakdown */}
      <Card className="clean-card order-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-[hsl(var(--brand-blue-strong))]" strokeWidth={1.75} />
              <CardTitle className="text-foreground">You Pay This Month</CardTitle>
            </div>
            <span className="chip chip-direct mono">${formatUSD(fee.total)}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4 text-center mb-6">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">25% on first $2K saved</div>
              <div className="mono text-lg font-bold text-foreground">${formatUSD(fee.first2k)}</div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground">10% above $2K saved</div>
              <div className="mono text-lg font-bold text-foreground">${formatUSD(fee.above2k)}</div>
            </div>
            <div
              className="p-3 rounded-lg border"
              style={{
                background: "hsl(var(--brand-blue-soft))",
                borderColor: "hsl(var(--brand-blue) / 0.25)",
              }}
            >
              <div className="text-xs text-[hsl(var(--brand-blue-strong))]">Total savings fee</div>
              <div className="mono text-lg font-bold text-[hsl(var(--brand-blue-strong))]">${formatUSD(fee.total)}</div>
              <div className="text-[10px] text-[hsl(var(--brand-blue-strong))]/80 mt-0.5">no base fee</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2 mb-6">
            Hosted (Nadir keys) usage isn't billed here — it's drawn from your prepaid credit balance at cost + 20%.
          </p>

          <div
            className="flex items-center justify-between p-4 rounded-lg border"
            style={{
              background: "hsl(var(--ok-bg))",
              borderColor: "hsl(var(--ok-border))",
            }}
          >
            <div>
              <p className="text-sm font-medium text-[hsl(var(--ok-strong))]">
                You saved <span className="mono">${formatUSD(currentSavings)}</span> vs always-complex on <span className="mono">${formatUSD(currentSpent)}</span> of routed spend
              </p>
              <p className="text-xs text-[hsl(var(--ok))]">
                Net after <span className="mono">${formatUSD(fee.variable)}</span> savings fee: <b className="mono">${formatUSD(netSavings)}</b>
                <span className="opacity-75"> (no base fee)</span>
              </p>
            </div>
            {!isActive && (
              <div className="flex items-center gap-2">
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
                      Set up billing
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

      {/* Prepaid credits (Hosted usage) */}
      <div className="order-2">
        <CreditsPanel />
      </div>

      {/* Invoice History */}
      {invoices.length > 0 && (
        <Card className="clean-card order-2">
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
                      <td className="text-right py-2 px-4 text-[hsl(var(--ok))]">
                        ${formatUSD(inv.total_savings_usd)}
                      </td>
                      <td className="text-right py-2 px-4 text-foreground">
                        ${formatUSD(inv.base_fee_usd)}
                      </td>
                      <td className="text-right py-2 px-4 text-foreground">
                        ${formatUSD(inv.savings_fee_usd)}
                      </td>
                      <td className="text-right py-2 px-4 font-medium text-foreground">
                        ${formatUSD(inv.total_invoice_usd)}
                      </td>
                      <td className="text-right py-2 pl-4">
                        <span
                          className={
                            inv.status === "paid"
                              ? "chip chip-ok"
                              : inv.status === "pending"
                              ? "chip chip-warn"
                              : "chip chip-neutral"
                          }
                        >
                          {inv.status}
                        </span>
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
      <Card className="clean-card order-2">
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
                  25% on the first $2K saved, dropping to 10% above $2K. No base fee.
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
                <div className="font-bold text-[hsl(var(--ok))]">$2,750</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Nadir fee</div>
                <div className="font-bold text-foreground">$575</div>
              </div>
              <div>
                <div className="text-[hsl(var(--ok-strong))] text-xs font-medium">You keep</div>
                <div className="font-bold text-[hsl(var(--ok))]">$2,175/mo</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison — moved before fee breakdown for free users via order-1 */}
      {!isActive && <div className="order-1">
        <h2 className="text-lg font-semibold text-foreground mb-4">Plans</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Bring your own keys */}
          <Card className="clean-card border-2 border-[hsl(var(--ok-border))]">
            <CardHeader>
              <CardTitle className="text-foreground">Bring your own keys</CardTitle>
              <p className="text-sm text-muted-foreground">Your provider keys</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="mono text-3xl font-bold text-foreground tracking-tight">25%</span>
                <span className="text-sm text-muted-foreground">of savings</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">10% above $2K saved · no base fee</p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Use your OpenAI / Anthropic / Google keys
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Free to start, pay only on savings
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Intelligent routing across tiers
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Semantic cache & fallback chains
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Use our keys (Hosted, prepaid) */}
          <Card className="clean-card border-2 border-[hsl(var(--brand-blue)/0.3)]">
            <CardHeader>
              <CardTitle className="text-foreground">Use our keys</CardTitle>
              <p className="text-sm text-muted-foreground">Prepaid · Nadir-managed keys</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="mono text-3xl font-bold text-foreground tracking-tight">Prepaid</span>
                <span className="text-sm text-muted-foreground">+ 25% of savings</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Top up in $5, drawn down at cost + 20%</p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Nadir-managed keys, zero setup
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Prepaid credits with auto-recharge
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Semantic cache & dedup
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Fallback chains & context optimization
                </li>
              </ul>
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
                  "Billing active"
                ) : (
                  "Set up billing"
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
              <p className="mono text-3xl font-bold text-foreground tracking-tight mb-1">Custom</p>
              <p className="text-sm text-muted-foreground mb-4">let's talk</p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Everything in the self-serve plans
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> SSO / SAML
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> Custom routing models
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" /> 99.9% SLA
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/contact?reason=enterprise&source=billing_enterprise">
                  Contact Us
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>}
    </div>
  );
};

export default Billing;
