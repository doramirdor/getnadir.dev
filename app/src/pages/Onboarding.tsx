import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle,
  Key,
  Zap,
  Copy,
  Check,
  Loader2,
  CircleCheck,
  Sparkles,
  Gift,
  Mail,
  Monitor,
  CreditCard,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useApiKey } from "@/hooks/useApiKey";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  trackOnboardingStep,
  trackOnboardingComplete,
  trackApiKeyCreated,
  trackFirstCallResult,
} from "@/utils/analytics";
import CreateApiKeyDialog from "@/components/CreateApiKeyDialog";
import OnboardingCelebration from "@/components/OnboardingCelebration";
import { DailyQuotaBar } from "@/components/DailyQuotaBar";
import { getStoredAttribution } from "@/utils/attribution";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Mode = "byok" | "hosted";

// Two-step onboarding. Step 0 makes the user choose how they want to run:
// "Use our keys" (hosted, prepaid credits required to start, no provider keys
// needed) or "Bring your keys" (BYOK, paste a provider key, free monthly trial).
// Whichever they pick, we create a key with smart defaults, then they make
// their first call in the page and see real savings. The full configuration
// wizard (CreateApiKeyDialog) stays available behind the "Customize" link
// and on the API Keys page.
const STEPS = [
  { id: "api-key", label: "Your key", icon: Key },
  { id: "first-call", label: "First call", icon: Zap },
];

const NADIR_API_HOST = "api.getnadir.com";

// Smart defaults for the auto-created key: hosted (our keys), routing on
// across the Claude 4.6 family, fallback most-capable-first.
const DEFAULT_KEY_CONFIG = {
  name: "My first key",
  selected_models: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
  benchmark_model: "claude-opus-4-6",
  model_parameters: {
    key_mode: "hosted" as Mode,
    layers: { routing: true, fallback: true, optimize: "off" },
    tier_models: {
      simple: "claude-haiku-4-5",
      medium: "claude-sonnet-4-6",
      complex: "claude-opus-4-6",
    },
    fallback_chain: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
  },
};

// Per-provider routing defaults for the BYOK quick path. Mirrors the model
// catalog in CreateApiKeyDialog (which is module-private there). Simple =
// cheapest, complex = most capable, benchmark = complex.
const BYOK_DEFAULTS: Record<string, {
  selected_models: string[];
  benchmark_model: string;
  tier_models: { simple: string; medium?: string; complex: string };
}> = {
  anthropic: {
    selected_models: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
    benchmark_model: "claude-opus-4-6",
    tier_models: { simple: "claude-haiku-4-5", medium: "claude-sonnet-4-6", complex: "claude-opus-4-6" },
  },
  openai: {
    selected_models: ["gpt-4o-mini", "gpt-5-mini", "gpt-5.4"],
    benchmark_model: "gpt-5.4",
    tier_models: { simple: "gpt-4o-mini", medium: "gpt-5-mini", complex: "gpt-5.4" },
  },
  google: {
    selected_models: ["gemini-2.0-flash", "gemini-2.5-pro"],
    benchmark_model: "gemini-2.5-pro",
    tier_models: { simple: "gemini-2.0-flash", complex: "gemini-2.5-pro" },
  },
  openrouter: {
    selected_models: ["openrouter/auto"],
    benchmark_model: "openrouter/auto",
    tier_models: { simple: "openrouter/auto", complex: "openrouter/auto" },
  },
  groq: {
    selected_models: ["groq/llama-3.3-70b-versatile", "groq/mixtral-8x7b-32768"],
    benchmark_model: "groq/llama-3.3-70b-versatile",
    tier_models: { simple: "groq/mixtral-8x7b-32768", complex: "groq/llama-3.3-70b-versatile" },
  },
};

