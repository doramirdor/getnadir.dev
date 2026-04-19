import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle,
  ChevronRight,
  Key,
  Zap,
  CreditCard,
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

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Mode = "byok" | "hosted";

// Subscribe is the first step — new users land on the 30-day Pro trial
// offer before anything else. Choosing Free / BYOK is still possible (the
// Subscribe step has a "skip" option), but the default path is Pro.
const STEPS = [
  { id: "subscribe", label: "Start Pro trial", icon: Gift },
  { id: "mode", label: "Choose Mode", icon: Zap },
  { id: "api-key", label: "Get API Key", icon: Key },
];

const NADIR_API_HOST = "api.getnadir.com";

function isKeyFormatValid(provider: string, key: string): boolean {
  if (!key.trim()) return false;
  switch (provider) {
    case "openai":
      return key.startsWith("sk-") && key.length > 20;
    case "anthropic":
      return key.startsWith("sk-ant-") && key.length > 20;
    case "google":
      return key.length > 10;
    case "openrouter":
      return key.startsWith("sk-or-") && key.length > 20;
    case "groq":
      return key.startsWith("gsk_") && key.length > 20;
    default:
      return key.length > 10;
  }
}

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [mode, setMode] = useState<Mode>("byok");
  const [apiKeyName, setApiKeyName] = useState("Default Key");
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [providerKeys, setProviderKeys] = useState({
    openai: "",
    anthropic: "",
    google: "",
    openrouter: "",
    groq: "",
  });
  const [showCelebration, setShowCelebration] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setApiKey: setSessionApiKey } = useApiKey();
  const { user } = useAuth();

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const handleCreateApiKey = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Save BYOK provider keys first (via JWT — no API key needed)
      if (mode === "byok") {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Not authenticated");

        const keysToSave = Object.entries(providerKeys).filter(([_, v]) => v.trim());
        for (const [provider, key] of keysToSave) {
          const resp = await fetch(`${API_BASE}/v1/provider-keys/setup`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ provider, api_key: key }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || `Failed to save ${provider} key`);
          }
        }
        if (keysToSave.length > 0) {
          toast({
            title: "Provider keys saved",
            description: `${keysToSave.length} provider key(s) configured.`,
          });
        }
      }

      // Create Nadir API key
      const keyValue = `ndr_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
      const keyHash = await sha256(keyValue);

      const { error } = await supabase.from("api_keys").insert({
        user_id: user.id,
        name: apiKeyName,
        key_hash: keyHash,
        prefix: keyValue.slice(0, 8),
        is_active: true,
        model_parameters: {
          key_mode: mode,
          layers: { routing: true, fallback: true, optimize: "off" },
        },
      });

      if (error) throw error;
      setCreatedApiKey(keyValue);
      setSessionApiKey(keyValue);
      trackApiKeyCreated("onboarding");
      toast({
        title: "API Key Created",
        description: "Your API key is ready to use.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
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
      // User just came back from successful Stripe checkout. Advance past the
      // Subscribe step (step 0) to Choose Mode (step 1); they'll finish at
      // Create API Key (step 2).
      setCurrentStep(1);
      toast({ title: "Pro trial active!", description: "30 days of full Pro access. Let's finish setting up." });
      // Clean URL
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
          {/* ═══ STEP 0: Subscribe (Pro trial first — this is the default path) ═══ */}
          {currentStep === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-foreground">Start your 30-day Pro trial</h2>
              <p className="text-sm text-muted-foreground">
                Full Pro access for 30 days. No credit card required to sign up. We only earn when we cut your bill.
              </p>

              {/* Promo highlight */}
              <div className="p-5 bg-primary/5 border-2 border-primary/20 rounded-xl text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full">
                  <Gift className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">30-day Pro trial</span>
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    <span className="line-through text-muted-foreground text-lg mr-2">$9/mo</span>
                    $0
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    for your first 30 days. Only pay for what we save you after that.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <code className="bg-muted px-2 py-0.5 rounded font-mono font-bold">FIRST1</code>
                  <span>applied automatically</span>
                </div>
              </div>

              {/* What's included */}
              <div className="space-y-2">
                {[
                  "Intelligent routing across all major LLM providers",
                  "Web dashboard with real-time analytics",
                  "Context optimization to reduce token costs",
                  "Automatic fallback chains for reliability",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              {/* Subscribe CTA */}
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubscribe}
                disabled={subscribing}
              >
                {subscribing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting to checkout...</>
                ) : (
                  "Start 30-day Pro trial"
                )}
              </Button>

              {/* Skip to Free */}
              <div className="text-center">
                <button
                  onClick={nextStep}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  Start on Free instead
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP 1: Choose Mode ═══ */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">How do you want to use Nadir?</h2>
              <p className="text-sm text-muted-foreground">
                Choose how you want to connect to LLM providers. You can change this anytime.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setMode("byok")}
                  className={`p-5 border-2 rounded-xl text-left transition-all ${
                    mode === "byok" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="w-5 h-5 text-primary" />
                    <p className="font-semibold text-foreground">Bring Your Own Keys</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use your existing provider API keys (OpenAI, Anthropic, Google). You pay providers directly.
                  </p>
                </button>
                <button
                  onClick={() => setMode("hosted")}
                  className={`p-5 border-2 rounded-xl text-left transition-all ${
                    mode === "hosted" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <p className="font-semibold text-foreground">Use Nadir Keys</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No provider accounts needed. Start immediately with zero setup.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: Create API Key ═══ */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Create your Nadir API key</h2>
              <p className="text-sm text-muted-foreground">
                This key authenticates your requests to the Nadir router at {NADIR_API_HOST}.
              </p>

              {/* BYOK: Provider key inputs */}
              {mode === "byok" && !createdApiKey && (
                <div className="space-y-3 p-4 bg-muted/30 border border-border rounded-xl">
                  <p className="text-sm font-medium text-foreground">Connect your providers</p>
                  <p className="text-xs text-muted-foreground">
                    Add at least one provider key. You can add more later from Integrations.
                  </p>
                  {[
                    { key: "openai", label: "OpenAI API Key", placeholder: "sk-..." },
                    { key: "anthropic", label: "Anthropic API Key", placeholder: "sk-ant-..." },
                    { key: "google", label: "Google AI API Key", placeholder: "AI..." },
                    { key: "openrouter", label: "OpenRouter API Key", placeholder: "sk-or-..." },
                    { key: "groq", label: "Groq API Key", placeholder: "gsk_..." },
                  ].map((provider) => {
                    const value = providerKeys[provider.key as keyof typeof providerKeys];
                    const valid = isKeyFormatValid(provider.key, value);
                    const showValidation = value.trim().length > 0;
                    return (
                      <div key={provider.key} className="space-y-1">
                        <Label className="text-xs">{provider.label}</Label>
                        <div className="relative">
                          <Input
                            type="password"
                            placeholder={provider.placeholder}
                            value={value}
                            onChange={(e) =>
                              setProviderKeys({ ...providerKeys, [provider.key]: e.target.value })
                            }
                            className={
                              showValidation
                                ? valid
                                  ? "pr-9 border-green-400 focus-visible:ring-green-400"
                                  : "pr-9 border-orange-300 focus-visible:ring-orange-300"
                                : ""
                            }
                          />
                          {showValidation && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              {valid ? (
                                <CircleCheck className="w-4 h-4 text-green-500" />
                              ) : (
                                <span className="text-xs text-orange-400">check format</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground">
                    Keys are encrypted at rest.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Key Name</Label>
                <Input
                  value={apiKeyName}
                  onChange={(e) => setApiKeyName(e.target.value)}
                  placeholder="My API Key"
                />
              </div>
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
                <Button onClick={handleCreateApiKey}>
                  <Key className="w-4 h-4 mr-2" /> Generate API Key
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
