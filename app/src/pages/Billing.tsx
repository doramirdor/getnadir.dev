import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  CreditCard,
  Download,
  AlertCircle,
  CheckCircle,
  Plus,
  Minus,
  Gift,
  Timer,
  DollarSign,
  Settings,
  Trash2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AddPaymentMethodDialog } from "@/components/AddPaymentMethodDialog";
import { logger } from "@/utils/logger";

interface BillingPlan {
  id: string;
  name: string;
  description: string | null;
  plan_type: string;
  price_per_month: number | null;
  price_per_request: number | null;
  credit_amount: number | null;
  credit_price: number | null;
  features: any;
}

interface UserSubscription {
  id: string;
  plan_id: string | null;
  status: string;
  current_period_end: string | null;
}

interface UserCredits {
  balance: number;
  auto_charge_enabled: boolean;
  auto_charge_threshold: number;
  auto_charge_amount: number;
  upper_limit: number | null;
}

interface PaymentMethod {
  id: string;
  stripe_payment_method_id: string;
  card_brand: string | null;
  card_last_four: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  is_default: boolean;
}

interface ActiveToken {
  token_type: string;
  expires_at: string | null;
  credits_remaining: number | null;
  days_remaining: number | null;
}

const Billing = () => {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [activeTokens, setActiveTokens] = useState<ActiveToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creditAmount, setCreditAmount] = useState(10);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showRedeemToken, setShowRedeemToken] = useState(false);
  const [tokenCode, setTokenCode] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch billing plans
      const { data: plansData } = await supabase
        .from('billing_plans')
        .select('*')
        .eq('is_active', true)
        .order('plan_type', { ascending: true });

      // Fetch user subscription
      const { data: subscriptionData } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Fetch user credits
      const { data: creditsData } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Fetch payment methods
      const { data: paymentMethodsData } = await supabase
        .from('user_payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });

      // Check for active tokens
      const { data: activeTokensData } = await supabase.rpc('check_user_active_tokens', {
        p_user_id: user.id
      });

      setPlans(plansData || []);
      setSubscription(subscriptionData);
      setCredits(creditsData);
      setPaymentMethods(paymentMethodsData || []);
      setActiveTokens(activeTokensData || []);
    } catch (error) {
      logger.error('Error fetching billing data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch billing information",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribeToPlan = async (planId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // This would integrate with Stripe in production
      toast({
        title: "Feature Coming Soon",
        description: "Stripe integration will be implemented for plan subscriptions",
      });
    } catch (error) {
      logger.error('Error subscribing to plan:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to subscribe to plan",
      });
    }
  };

  const handleBuyCredits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // In production, this would:
      // 1. Create Stripe payment intent
      // 2. Process payment
      // 3. Add credits to user account
      // 4. Log the purchase

      // For demo purposes, we'll simulate the purchase logging
      const { data, error } = await supabase.rpc('log_purchase', {
        p_user_id: user.id,
        p_purchase_type: 'credits',
        p_item_name: `$${creditAmount} Credits`,
        p_amount: creditAmount,
        p_credits_purchased: creditAmount,
        p_metadata: {
          source: 'admin_dashboard',
          payment_method: 'demo'
        }
      });

      if (error) {
        logger.error('Error logging purchase:', error);
      }

      // This would integrate with Stripe in production
      toast({
        title: "Feature Coming Soon",
        description: `Stripe integration will be implemented for purchasing $${creditAmount} in credits. Purchase logged for demo.`,
      });
    } catch (error) {
      logger.error('Error buying credits:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to purchase credits",
      });
    }
  };

  const handleUpdateAutoCharge = async (enabled: boolean) => {
    // Check if user has payment methods before enabling auto-charge
    if (enabled && paymentMethods.length === 0) {
      toast({
        variant: "destructive",
        title: "Payment Method Required",
        description: "Please add a payment method before enabling auto-charge",
      });
      setShowAddCard(true);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_credits')
        .upsert({
          user_id: user.id,
          auto_charge_enabled: enabled,
          auto_charge_threshold: credits?.auto_charge_threshold || 10,
          auto_charge_amount: credits?.auto_charge_amount || 20,
        });

      if (error) throw error;

      setCredits(prev => prev ? { ...prev, auto_charge_enabled: enabled } : null);

      toast({
        title: "Success",
        description: `Auto-charge ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      logger.error('Error updating auto-charge:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update auto-charge settings",
      });
    }
  };

  const handleUpdateThreshold = async (threshold: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_credits')
        .upsert({
          user_id: user.id,
          auto_charge_threshold: threshold,
          auto_charge_enabled: credits?.auto_charge_enabled || false,
          auto_charge_amount: credits?.auto_charge_amount || 20,
        });

      if (error) throw error;

      setCredits(prev => prev ? { ...prev, auto_charge_threshold: threshold } : null);
    } catch (error) {
      logger.error('Error updating threshold:', error);
    }
  };

  const handleUpdateAmount = async (amount: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_credits')
        .upsert({
          user_id: user.id,
          auto_charge_amount: amount,
          auto_charge_enabled: credits?.auto_charge_enabled || false,
          auto_charge_threshold: credits?.auto_charge_threshold || 10,
        });

      if (error) throw error;

      setCredits(prev => prev ? { ...prev, auto_charge_amount: amount } : null);
    } catch (error) {
      logger.error('Error updating amount:', error);
    }
  };

  const handleRedeemToken = async () => {
    if (!tokenCode.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a token code",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Call the redeem_token function
      const { data, error } = await supabase.rpc('redeem_token', {
        p_user_id: user.id,
        p_token_code: tokenCode.toUpperCase()
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; token_type?: string; days_granted?: number; credits_granted?: number };

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Invalid Token",
          description: result.error || "Token could not be redeemed",
        });
        return;
      }

      // Success message based on token type
      let successMessage = "";
      if (result.token_type === 'time_limited') {
        successMessage = `Successfully redeemed! You now have ${result.days_granted} days of unlimited access.`;
      } else if (result.token_type === 'credit_token') {
        successMessage = `Successfully redeemed! $${result.credits_granted} has been added to your account.`;
      }

      toast({
        title: "Token Redeemed Successfully",
        description: successMessage,
      });

      setShowRedeemToken(false);
      setTokenCode("");

      // Refresh billing data to show updated credits/status
      fetchBillingData();
    } catch (error) {
      logger.error('Error redeeming token:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to redeem token. Please try again.",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-1 w-16 bg-muted rounded-full overflow-hidden"><div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" /></div>
      </div>
    );
  }

  const subscriptionPlans = plans
    .filter(p => p.plan_type === 'subscription')
    .sort((a, b) => {
      // Ensure proper ordering: Free Tier, Pro Plan, Enterprise
      const order = { 'Free Tier': 1, 'Pro Plan': 2, 'Enterprise': 3 };
      return (order[a.name as keyof typeof order] || 999) - (order[b.name as keyof typeof order] || 999);
    });
  const payAsYouGoPlans = plans.filter(p => p.plan_type === 'pay_as_you_go');

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-title">Billing & Plans</h1>
          <p className="page-description">Manage your subscription, credits, and payment methods</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showRedeemToken} onOpenChange={setShowRedeemToken}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Gift className="w-4 h-4 mr-2" />
                Redeem Token
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Redeem Token</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="token">Token Code</Label>
                  <Input
                    id="token"
                    value={tokenCode}
                    onChange={(e) => setTokenCode(e.target.value)}
                    placeholder="Enter your token code"
                  />
                </div>
                <Button onClick={handleRedeemToken} className="w-full">
                  Redeem Token
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            onClick={() => setShowAddCard(true)}
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Add Payment Method
          </Button>
        </div>
      </div>

      {/* Current Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {subscription?.status === 'active' ? 'Pro Plan' : 'Free Tier'}
            </p>
            <Badge variant="outline" className={subscription?.status === 'active' ? 'text-emerald-600 border-emerald-200 bg-emerald-50' : 'text-muted-foreground'}>
              {subscription?.status || 'inactive'}
            </Badge>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Credit Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              ${credits?.balance?.toFixed(2) || '0.00'}
            </p>
            <p className="text-sm text-muted-foreground">Available credits</p>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Auto-Charge</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {credits?.auto_charge_enabled ? 'Enabled' : 'Disabled'}
            </p>
            <p className="text-sm text-muted-foreground">
              {credits?.auto_charge_enabled
                ? `When balance < $${credits.auto_charge_threshold}`
                : 'Manual payments only'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Tokens */}
      {activeTokens.length > 0 && (
        <Card className="clean-card bg-accent">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Gift className="w-5 h-5" />
              Active Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeTokens.map((token, index) => (
                <div key={index} className="p-4 bg-background border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground">
                      {token.token_type === 'time_limited' ? (
                        <>
                          <Timer className="w-4 h-4 inline mr-1" />
                          Unlimited Access
                        </>
                      ) : (
                        <>
                          <DollarSign className="w-4 h-4 inline mr-1" />
                          Credit Token
                        </>
                      )}
                    </span>
                  </div>
                  {token.token_type === 'time_limited' && token.days_remaining !== null && (
                    <p className="text-sm text-muted-foreground">
                      {token.days_remaining > 0 ? `${token.days_remaining} days remaining` : 'Expires today'}
                    </p>
                  )}
                  {token.token_type === 'credit_token' && token.credits_remaining && (
                    <p className="text-sm text-muted-foreground">
                      ${token.credits_remaining.toFixed(2)} credit value
                    </p>
                  )}
                  {token.expires_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Expires: {new Date(token.expires_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription Plans */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Subscription Plans</h2>
        {subscriptionPlans.length === 0 ? (
          <Card className="clean-card bg-accent">
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                <p className="text-foreground">No subscription plans available</p>
                <p className="text-sm text-muted-foreground mt-1">Please check back later or contact support</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {subscriptionPlans.map((plan) => (
              <Card key={plan.id} className={`clean-card ${subscription?.plan_id === plan.id ? 'border-primary bg-accent' : ''}`}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-foreground">{plan.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                    </div>
                    {subscription?.plan_id === plan.id && (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Current</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    {plan.features?.contact_sales ? (
                      <>
                        <p className="text-2xl font-bold text-foreground">Let's talk</p>
                        <p className="text-sm text-muted-foreground">Contact us for pricing</p>
                      </>
                    ) : (
                      <>
                        <p className="text-3xl font-bold text-foreground">
                          ${plan.price_per_month?.toFixed(2) || '0.00'}
                        </p>
                        <p className="text-sm text-muted-foreground">per month</p>
                      </>
                    )}
                  </div>

                  <div className="space-y-2 mb-6">
                    {plan.features?.max_requests && (
                      <p className="text-sm text-muted-foreground">
                        {plan.features.max_requests === -1 ? 'Unlimited' : plan.features.max_requests.toLocaleString()} requests
                      </p>
                    )}
                    {plan.features?.models && (
                      <p className="text-sm text-muted-foreground">
                        {Array.isArray(plan.features.models) ? plan.features.models.join(', ') : plan.features.models} models
                      </p>
                    )}
                    {plan.features?.support && (
                      <p className="text-sm text-muted-foreground">
                        {plan.features.support} support
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={() => {
                      if (plan.features?.contact_sales) {
                        // Open contact us or mailto
                        window.open('mailto:sales@nadir.dev?subject=Enterprise Plan Inquiry', '_blank');
                      } else {
                        handleSubscribeToPlan(plan.id);
                      }
                    }}
                    disabled={subscription?.plan_id === plan.id && !plan.features?.contact_sales}
                    className="w-full"
                    variant={subscription?.plan_id === plan.id ? "outline" : "default"}
                  >
                    {subscription?.plan_id === plan.id
                      ? 'Current Plan'
                      : plan.features?.contact_sales
                        ? 'Contact Us'
                        : 'Select Plan'
                    }
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Pay-As-You-Go */}
      {payAsYouGoPlans.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Pay-As-You-Go</h2>
          <Card className="clean-card">
            <CardContent className="pt-6">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-medium text-foreground">Pay per request</h4>
                  <p className="text-sm text-muted-foreground">Only pay for what you use</p>
                  <p className="text-lg font-semibold text-foreground mt-2">
                    ${payAsYouGoPlans[0]?.features?.price_per_request || 0.002} per request
                  </p>
                </div>
                <div className="text-right">
                  <Label htmlFor="upper-limit" className="text-sm text-muted-foreground">Upper Limit</Label>
                  <Input
                    id="upper-limit"
                    type="number"
                    placeholder="$100"
                    className="w-24 mt-1"
                    value={credits?.upper_limit || ''}
                    onChange={(e) => {
                      // Handle upper limit update
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Buy Credits */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Buy Credits</h2>
        <p className="text-muted-foreground mb-6">Purchase credits to use with any plan. Credits never expire.</p>

        {/* Custom Amount */}
        <Card className="clean-card">
          <CardHeader>
            <CardTitle className="text-foreground">Custom Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreditAmount(Math.max(10, creditAmount - 5))}
                  disabled={creditAmount <= 10}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <div className="mx-4 text-center">
                  <p className="text-2xl font-bold text-foreground">${creditAmount}</p>
                  <p className="text-sm text-muted-foreground">credits</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreditAmount(creditAmount + 5)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <Button
                onClick={handleBuyCredits}
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Buy Credits
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Minimum purchase: $10, increments of $5</p>
          </CardContent>
        </Card>

        {/* Quick Purchase Options */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[10, 25, 50, 100].map((amount) => (
            <Card key={amount} className="clean-card cursor-pointer hover:bg-accent" onClick={() => setCreditAmount(amount)}>
              <CardContent className="text-center pt-6">
                <p className="text-xl font-bold text-foreground">${amount}</p>
                <p className="text-sm text-muted-foreground">credits</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment Methods */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Payment Methods</h2>
        <Card className="clean-card">
          <CardContent className="pt-6">
            {paymentMethods.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p>No payment methods added</p>
                <Button onClick={() => setShowAddCard(true)} className="mt-2">
                  Add Payment Method
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <div key={method.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-6 bg-foreground rounded text-background text-xs flex items-center justify-center">
                        {method.card_brand?.toUpperCase() || 'CARD'}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          **** **** **** {method.card_last_four}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Expires {method.card_exp_month}/{method.card_exp_year}
                        </p>
                      </div>
                      {method.is_default && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Default</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="sm">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Auto-Charge Settings */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Auto-Charge Settings</h2>
        <Card className="clean-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-foreground">Automatic Credit Top-up</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {paymentMethods.length === 0
                    ? 'Add a payment method to enable auto-charge'
                    : 'Automatically charge your card when credits run low'
                  }
                </p>
              </div>
              <Switch
                checked={credits?.auto_charge_enabled || false}
                onCheckedChange={handleUpdateAutoCharge}
                disabled={paymentMethods.length === 0}
              />
            </div>
          </CardHeader>
          <CardContent>
            {credits?.auto_charge_enabled && paymentMethods.length > 0 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="threshold">Charge when balance falls below</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <span>$</span>
                    <Input
                      id="threshold"
                      type="number"
                      value={credits.auto_charge_threshold}
                      onChange={(e) => handleUpdateThreshold(parseFloat(e.target.value) || 10)}
                      className="w-24"
                      min="1"
                      step="1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="amount">Auto-charge amount</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <span>$</span>
                    <Input
                      id="amount"
                      type="number"
                      value={credits.auto_charge_amount}
                      onChange={(e) => handleUpdateAmount(parseFloat(e.target.value) || 20)}
                      className="w-24"
                      min="10"
                      step="5"
                    />
                  </div>
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground mt-4">
              {paymentMethods.length === 0 ? (
                'You need to add a payment method before you can enable auto-charge.'
              ) : credits?.auto_charge_enabled ? (
                `We'll automatically charge your default payment method $${credits.auto_charge_amount} when your balance falls below $${credits.auto_charge_threshold}.`
              ) : (
                'Enable auto-charge to automatically top up your credits when running low.'
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Add Payment Method Dialog */}
      <AddPaymentMethodDialog
        open={showAddCard}
        onOpenChange={setShowAddCard}
        onPaymentMethodAdded={fetchBillingData}
      />
    </div>
  );
};

export default Billing;