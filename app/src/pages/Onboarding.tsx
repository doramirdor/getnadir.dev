import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

// Two-step onboarding: the key is generated for the user with smart defaults
// the moment they land (hosted mode rides the 50 requests/month free
// allowance, so no card and no provider keys are needed), then they make
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

// Module-level guard so React StrictMode double-mount (and quick
// navigate-away-and-back) can't auto-create two keys.
let autoCreateAttempted = false;

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
  const freeLimit = (storedRef && campaignLimits[storedRef]) || 50;
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
      trackApiKeyCreated("onboarding", true);
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

  // Bootstrap: if the user has no keys yet, generate one with smart defaults
  // immediately. If they already have keys (revisit), we can't show the
  // plaintext again, so offer to generate a fresh one instead.
  useEffect(() => {
    if (!user?.id || createdApiKey) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("id, prefix")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);
      if (cancelled) return;
      if (data && data.length > 0) {
        setExistingKeyPrefix(data[0].prefix);
        return;
      }
      if (autoCreateAttempted) return;
      autoCreateAttempted = true;
      await createDefaultKey();
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

  useEffect(() => {
    if (!showCelebration) return;
    const timer = setTimeout(() => {
      navigate("/dashboard");
      toast({ title: "Welcome to Nadir!", description: "Your setup is complete." });
    }, 2400);
    return () => clearTimeout(timer);
  }, [showCelebration, navigate, toast]);

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

  // Celebration overlay
  if (showCelebration) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="relative w-20 h-20 bg-primary rounded-full flex items-center justify-center">
              <Check className="w-10 h-10 text-primary-foreground" strokeWidth={3} />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">You're all set!</h1>
            <p className="text-muted-foreground mt-1">Redirecting you to the dashboard...</p>
          </div>
          <div className="flex justify-center gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
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
        <p className="page-description">Your key is ready. Two quick steps and you're routing.</p>
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
          {/* ═══ STEP 0: Your key (auto-generated with smart defaults) ═══ */}
          {currentStep === 0 && (
            <div className="space-y-5">
              {creatingKey ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Generating your key with smart defaults...
                  </p>
                </div>
              ) : createdApiKey ? (
                <>
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Your API key is ready</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We created it with smart defaults. {freeLimit} free requests included, no card and no
                    provider keys needed.
                  </p>

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
                    {[
                      "Smart routing on: simple prompts go to Haiku, hard ones to Opus",
                      "Fallback chain enabled, failed requests retry automatically",
                      `${freeLimit} free requests on our keys, then bring your own or upgrade`,
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

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
                    active. For security we can't show it again, but you can generate a fresh one
                    with smart defaults in one click.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button onClick={createDefaultKey} disabled={creatingKey}>
                      <Key className="w-4 h-4 mr-2" /> Generate a fresh key
                    </Button>
                    <Button variant="outline" onClick={() => goToStep(1)}>
                      Continue with my existing key
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading your account...</p>
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
