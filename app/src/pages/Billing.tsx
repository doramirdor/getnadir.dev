import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useApiKey } from "@/hooks/useApiKey";
import { SavingsAPI } from "@/services/savingsApi";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

// ── Fee calculator ───────────────────────────────────────────────────────

function calculateFee(totalSavings: number) {
  const base = 9;
  const first2k = Math.min(totalSavings, 2000) * 0.25;
  const above2k = Math.max(totalSavings - 2000, 0) * 0.10;
  return { base, first2k, above2k, total: base + first2k + above2k };
}

// ── Component ────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const Billing = () => {
  const [subscribing, setSubscribing] = useState(false);
  const { toast } = useToast();
  const { apiKey } = useApiKey();

  // Fetch savings summary
  const savingsApi = apiKey ? new SavingsAPI(apiKey) : null;
  const { data: savingsSummary, isLoading } = useQuery({
    queryKey: ["savings", "summary", apiKey],
    queryFn: () => savingsApi!.getSavingsSummary(),
    enabled: !!savingsApi,
    retry: 1,
    staleTime: 60_000,
  });

  // Fetch subscription status
  const { data: subscription } = useQuery({
    queryKey: ["subscription", apiKey],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .single();
      return data;
    },
    retry: 1,
    staleTime: 60_000,
  });

  const currentSavings = savingsSummary?.totalSaved ?? 0;
  const fee = calculateFee(currentSavings);
  const isActive = subscription?.status === "active";

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const res = await fetch(`${API_BASE}/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.checkout_url) {
          window.location.href = data.checkout_url;
          return;
        }
      }

      toast({
        title: "Checkout",
        description: "Stripe checkout is being set up. Please check back shortly or contact support.",
      });
    } catch (error) {
      logger.error("Error starting checkout:", error);
      toast({
        title: "Checkout",
        description: "Stripe checkout is being set up. Please check back shortly or contact support.",
      });
    } finally {
      setSubscribing(false);
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
          Savings-based pricing — we only earn when we save you money
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
              {isActive ? "active" : "open source"}
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
              {savingsSummary?.requestsRouted ?? 0} requests routed
            </p>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Net Savings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              ${(currentSavings - fee.total).toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground">after Nadir fee</p>
          </CardContent>
        </Card>
      </div>

      {/* Current Month Fee Breakdown */}
      <Card className="clean-card border-blue-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-foreground">Current Month Fee</CardTitle>
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
              <div className="text-xs text-blue-700">Total fee</div>
              <div className="text-lg font-bold text-blue-600">${fee.total.toFixed(2)}</div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
            <div>
              <p className="text-sm font-medium text-emerald-800">
                You saved ${currentSavings.toFixed(2)} this month
              </p>
              <p className="text-xs text-emerald-600">
                Net savings after fee: ${(currentSavings - fee.total).toFixed(2)}
              </p>
            </div>
            {!isActive && (
              <Button
                onClick={handleSubscribe}
                disabled={subscribing}
                size="sm"
              >
                {subscribing ? (
                  "Loading..."
                ) : (
                  <>
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Subscribe
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
                <div className="text-muted-foreground text-xs">Nadir saves ~65%</div>
                <div className="font-bold text-emerald-600">$3,250</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Nadir fee</div>
                <div className="font-bold text-foreground">$634</div>
              </div>
              <div>
                <div className="text-emerald-700 text-xs font-medium">You keep</div>
                <div className="font-bold text-emerald-600">$2,616/mo</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Plans</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Free / Open Source */}
          <Card className="clean-card">
            <CardHeader>
              <CardTitle className="text-foreground">Open Source</CardTitle>
              <p className="text-sm text-muted-foreground">Self-hosted</p>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground mb-1">Free</p>
              <p className="text-sm text-muted-foreground mb-4">forever</p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> 4-tier intelligent routing
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Context Optimize (safe mode)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> CLI dashboard
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Unlimited requests
                </li>
              </ul>
              <Button variant="outline" className="w-full" asChild>
                <a href="https://github.com/doramirdor/NadirClaw" target="_blank" rel="noopener noreferrer">
                  View on GitHub
                </a>
              </Button>
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
                  <Check className="w-4 h-4 text-blue-600" /> Everything in Open Source
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Hosted proxy (api.getnadir.com)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Aggressive semantic dedup
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> Web dashboard & analytics
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-600" /> BYOK or use our keys
                </li>
              </ul>
              <Button
                className="w-full"
                disabled={isActive || subscribing}
                onClick={handleSubscribe}
              >
                {isActive ? "Current Plan" : subscribing ? "Loading..." : "Subscribe"}
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
                <a href="mailto:amirdor@gmail.com?subject=Nadir Enterprise">
                  Contact Us
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Billing;
