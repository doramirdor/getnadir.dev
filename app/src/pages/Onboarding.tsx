import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle,
  ChevronRight,
  Key,
  Zap,
  Copy,
  Check,
  Loader2,
  CircleCheck,
  Sparkles,
  Gift,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useApiKey } from "@/hooks/useApiKey";
import { useAuth } from "@/hooks/useAuth";
import { trackOnboardingStep, trackOnboardingComplete, trackApiKeyCreated } from "@/utils/analytics";
import CreateApiKeyDialog from "@/components/CreateApiKeyDialog";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Mode = "byok" | "hosted";

// Two-step onboarding: subscribe (Pro trial offer) → configure & create key.
// Mode selection, provider keys, routing, and fallback configuration all live
// inside the CreateApiKeyDialog wizard so the user actually configures their
// key (rather than getting an empty one with no routing/fallbacks set).
const STEPS = [
  { id: "subscribe", label: "Start Pro trial", icon: Gift },
  { id: "api-key", label: "Configure API Key", icon: Key },
];

const NADIR_API_HOST = "api.getnadir.com";

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [mode, setMode] = useState<Mode>("byok");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setApiKey: setSessionApiKey } = useApiKey();
  const { user } = useAuth();

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  // Called by CreateApiKeyDialog with the full configured key payload.
  // The dialog has already saved any new BYOK provider keys via JWT; this
  // handler just inserts the api_keys row with the user's full config
  // (selected models, routing tier assignments, fallback chain).
  const handleCreateApiKey = async (config: {
    name: string;
    selected_models: string[];
    benchmark_model: string;
    model_parameters: Record<string, any>;
  }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const keyValue = `ndr_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
    const keyHash = await sha256(keyValue);

    const { error } = await supabase.from("api_keys").insert({
      user_id: user.id,
      name: config.name,
      key_hash: keyHash,
      prefix: keyValue.slice(0, 8),
      is_active: true,
      selected_models: config.selected_models,
      benchmark_model: config.benchmark_model,
      model_parameters: config.model_parameters,
    });

    if (error) throw error;
    setMode((config.model_parameters?.key_mode as Mode) || "byok");
    setCreatedApiKey(keyValue);
    setSessionApiKey(keyValue);
    trackApiKeyCreated("onboarding");
    toast({
      title: "API Key Created",
      description: "Your key is configured and ready to use.",
    });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestKey = async () => {
    if (!createdApiKey) return;
    setTestingKey(true);
    setTestResult(null);
    try {
      const res = await fetch(`https://${NADIR_API_HOST}/health`, {
        headers: { "X-API-Key": createdApiKey },
      });
      if (res.ok) {
        setTestResult("success");
        toast({ title: "Connection successful", description: "Your key is working." });
      } else {
        setTestResult("error");
      }
    } catch {
      setTestResult("error");
    } finally {
      setTestingKey(false);
    }
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      // Use Supabase JWT to call billing — no API key needed yet
      const res = await fetch(`${API_BASE}/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan_id: "pro",
          promo_code: "FIRST1",
          success_url: `${window.location.origin}/dashboard/onboarding?subscribed=true`,
          // If Stripe cancels, return to the Subscribe step (now step 0).
          cancel_url: `${window.location.origin}/dashboard/onboarding?step=0`,
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

  // Handle return from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscribed") === "true") {
      // User just came back from Stripe checkout. Advance to the API key
      // configuration step (the only step left in the new 2-step flow).
      setCurrentStep(1);
      toast({ title: "Pro trial active!", description: "30 days of full Pro access. Let's finish setting up." });
      // Clean URL
      window.history.replaceState({}, "", "/dashboard/onboarding");
    }
    // Came back from the in-dialog Pro upgrade (user picked Hosted mid-wizard).
    // Re-open the create dialog on the API key step so they can finish.
    if (params.get("upgraded") === "true") {
      setCurrentStep(1);
      setCreateDialogOpen(true);
      toast({ title: "Pro trial active", description: "Finish creating your Hosted API key." });
      window.history.replaceState({}, "", "/dashboard/onboarding");
    }
    const stepParam = params.get("step");
    if (stepParam) {
      setCurrentStep(parseInt(stepParam, 10));
      window.history.replaceState({}, "", "/dashboard/onboarding");
    }
  }, []);

  const nextStep = async () => {
    if (currentStep < STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      trackOnboardingStep(next, STEPS[next].id);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleFinish = () => {
    trackOnboardingComplete(mode);
    setShowCelebration(true);
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
        <p className="page-description">Let's get you set up in under 2 minutes</p>
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
          {/* ═══ STEP 0: Default to Free, Pro trial is secondary (Option A) ═══
              Free tier already delivers the core product (routing, dashboard,
              analytics, unlimited BYOK). Defaulting here removes the Stripe
              Checkout card wall that was the #1 abandonment point — users get
              into the dashboard, make their first call, see real savings, then
              we upsell Pro with their own data as the pitch. */}
          {currentStep === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-foreground">Welcome — let's get you routing</h2>
              <p className="text-sm text-muted-foreground">
                You're on the Free plan. Make your first call, see real savings in the dashboard, upgrade to Pro when it's worth it.
              </p>

              {/* What's included on Free */}
              <div className="p-5 bg-primary/5 border border-primary/15 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Free plan &middot; active now</span>
                  <span className="text-xs text-muted-foreground">Cancel anytime</span>
                </div>
                <div className="space-y-2">
                  {[
                    "Hosted proxy on api.getnadir.com",
                    "Intelligent routing across all major LLM providers",
                    "Unlimited requests with your own API keys (BYOK)",
                    "50 requests/mo on our shared keys",
                    "Web dashboard with real savings analytics",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Primary CTA — continue to dashboard on Free */}
              <Button className="w-full" size="lg" onClick={nextStep}>
                Continue to dashboard
              </Button>

              {/* Secondary — optional Pro trial for users who are already sold */}
              <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Already sure you want Pro?</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Start a 30-day Pro trial now — adds semantic cache, context optimization, fallback chains, and priority support. Uses promo code <code className="bg-background px-1.5 py-0.5 rounded font-mono font-bold">FIRST1</code> so your first month is $0.
                </p>
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  className="text-sm font-medium text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {subscribing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Redirecting to checkout...</>
                  ) : (
                    <>Start 30-day Pro trial <span>›</span></>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP 1: Configure & create API key (full wizard) ═══
              We deliberately use the same multi-step CreateApiKeyDialog wizard
              that lives on the API Keys page. Generating an "empty" default
              key during onboarding is misleading — the meaningful work is
              choosing providers, routing tiers, and fallback chains. The
              dialog walks the user through all of that. */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Configure your Nadir API key</h2>
              <p className="text-sm text-muted-foreground">
                Pick your providers, set up routing across model tiers, and configure a fallback chain. Your key authenticates requests to {NADIR_API_HOST}.
              </p>

              {createdApiKey ? (
                <div className="space-y-4">
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                    <p className="text-sm text-primary font-medium mb-2">
                      Your API Key (copy it now, it won't be shown again):
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

                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={handleTestKey} disabled={testingKey}>
                      {testingKey ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : testResult === "success" ? (
                        <CircleCheck className="w-4 h-4 mr-2 text-green-500" />
                      ) : (
                        <Zap className="w-4 h-4 mr-2" />
                      )}
                      {testingKey ? "Testing..." : testResult === "success" ? "Connected" : "Test your key"}
                    </Button>
                  </div>

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
                </div>
              ) : (
                <Button onClick={() => setCreateDialogOpen(true)} size="lg">
                  <Key className="w-4 h-4 mr-2" /> Configure & generate key
                </Button>
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
        <Button variant="outline" onClick={prevStep} disabled={currentStep === 0}>
          Back
        </Button>
        {currentStep === STEPS.length - 1 ? (
          <Button onClick={handleFinish} disabled={!createdApiKey}>
            Finish Setup
          </Button>
        ) : currentStep === 0 ? (
          // Subscribe step — the main CTA ("Start 30-day Pro trial") lives
          // inside the card, so the nav rail stays quiet here.
          <div />
        ) : (
          <Button onClick={nextStep}>
            Continue <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