const PROVIDER_FIELDS = [
  { key: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { key: "openai", label: "OpenAI", placeholder: "sk-..." },
  { key: "google", label: "Google AI", placeholder: "AI..." },
  { key: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
  { key: "groq", label: "Groq", placeholder: "gsk_..." },
];

// Replicates isProviderKeyFormatValid() from CreateApiKeyDialog.tsx. Note
// google has no prefix check (length only), matching the dialog's behavior.
function isProviderKeyFormatValid(provider: string, key: string): boolean {
  if (!key.trim()) return false;
  switch (provider) {
    case "openai": return key.startsWith("sk-") && key.length > 20;
    case "anthropic": return key.startsWith("sk-ant-") && key.length > 20;
    case "openrouter": return key.startsWith("sk-or-") && key.length > 20;
    case "groq": return key.startsWith("gsk_") && key.length > 20;
    default: return key.length > 10;
  }
}

interface TestResult {
  ok: boolean;
  message?: string;
  model?: string;
  latencyMs?: number;
  content?: string;
  costUsd?: number | null;
  benchmarkModel?: string | null;
  savingsPct?: number | null;
}

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [mode, setMode] = useState<Mode>("hosted");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [existingKeyPrefix, setExistingKeyPrefix] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [chooserMode, setChooserMode] = useState<Mode | null>(null);
  const [byokProvider, setByokProvider] = useState("anthropic");
  const [byokKey, setByokKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [billingActive, setBillingActive] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setApiKey: setSessionApiKey } = useApiKey();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const campaignLimits: Record<string, number> = {};
  const storedRef = getStoredAttribution().ref;
  const freeLimit = (storedRef && campaignLimits[storedRef]) || 5;
  const hasKey = !!createdApiKey || !!existingKeyPrefix;

  // Insert an api_keys row and return the plaintext key. Shared by the
  // auto-create path and the CreateApiKeyDialog onCreate handler.
  const insertApiKey = async (config: {
    name: string;
    selected_models: string[];
    benchmark_model: string;
    model_parameters: Record<string, any>;
  }): Promise<string> => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) throw new Error("Not authenticated");

    const keyValue = `ndr_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
    const keyHash = await sha256(keyValue);

    const { error } = await supabase.from("api_keys").insert({
      user_id: authUser.id,
      name: config.name,
      key_hash: keyHash,
      prefix: keyValue.slice(0, 8),
      is_active: true,
      selected_models: config.selected_models,
      benchmark_model: config.benchmark_model,
      model_parameters: config.model_parameters,
    });

    if (error) throw error;
    return keyValue;
  };

  // Called by CreateApiKeyDialog (the "Customize" path) with the full
  // configured key payload. The dialog has already saved any new BYOK
  // provider keys via JWT.
  const handleCreateApiKey = async (config: {
    name: string;
    selected_models: string[];
    benchmark_model: string;
    model_parameters: Record<string, any>;
  }) => {
    const keyValue = await insertApiKey(config);
    setMode((config.model_parameters?.key_mode as Mode) || "byok");
    setCreatedApiKey(keyValue);
    setSessionApiKey(keyValue);
    setTestResult(null);
    trackApiKeyCreated("onboarding");
    toast({
      title: "API Key Created",
      description: "Your key is configured and ready to use.",
    });
  };

  // Auto-create (or explicitly re-create) the default key.
  const createDefaultKey = async () => {
    setCreatingKey(true);
    try {
      const keyValue = await insertApiKey(DEFAULT_KEY_CONFIG);
      setMode("hosted");
      setCreatedApiKey(keyValue);
      setSessionApiKey(keyValue);
      setExistingKeyPrefix(null);
      setTestResult(null);
      trackApiKeyCreated("onboarding", false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Couldn't create your key",
        description: e.message || "Please try again.",
      });
    } finally {
      setCreatingKey(false);
    }
  };

  // BYOK quick path: save the provider key (encrypted server-side via JWT),
  // then create a key_mode:"byok" key with routing defaults for that provider.
  const handleCreateByokKey = async () => {
    if (!isProviderKeyFormatValid(byokProvider, byokKey)) return;
    setCreatingKey(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      // 1) Persist the BYOK provider key (Fernet-encrypted server-side).
      const resp = await fetch(`${API_BASE}/v1/provider-keys/setup`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider: byokProvider, api_key: byokKey.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Couldn't save your provider key.");
      }

      // 2) Create the api_keys row in byok mode.
      const d = BYOK_DEFAULTS[byokProvider] || BYOK_DEFAULTS.anthropic;
      const routingEnabled = d.selected_models.length > 1;
      const keyValue = await insertApiKey({
        name: "My first key",
        selected_models: d.selected_models,
        benchmark_model: d.benchmark_model,
        model_parameters: {
          key_mode: "byok",
          layers: { routing: routingEnabled, fallback: true, optimize: "off" },
          ...(routingEnabled ? { tier_models: d.tier_models } : {}),
          fallback_chain: [...d.selected_models].reverse(),
        },
      });

      setMode("byok");
      setCreatedApiKey(keyValue);
      setSessionApiKey(keyValue);
      setExistingKeyPrefix(null);
      setTestResult(null);
      trackApiKeyCreated("onboarding", false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Couldn't create your key",
        description: e.message || "Please try again.",
      });
    } finally {
      setCreatingKey(false);
    }
  };

  // Bootstrap: read-only. We no longer auto-create a key — the user picks a
  // mode in the chooser first. If they already have a key (revisit), we can't
  // show the plaintext again, so we offer to set up a new one or continue.
  useEffect(() => {
    if (!user?.id || createdApiKey) { setBootstrapLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("id, prefix")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);
      if (cancelled) return;
      if (data && data.length > 0) setExistingKeyPrefix(data[0].prefix);
      setBootstrapLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Real first call: hits /v1/chat/completions with the new key (model auto),
  // then surfaces the routed model, latency, cost, and savings from
  // nadir_metadata. This is the activation moment, so it's tracked.
  const handleTestRequest = async () => {
    if (!createdApiKey) return;
    setTesting(true);
    setTestResult(null);
    const started = performance.now();
    try {
      const res = await fetch(`${API_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": createdApiKey,
        },
        body: JSON.stringify({
          model: "auto",
          messages: [{ role: "user", content: "Say hello in one short sentence." }],
          max_tokens: 60,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data?.detail;
        throw new Error(
          typeof detail === "string" ? detail : detail?.message || "Request failed",
        );
      }
      const clientLatency = Math.round(performance.now() - started);
      const meta = data.nadir_metadata || {};
      const bench = meta.benchmark_comparison || null;
      const costUsd = meta.cost?.total_cost_usd ?? bench?.routed_cost_usd ?? null;
      let savingsPct: number | null = null;
      if (bench?.benchmark_cost_usd > 0 && bench?.savings_usd != null) {
        savingsPct = Math.round((bench.savings_usd / bench.benchmark_cost_usd) * 100);
      }
      const result: TestResult = {
        ok: true,
        model: data.model,
        latencyMs: meta.response_time_ms || clientLatency,
        content: data.choices?.[0]?.message?.content || "",
        costUsd,
        benchmarkModel: bench?.benchmark_model ?? null,
        savingsPct,
      };
      setTestResult(result);
      trackFirstCallResult("success", {
        model: result.model,
        latency_ms: result.latencyMs,
        savings_pct: savingsPct,
      });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || "Request failed" });
      trackFirstCallResult("error", { message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      // Use Supabase JWT to call billing, no API key needed yet
      const res = await fetch(`${API_BASE}/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan_id: "pro",
          success_url: `${window.location.origin}/dashboard/onboarding?subscribed=true`,
          // If Stripe cancels, return to the first-call step where the
          // billing card lives.
          cancel_url: `${window.location.origin}/dashboard/onboarding?step=1`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Checkout failed");

      // Redirect to Stripe checkout
      window.location.href = data.checkout_url;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSubscribing(false);
    }
  };

  // Handle return from Stripe checkout + deep links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let landingStep = 0;
    if (params.get("subscribed") === "true") {
      setBillingActive(true);
      landingStep = 1;
      toast({ title: "Billing active", description: "Your 30-day Pro trial has started. Unlimited requests unlocked." });
      window.history.replaceState({}, "", "/dashboard/onboarding");
    }
    // Came back from the in-dialog Pro upgrade (user picked Hosted mid-wizard).
    // Re-open the create dialog so they can finish.
    if (params.get("upgraded") === "true") {
      setBillingActive(true);
      setCreateDialogOpen(true);
      toast({ title: "Pro trial active", description: "Finish creating your Hosted API key." });
      window.history.replaceState({}, "", "/dashboard/onboarding");
    }
    const stepParam = params.get("step");
    if (stepParam) {
      landingStep = parseInt(stepParam, 10) || 0;
      window.history.replaceState({}, "", "/dashboard/onboarding");
    }
    setCurrentStep(landingStep);
    // Fire on view (not just on transition) so the funnel sees everyone who
    // lands here, including bounce-without-clicking users.
    trackOnboardingStep(landingStep, STEPS[landingStep]?.id || "api-key");
  }, []);

  const goToStep = (next: number) => {
    setCurrentStep(next);
    trackOnboardingStep(next, STEPS[next].id);
  };

  const handleFinish = () => {
    trackOnboardingComplete(mode);
    setShowCelebration(true);
  };

  const handleSkip = () => {
    if (user) {
      localStorage.setItem(`nadir_onboarding_skipped:${user.id}`, "1");
    }
    navigate("/dashboard");
    toast({
      title: "Onboarding skipped",
      description: "You can configure your API key anytime from the API Keys page.",
    });
  };

  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleEmailContinueLink = async () => {
    if (!user?.email) {
      toast({
        variant: "destructive",
        title: "No email on file",
        description: "We couldn't find an email on your account.",
      });
      return;
    }
    setEmailSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const continueUrl = `${window.location.origin}/dashboard/onboarding?step=${currentStep}`;
      const res = await fetch(`${API_BASE}/v1/email/onboarding-continue-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ continue_url: continueUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to send email");
      }
      setEmailSent(true);
      toast({
        title: "Email sent",
        description: `We sent a continue link to ${user.email}. Open it on your computer.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Couldn't send email",
        description: e.message || "Please try again later.",
      });
    } finally {
      setEmailSending(false);
    }
  };

  const handleCelebrationContinue = () => {
    navigate("/dashboard");
    toast({ title: "Welcome to Nadir!", description: "Your setup is complete." });
  };

  const getSnippet = (lang: string) => {
    const key = createdApiKey || "<YOUR_NADIR_API_KEY>";
    if (lang === "python") {
      return `import openai

client = openai.OpenAI(
    base_url="https://${NADIR_API_HOST}/v1",
    api_key="${key}",
)

response = client.chat.completions.create(
    model="auto",  # Nadir picks the best model
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`;
    }
    if (lang === "node") {
      return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://${NADIR_API_HOST}/v1",
  apiKey: "${key}",
});

const response = await client.chat.completions.create({
  model: "auto", // Nadir picks the best model
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);`;
    }
    return `curl https://${NADIR_API_HOST}/v1/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`;
  };

  // Celebration takeover — the editorial "Nice job!" end-of-onboarding moment.
  if (showCelebration) {
    return (
      <OnboardingCelebration
        result={testResult}
        freeLimit={freeLimit}
        onContinue={handleCelebrationContinue}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Welcome header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="page-title">Welcome to Nadir</h1>
        </div>
        <p className="page-description">Pick how you want to run, then make your first call.</p>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Step {currentStep + 1} of {STEPS.length}</span>
          <span>{STEPS[currentStep].label}</span>
        </div>
        <Progress value={progress} className="h-1.5" />
        <div className="flex justify-between">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={`flex flex-col items-center gap-1 ${
                  i <= currentStep ? "text-primary" : "text-muted-foreground/30"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    i < currentStep
                      ? "bg-primary text-primary-foreground"
                      : i === currentStep
                        ? "bg-primary/10 text-primary ring-2 ring-primary"
                        : "bg-muted"
                  }`}
                >
                  {i < currentStep ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className="text-[10px] font-medium">{step.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card className="clean-card">
        <CardContent className="pt-6 space-y-4">
          {/* ═══ STEP 0: Choose how you want to run, then reveal the key ═══ */}
          {currentStep === 0 && (
            <div className="space-y-5">
              {bootstrapLoading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading your account...</p>
                </div>
              ) : creatingKey ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Setting up your key...</p>
                </div>
              ) : createdApiKey ? (
                <>
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Your API key is ready</h2>
                  </div>
                  {mode === "hosted" ? (
                    <p className="text-sm text-muted-foreground">
                      Routing on our keys. Add prepaid credits to make your first call,
                      billed at AWS cost + 20%.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Routing on your own provider keys. You pay your provider directly. Nadir
                      charges a savings fee only.
                    </p>
                  )}

                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                    <p className="text-sm text-primary font-medium mb-2">
                      Copy it now, it won't be shown again:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm flex-1 p-2 bg-background rounded border border-border break-all">
                        {createdApiKey}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => handleCopy(createdApiKey)}>
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(mode === "hosted"
                      ? [
                          "Smart routing on: simple prompts go to Haiku, hard ones to Opus",
                          "Fallback chain enabled, failed requests retry automatically",
                          "Prepaid credits on our keys, billed at AWS cost + 20%",
                        ]
                      : [
                          "Smart routing on across your provider's models",
                          "Fallback chain enabled, failed requests retry automatically",
                          "You pay your provider directly. Nadir's fee is 25% of what we save you, 10% above $2K a month.",
                        ]
                    ).map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  {mode === "hosted" && (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Hosted keys need a prepaid balance before your first call.
                        Add credits now, or switch to your own provider keys (BYOK)
                        to route for free.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => navigate("/dashboard/billing")}
                      >
                        <CreditCard className="w-4 h-4 mr-2" /> Add credits
                      </Button>
                    </div>
                  )}

                  <Button className="w-full" size="lg" onClick={() => goToStep(1)}>
                    Continue to your first call
                  </Button>

                  <div className="flex justify-center">
                    <button
                      onClick={() => setCreateDialogOpen(true)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                    >
                      Customize routing and providers instead
                    </button>
                  </div>
                </>
              ) : existingKeyPrefix ? (
                <>
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">You already have an API key</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your key starting with <code className="px-1 py-0.5 bg-muted rounded text-xs">{existingKeyPrefix}...</code> is
                    active. For security we can't show it again. You can set up a new key or
                    continue with the one you have.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button onClick={() => setExistingKeyPrefix(null)} disabled={creatingKey}>
                      <Key className="w-4 h-4 mr-2" /> Set up a new key
                    </Button>
                    <Button variant="outline" onClick={() => goToStep(1)}>
                      Continue with my existing key
                    </Button>
                  </div>
                </>
              ) : (
                /* ═══ CHOOSER: explicit BYOK vs Hosted ═══ */
                <div className="space-y-5">
                  <div className="text-center space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">Choose how you want to run Nadir</h2>
                    <p className="text-sm text-muted-foreground">
                      Bring your own keys (BYOK) or use ours. You pay only on what we save you.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Use our keys (hosted) */}
                    <button
                      type="button"
                      onClick={() => setChooserMode("hosted")}
                      className={`relative p-4 border-2 rounded-xl text-left transition-all ${
                        chooserMode === "hosted"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Zap className={`w-4 h-4 ${chooserMode === "hosted" ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="font-semibold text-sm text-foreground">Use our keys</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        We run the keys, nothing to set up. Add prepaid credits to start, then pay only on what we save you.
                      </p>
                      <div className="space-y-1.5">
                        {[
                          "Prepaid credits, billed at AWS cost + 20%",
                          "No provider keys to manage",
                          "Powered by Claude on AWS Bedrock",
                        ].map((b) => (
                          <div key={b} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    </button>

                    {/* Bring your keys (BYOK) */}
                    <button
                      type="button"
                      onClick={() => setChooserMode("byok")}
                      className={`relative p-4 border-2 rounded-xl text-left transition-all ${
                        chooserMode === "byok"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Key className={`w-4 h-4 ${chooserMode === "byok" ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="font-semibold text-sm text-foreground">Bring your keys</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Use your own provider keys. You pay providers directly at your rate.
                      </p>
                      <div className="space-y-1.5">
                        {[
                          "No usage markup, Nadir adds nothing per call",
                          "A savings fee only: 25% of the first $2K saved a month, 10% above",
                          "No base fee. If we save you nothing, you pay nothing.",
                        ].map((b) => (
                          <div key={b} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    </button>
                  </div>

                  {/* BYOK inline provider entry */}
                  {chooserMode === "byok" && (
                    <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-3">
                      <Label className="text-sm font-medium">Add a provider key to start</Label>
                      <div className="flex flex-wrap gap-2">
                        {PROVIDER_FIELDS.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => { setByokProvider(p.key); setByokKey(""); }}
                            className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                              byokProvider === p.key
                                ? "bg-primary/10 border-primary text-primary font-medium"
                                : "bg-muted/30 border-transparent text-muted-foreground hover:border-border"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <Input
                        type="password"
                        autoComplete="off"
                        placeholder={PROVIDER_FIELDS.find((p) => p.key === byokProvider)?.placeholder}
                        value={byokKey}
                        onChange={(e) => setByokKey(e.target.value)}
                      />
                      {byokKey && !isProviderKeyFormatValid(byokProvider, byokKey) && (
                        <p className="text-xs text-destructive">
                          That doesn't look like a {PROVIDER_FIELDS.find((p) => p.key === byokProvider)?.label} key.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Your key is encrypted and used only to route your requests. You can add more providers later.
                      </p>
                    </div>
                  )}

                  {/* Primary CTA depends on the choice */}
                  {chooserMode === "hosted" && (
                    <Button className="w-full" size="lg" onClick={createDefaultKey} disabled={creatingKey}>
                      Start free with our keys
                    </Button>
                  )}
                  {chooserMode === "byok" && (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleCreateByokKey}
                      disabled={creatingKey || !isProviderKeyFormatValid(byokProvider, byokKey)}
                    >
                      Save key and continue
                    </Button>
                  )}

                  <div className="flex justify-center">
                    <button
                      onClick={() => setCreateDialogOpen(true)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                    >
                      Customize routing and providers instead
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 1: First call (test in-page, see savings, then billing) ═══ */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Make your first call</h2>
              <p className="text-sm text-muted-foreground">
                Paste this into your code, or send a test request right here.
              </p>

              <div className="space-y-2">
                <Label>Integration snippet</Label>
                <Tabs defaultValue="python" className="w-full">
                  <TabsList className="w-full justify-start">
                    <TabsTrigger value="python">Python</TabsTrigger>
                    <TabsTrigger value="node">Node.js</TabsTrigger>
                    <TabsTrigger value="curl">cURL</TabsTrigger>
                  </TabsList>
                  {["python", "node", "curl"].map((lang) => (
                    <TabsContent key={lang} value={lang}>
                      <div className="relative">
                        <pre className="text-xs p-4 bg-muted rounded-lg overflow-x-auto border border-border">
                          {getSnippet(lang)}
                        </pre>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2"
                          onClick={() => handleCopy(getSnippet(lang))}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
                <p className="text-xs text-muted-foreground">
                  Works with any OpenAI-compatible SDK. Just change the base URL to https://{NADIR_API_HOST}/v1.
                </p>
              </div>

              {createdApiKey ? (
                <Button onClick={handleTestRequest} disabled={testing} className="w-full" variant="outline">
                  {testing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Routing your request...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-2" /> Send a test request from here</>
                  )}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  We can only send a test from here for a key created in this session. Use the
                  snippet above with your existing key, then check the dashboard for the request.
                </p>
              )}

              {testResult && testResult.ok && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                    <CircleCheck className="w-4 h-4" />
                    <span>
                      200 OK &middot; routed to {testResult.model}
                      {testResult.latencyMs ? <> &middot; {testResult.latencyMs} ms</> : null}
                    </span>
                  </div>
                  {testResult.content && (
                    <p className="text-sm text-foreground italic">"{testResult.content}"</p>
                  )}
                  {testResult.costUsd != null && (
                    <p className="text-xs text-muted-foreground">
                      This request cost ${testResult.costUsd.toFixed(4)}.
                      {testResult.savingsPct != null && testResult.savingsPct > 0 && (
                        <span className="text-foreground font-medium">
                          {" "}Routing saved you {testResult.savingsPct}% vs always using{" "}
                          {testResult.benchmarkModel || "your benchmark model"}.
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}

              {testResult && !testResult.ok && (
                <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl space-y-1">
                  <p className="text-sm font-medium text-destructive">Request failed</p>
                  <p className="text-xs text-muted-foreground break-words">{testResult.message}</p>
                </div>
              )}

              <DailyQuotaBar />

              {billingActive ? (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-2">
                  <CircleCheck className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-sm font-medium text-foreground">
                    Billing active. Unlimited requests unlocked.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Add billing when you're ready</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No monthly fee. You only pay a share of what we save you. Unlocks unlimited
                    requests, semantic cache, context optimization, and priority support.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button size="sm" onClick={handleSubscribe} disabled={subscribing}>
                      {subscribing ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Redirecting...</>
                      ) : (
                        "Set up billing"
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">Takes about 30 seconds with Stripe.</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateApiKeyDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreateApiKey}
      />

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => goToStep(0)} disabled={currentStep === 0}>
          Back
        </Button>
        {currentStep === STEPS.length - 1 ? (
          <Button onClick={handleFinish} disabled={!hasKey}>
            Finish Setup
          </Button>
        ) : (
          // The primary CTA lives inside the card on step 0, keep the rail quiet.
          <div />
        )}
      </div>

      {isMobile && (
        <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Finish on your computer?
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Making your first call is easier on a larger screen. We'll
            email a link to {user?.email ?? "your account"} so you can pick up
            right where you left off.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleEmailContinueLink}
            disabled={emailSending || emailSent}
          >
            {emailSending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
            ) : emailSent ? (
              <><CircleCheck className="w-4 h-4 mr-2 text-primary" /> Sent, check your inbox</>
            ) : (
              <><Mail className="w-4 h-4 mr-2" /> Email me a link to continue on desktop</>
            )}
          </Button>
        </div>
      )}

      <div className="flex justify-center">
        <button
          onClick={handleSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
        >
          Skip onboarding for now
        </button>
      </div>
    </div>
  );
};

export default Onboarding;
