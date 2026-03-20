import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, ChevronRight, Key, Zap, Play, CreditCard, Building2 } from "lucide-react";
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

const STEPS = [
  { id: "account", label: "Account Type", icon: Building2 },
  { id: "providers", label: "Connect Providers", icon: Zap },
  { id: "api-key", label: "Create API Key", icon: Key },
  { id: "test", label: "Test in Playground", icon: Play },
  { id: "billing", label: "Billing", icon: CreditCard },
];

const Onboarding = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [accountType, setAccountType] = useState<"individual" | "team">("individual");
  const [apiKeyName, setApiKeyName] = useState("Default Key");
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
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
        key_preview: `${keyValue.slice(0, 8)}...${keyValue.slice(-4)}`,
        status: "active",
      });

      if (error) throw error;
      setCreatedApiKey(keyValue);
      setSessionApiKey(keyValue);
      toast({ title: "API Key Created", description: "Your API key is ready to use." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="page-title">Welcome to Nadir</h1>
        <p className="page-description">Let's get you set up in a few easy steps</p>
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
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card className="clean-card">
        <CardContent className="pt-6 space-y-4">
          {/* Step 0: Account Type */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Choose your account type</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setAccountType("individual")}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    accountType === "individual" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="font-semibold text-foreground">Individual</p>
                  <p className="text-sm text-muted-foreground">Personal projects and experimentation</p>
                </button>
                <button
                  onClick={() => setAccountType("team")}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    accountType === "team" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="font-semibold text-foreground">Team</p>
                  <p className="text-sm text-muted-foreground">Collaborate with your organization</p>
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Connect Providers */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Connect your LLM providers (optional)</h2>
              <p className="text-sm text-muted-foreground">
                Bring your own keys for direct provider access, or skip to use Nadir's default routing.
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
            </div>
          )}

          {/* Step 2: Create API Key */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Create your Nadir API key</h2>
              <p className="text-sm text-muted-foreground">This key authenticates your requests to the Nadir router.</p>
              <div className="space-y-2">
                <Label>Key Name</Label>
                <Input
                  value={apiKeyName}
                  onChange={(e) => setApiKeyName(e.target.value)}
                  placeholder="My API Key"
                />
              </div>
              {createdApiKey ? (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                  <p className="text-sm text-primary font-medium">Your API Key (copy it now — it won't be shown again):</p>
                  <code className="text-sm block mt-2 p-2 bg-background rounded border border-border break-all">{createdApiKey}</code>
                </div>
              ) : (
                <Button onClick={handleCreateApiKey}>
                  <Key className="w-4 h-4 mr-2" /> Generate API Key
                </Button>
              )}
            </div>
          )}

          {/* Step 3: Test */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Test your setup</h2>
              <p className="text-sm text-muted-foreground">Head to the Playground to send your first request.</p>
              <Button onClick={() => navigate("/playground")}>
                <Play className="w-4 h-4 mr-2" /> Open Playground
              </Button>
            </div>
          )}

          {/* Step 4: Billing */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Choose your plan</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: "Free", price: "$0/mo", features: ["1,000 requests/mo", "1 expert model", "5 clusters"] },
                  { name: "Developer", price: "$29/mo", features: ["50,000 requests/mo", "5 expert models", "20 clusters"] },
                ].map((plan) => (
                  <div key={plan.name} className="p-4 border border-border rounded-xl">
                    <p className="font-semibold text-foreground">{plan.name}</p>
                    <p className="text-2xl font-bold mt-1 text-foreground">{plan.price}</p>
                    <ul className="mt-3 space-y-1">
                      {plan.features.map((f) => (
                        <li key={f} className="text-sm text-muted-foreground flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-primary" /> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">You can always upgrade later from the Billing page.</p>
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
          <Button onClick={handleFinish}>
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
