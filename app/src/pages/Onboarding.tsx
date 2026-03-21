import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, ChevronRight, Key, Zap, CreditCard, Copy, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useApiKey } from "@/hooks/useApiKey";

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

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [mode, setMode] = useState<Mode>("byok");
  const [apiKeyName, setApiKeyName] = useState("Default Key");
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [providerKeys, setProviderKeys] = useState({ openai: "", anthropic: "", google: "" });
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setApiKey: setSessionApiKey } = useApiKey();

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  const handleCreateApiKey = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const keyValue = `ndr_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`;
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
      toast({ title: "API Key Created", description: "Your API key is ready to use." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nextStep = () => {
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
    navigate("/dashboard");
    toast({ title: "Welcome to Nadir!", description: "Your setup is complete." });
  };

  const integrationSnippet = `import openai

client = openai.OpenAI(
    base_url="https://${NADIR_API_HOST}/v1",
    api_key="${createdApiKey || '<YOUR_NADIR_API_KEY>'}",
)

response = client.chat.completions.create(
    model="auto",  # Nadir picks the best model
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="page-title">Welcome to Nadir</h1>
        <p className="page-description">Get set up in 3 steps</p>
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
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  i < currentStep ? "bg-primary text-primary-foreground" :
                  i === currentStep ? "bg-primary/10 text-primary ring-2 ring-primary" :
                  "bg-muted"
                }`}>
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

          {/* Step 1: Choose Mode */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">How do you want to use Nadir?</h2>
              <p className="text-sm text-muted-foreground">
                You can bring your own provider API keys or let Nadir handle everything.
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
                    Use your existing provider API keys. Nadir charges a routing fee only -- you pay providers directly.
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
                    No key setup needed. Pay per token with pass-through pricing plus a savings-based fee.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Configure */}
          {currentStep === 1 && mode === "byok" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Connect your providers</h2>
              <p className="text-sm text-muted-foreground">
                Add at least one provider key. You can add more later from the Integrations page.
              </p>
              <div className="space-y-3">
                {[
                  { key: "openai", label: "OpenAI API Key", placeholder: "sk-..." },
                  { key: "anthropic", label: "Anthropic API Key", placeholder: "sk-ant-..." },
                  { key: "google", label: "Google AI API Key", placeholder: "AI..." },
                ].map((provider) => (
                  <div key={provider.key} className="space-y-1">
                    <Label>{provider.label}</Label>
                    <Input
                      type="password"
                      placeholder={provider.placeholder}
                      value={providerKeys[provider.key as keyof typeof providerKeys]}
                      onChange={(e) => setProviderKeys({ ...providerKeys, [provider.key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Keys are encrypted at rest. You can skip this and configure later.
              </p>
            </div>
          )}

          {currentStep === 1 && mode === "hosted" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Set up payment</h2>
              <p className="text-sm text-muted-foreground">
                Add a payment method to get started. You will only be charged for what you use.
              </p>
              <div className="p-6 bg-muted rounded-xl text-center space-y-3">
                <CreditCard className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Payment methods can be managed from the Billing page.
                </p>
                <Button variant="outline" onClick={() => navigate("/billing")}>
                  Go to Billing
                </Button>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-sm text-blue-800 font-medium">Pricing</p>
                <ul className="text-sm text-blue-700 mt-1 space-y-1">
                  <li>Pass-through token costs (what providers charge)</li>
                  <li>$9/mo base + 25% of first $2K saved, 10% above</li>
                  <li>You only pay for savings Nadir actually generates</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 3: Create API Key + Integration Snippet */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Create your Nadir API key</h2>
              <p className="text-sm text-muted-foreground">
                This key authenticates your requests to the Nadir router at {NADIR_API_HOST}.
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
                    <p className="text-sm text-primary font-medium mb-2">Your API Key (copy it now -- it will not be shown again):</p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm flex-1 p-2 bg-background rounded border border-border break-all">{createdApiKey}</code>
                      <Button size="sm" variant="outline" onClick={() => handleCopy(createdApiKey)}>
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Integration snippet */}
                  <div className="space-y-2">
                    <Label>Integration snippet (Python)</Label>
                    <div className="relative">
                      <pre className="text-xs p-4 bg-muted rounded-lg overflow-x-auto border border-border">
                        {integrationSnippet}
                      </pre>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute top-2 right-2"
                        onClick={() => handleCopy(integrationSnippet)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
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
