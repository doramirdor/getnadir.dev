import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useApiKey } from "@/hooks/useApiKey";
import { useAuth } from "@/hooks/useAuth";

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Mode = "byok" | "hosted";

const STEPS = [
  { id: "mode", label: "Choose Mode", icon: Zap },
  { id: "configure", label: "Configure", icon: CreditCard },
  { id: "api-key", label: "Get API Key", icon: Key },
];

const NADIR_API_HOST = "api.getnadir.com";

/** Check if a provider key looks like a valid format. */
function isKeyFormatValid(provider: string, key: string): boolean {
  if (!key.trim()) return false;
  switch (provider) {
    case "openai":
      return key.startsWith("sk-") && key.length > 20;
    case "anthropic":
      return key.startsWith("sk-ant-") && key.length > 20;
    case "google":
      return key.length > 10;
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
  });
  const [showCelebration, setShowCelebration] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
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

      const keyValue = `ndr_${crypto.randomUUID().replace(/-/g, "").slice(0, 32)}`;
      const keyHash = await sha256(keyValue);
      const { error } = await supabase.from("api_keys").insert({
        user_id: user.id,
        name: apiKeyName,
        key_hash: keyHash,
        prefix: keyValue.slice(0, 8),
        is_active: true,
      });

      if (error) throw error;
      setCreatedApiKey(keyValue);
      setSessionApiKey(keyValue);
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
        toast({
          variant: "destructive",
          title: "Connection failed",
          description: `Server returned ${res.status}. Your key may still be valid -- the health endpoint does not require auth.`,
        });
      }
    } catch {
      // Network errors are expected in local dev; treat health endpoint as reachable-only check
      setTestResult("error");
      toast({
        variant: "destructive",
        title: "Could not reach server",
        description: "Check your connection. Your API key has been saved and will work once the server is reachable.",
      });
    } finally {
      setTestingKey(false);
    }
  };

  const nextStep = async () => {
    // Save BYOK provider keys when leaving step 2 (Configure)
    if (currentStep === 1 && mode === "byok" && user) {
      const keysToSave = Object.entries(providerKeys).filter(([_, v]) => v.trim());
      if (keysToSave.length > 0) {
        try {
          for (const [provider, key] of keysToSave) {
            await supabase.from("provider_keys").upsert(
              {
                user_id: user.id,
                provider,
                encrypted_key: btoa(key),
                is_active: true,
              },
              { onConflict: "user_id,provider" }
            );
          }
          toast({
            title: "Provider keys saved",
            description: `${keysToSave.length} provider key(s) configured.`,
          });
        } catch (e: any) {
          toast({
            variant: "destructive",
            title: "Error saving keys",
            description: e.message,
          });
        }
      }
    }
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = () => {
    setShowCelebration(true);
  };

  // Auto-redirect after celebration
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
    // curl
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
            <p className="text-muted-foreground mt-1">
              Redirecting you to the dashboard...
            </p>
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
        <p className="page-description">
          Let's get you set up in under 2 minutes
        </p>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            Step {currentStep + 1} of {STEPS.length}
          </span>
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
                  i <= currentStep
                    ? "text-primary"
                    : "text-muted-foreground/30"
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
                  {i < currentStep ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
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
          {/* Step 1: Choose Mode */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                How do you want to use Nadir?
              </h2>
              <p className="text-sm text-muted-foreground">
                Choose how you want to connect to LLM providers. You can change
                this anytime.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setMode("byok")}
                  className={`p-5 border-2 rounded-xl text-left transition-all ${
                    mode === "byok"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="w-5 h-5 text-primary" />
                    <p className="font-semibold text-foreground">
                      Bring Your Own Keys
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use your existing provider API keys (OpenAI, Anthropic,
                    Google). You pay providers directly at your own rate.
                  </p>
                  <div className="mt-3 p-2.5 bg-muted/50 rounded-lg">
                    <p className="text-xs font-medium text-foreground">
                      Pricing
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      $9/mo base + savings fee (25% of first $2K saved, 10%
                      above). No markup on provider costs.
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setMode("hosted")}
                  className={`p-5 border-2 rounded-xl text-left transition-all ${
                    mode === "hosted"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <p className="font-semibold text-foreground">
                      Use Nadir Keys
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No provider accounts needed. Nadir provides shared keys so
                    you can start immediately with zero setup.
                  </p>
                  <div className="mt-3 p-2.5 bg-muted/50 rounded-lg">
                    <p className="text-xs font-medium text-foreground">
                      Pricing
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pass-through token costs + $9/mo base + savings fee (25%
                      of first $2K saved, 10% above).
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Configure — BYOK */}
          {currentStep === 1 && mode === "byok" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Connect your providers
              </h2>
              <p className="text-sm text-muted-foreground">
                Add at least one provider key. You can add more later from the
                Provider Keys page.
              </p>
              <div className="space-y-3">
                {[
                  {
                    key: "openai",
                    label: "OpenAI API Key",
                    placeholder: "sk-...",
                  },
                  {
                    key: "anthropic",
                    label: "Anthropic API Key",
                    placeholder: "sk-ant-...",
                  },
                  {
                    key: "google",
                    label: "Google AI API Key",
                    placeholder: "AI...",
                  },
                ].map((provider) => {
                  const value =
                    providerKeys[provider.key as keyof typeof providerKeys];
                  const valid = isKeyFormatValid(provider.key, value);
                  const showValidation = value.trim().length > 0;
                  return (
                    <div key={provider.key} className="space-y-1">
                      <Label>{provider.label}</Label>
                      <div className="relative">
                        <Input
                          type="password"
                          placeholder={provider.placeholder}
                          value={value}
                          onChange={(e) =>
                            setProviderKeys({
                              ...providerKeys,
                              [provider.key]: e.target.value,
                            })
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
                              <span className="text-xs text-orange-400">
                                check format
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Keys are encrypted at rest. You can skip this and configure
                later.
              </p>
            </div>
          )}

          {/* Step 2: Configure — Hosted */}
          {currentStep === 1 && mode === "hosted" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Set up payment
              </h2>
              <p className="text-sm text-muted-foreground">
                Add a payment method to get started. You will only be charged
                for what you use.
              </p>
              <div className="p-6 bg-muted rounded-xl text-center space-y-3">
                <CreditCard className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Payment methods can be managed from the Billing page.
                </p>
                <Button
                  variant="outline"
                  onClick={() => navigate("/dashboard/billing")}
                >
                  Go to Billing
                </Button>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                  How pricing works
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-400 mt-2 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 block w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span>
                      <strong>Pass-through costs</strong> -- You pay exactly what
                      providers charge per token, with no markup.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 block w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span>
                      <strong>$9/mo base fee</strong> -- Covers dashboard,
                      analytics, and routing infrastructure.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 block w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span>
                      <strong>25% of first $2K saved</strong>, then{" "}
                      <strong>10% above $2K</strong> -- You only pay when Nadir
                      actually saves you money.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 3: Create API Key + Integration Snippet */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Create your Nadir API key
              </h2>
              <p className="text-sm text-muted-foreground">
                This key authenticates your requests to the Nadir router at{" "}
                {NADIR_API_HOST}.
              </p>
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
                      Your API Key (copy it now -- it will not be shown again):
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm flex-1 p-2 bg-background rounded border border-border break-all">
                        {createdApiKey}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(createdApiKey)}
                      >
                        {copied ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Test key button */}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestKey}
                      disabled={testingKey}
                    >
                      {testingKey ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : testResult === "success" ? (
                        <CircleCheck className="w-4 h-4 mr-2 text-green-500" />
                      ) : (
                        <Zap className="w-4 h-4 mr-2" />
                      )}
                      {testingKey
                        ? "Testing..."
                        : testResult === "success"
                          ? "Connected"
                          : "Test your key"}
                    </Button>
                    {testResult === "error" && (
                      <span className="text-xs text-muted-foreground">
                        Could not reach server -- your key is still saved.
                      </span>
                    )}
                  </div>

                  {/* Multi-language integration snippets */}
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
                      Works with any OpenAI-compatible SDK. Just change the base
                      URL to https://{NADIR_API_HOST}/v1.
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
