/**
 * CreateApiKeyDialog — 4-step wizard for creating an API key.
 *
 * Flow:
 *  1. Name & Mode (BYOK / Hosted)
 *  2. Routing — toggle + model tier assignment (simple/medium/complex)
 *  3. Fallback — toggle + chain order
 *  4. Overview & Create
 */
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Key,
  Zap,
  ChevronRight,
  ChevronLeft,
  Check,
  Brain,
  Shield,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──────────────────────────────────────────────────────────────

type IntegrationMode = "byok" | "hosted";

interface ModelDef {
  id: string;
  name: string;
  inputCost: number;
  outputCost: number;
}

interface CreateApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (config: {
    name: string;
    selected_models: string[];
    benchmark_model: string;
    model_parameters: Record<string, any>;
  }) => Promise<void>;
}

// ── Model catalog ──────────────────────────────────────────────────────

const MODELS_BY_PROVIDER: Record<string, ModelDef[]> = {
  anthropic: [
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", inputCost: 1, outputCost: 5 },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", inputCost: 3, outputCost: 15 },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", inputCost: 5, outputCost: 25 },
  ],
  openai: [
    { id: "gpt-4o-mini", name: "GPT-4o Mini", inputCost: 0.15, outputCost: 0.6 },
    { id: "gpt-4o", name: "GPT-4o", inputCost: 2.5, outputCost: 10 },
    { id: "gpt-5-mini", name: "GPT-5 Mini", inputCost: 0.25, outputCost: 2 },
    { id: "gpt-5.4", name: "GPT-5.4", inputCost: 2.5, outputCost: 15 },
  ],
  google: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", inputCost: 0.1, outputCost: 0.4 },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", inputCost: 1.25, outputCost: 10 },
  ],
};

// Hosted = only Bedrock (Anthropic Claude models)
const HOSTED_MODELS: ModelDef[] = [
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", inputCost: 1, outputCost: 5 },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", inputCost: 3, outputCost: 15 },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", inputCost: 5, outputCost: 25 },
];

const PROVIDER_DISPLAY: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "amazon-bedrock": "Amazon Bedrock",
};

const STEP_TITLES = [
  "Name & Mode",
  "Routing & Models",
  "Fallback Chains",
  "Review & Create",
];

function blendedCost(m: ModelDef): number {
  return m.inputCost + m.outputCost;
}

function pricingLabel(m: ModelDef): string {
  const fmt = (v: number) => (v < 1 ? `$${v.toFixed(2)}` : `$${v}`);
  return `${fmt(m.inputCost)} / ${fmt(m.outputCost)} per 1M`;
}

// ── Component ──────────────────────────────────────────────────────────

export default function CreateApiKeyDialog({ open, onClose, onCreate }: CreateApiKeyDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Step 1
  const [keyName, setKeyName] = useState("");
  const [nameError, setNameError] = useState("");
  const [mode, setMode] = useState<IntegrationMode>("hosted");
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Step 2: Routing + models
  const [routingEnabled, setRoutingEnabled] = useState(true);
  const [simpleModel, setSimpleModel] = useState("");
  const [mediumModel, setMediumModel] = useState("");
  const [complexModel, setComplexModel] = useState("");

  // Step 3: Fallback
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [fallbackChain, setFallbackChain] = useState<string[]>([]);

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // ── Reset ──
  useEffect(() => {
    if (open) {
      setStep(0);
      setKeyName("");
      setNameError("");
      setSimpleModel("");
      setMediumModel("");
      setComplexModel("");
      setRoutingEnabled(true);
      setFallbackEnabled(true);
      setFallbackChain([]);
      setSubmitting(false);
      fetchProviderKeys();
      fetchUserMode();
    }
  }, [open]);

  const fetchProviderKeys = async () => {
    if (!user?.id) return;
    setLoadingProviders(true);
    try {
      const { data } = await supabase
        .from("provider_keys")
        .select("provider")
        .eq("user_id", user.id);
      setConfiguredProviders(data?.map((d) => d.provider) || []);
    } catch {
      setConfiguredProviders([]);
    } finally {
      setLoadingProviders(false);
    }
  };

  const fetchUserMode = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("model_parameters")
        .eq("id", user.id)
        .single();
      const saved = data?.model_parameters?.key_mode;
      if (saved === "byok" || saved === "hosted") setMode(saved);
    } catch {}
  };

  // ── Available models ──
  const availableModels: ModelDef[] = useMemo(() => {
    if (mode === "hosted") return HOSTED_MODELS;
    const models: ModelDef[] = [];
    for (const provider of configuredProviders) {
      if (MODELS_BY_PROVIDER[provider]) {
        models.push(...MODELS_BY_PROVIDER[provider]);
      }
    }
    return models;
  }, [mode, configuredProviders]);

  // Sorted by cost for dropdowns
  const sortedModels = useMemo(
    () => [...availableModels].sort((a, b) => blendedCost(a) - blendedCost(b)),
    [availableModels]
  );

  const getModel = (id: string) => availableModels.find((m) => m.id === id);

  // ── Auto-suggest tiers when models available ──
  useEffect(() => {
    if (sortedModels.length >= 2 && !simpleModel && !complexModel) {
      setSimpleModel(sortedModels[0].id);
      setComplexModel(sortedModels[sortedModels.length - 1].id);
      if (sortedModels.length >= 3) {
        setMediumModel(sortedModels[Math.floor(sortedModels.length / 2)].id);
      }
    }
  }, [sortedModels]);

  // ── Build selected models list ──
  const selectedModelIds = useMemo(() => {
    const ids = new Set<string>();
    if (routingEnabled) {
      if (simpleModel) ids.add(simpleModel);
      if (mediumModel) ids.add(mediumModel);
      if (complexModel) ids.add(complexModel);
    }
    // Also include fallback models
    for (const id of fallbackChain) ids.add(id);
    return Array.from(ids);
  }, [routingEnabled, simpleModel, mediumModel, complexModel, fallbackChain]);

  // ── Auto-build fallback chain ──
  useEffect(() => {
    if (routingEnabled) {
      // Complex first, then medium, then simple
      const chain: string[] = [];
      if (complexModel) chain.push(complexModel);
      if (mediumModel && mediumModel !== complexModel) chain.push(mediumModel);
      if (simpleModel && !chain.includes(simpleModel)) chain.push(simpleModel);
      setFallbackChain(chain);
    } else if (fallbackChain.length === 0 && sortedModels.length > 0) {
      // No routing: default to all models by cost desc
      setFallbackChain(sortedModels.map((m) => m.id).reverse().slice(0, 3));
    }
  }, [routingEnabled, simpleModel, mediumModel, complexModel]);

  // ── Validation ──
  const canProceedStep = (s: number): boolean => {
    switch (s) {
      case 0:
        return keyName.trim().length >= 1 && (mode === "hosted" || configuredProviders.length > 0);
      case 1:
        if (routingEnabled) return !!simpleModel && !!complexModel;
        return true; // no routing = no model requirements here
      case 2:
        return true;
      default:
        return true;
    }
  };

  const validateStep = (s: number): boolean => {
    if (s === 0) {
      const t = keyName.trim();
      if (t.length < 1 || t.length > 50) { setNameError("Name must be 1-50 characters"); return false; }
      if (!/^[a-zA-Z0-9 _-]+$/.test(t)) { setNameError("Letters, numbers, spaces, dashes, underscores only"); return false; }
      if (mode === "byok" && configuredProviders.length === 0) { setNameError("Configure provider keys in Integrations first"); return false; }
      setNameError("");
      return true;
    }
    return canProceedStep(s);
  };

  const handleNext = () => { if (validateStep(step)) setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1)); };
  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const moveFallback = (idx: number, dir: "up" | "down") => {
    const c = [...fallbackChain];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= c.length) return;
    [c[idx], c[swap]] = [c[swap], c[idx]];
    setFallbackChain(c);
  };

  const addToFallback = (id: string) => {
    if (!fallbackChain.includes(id) && fallbackChain.length < 3) {
      setFallbackChain([...fallbackChain, id]);
    }
  };

  const removeFromFallback = (id: string) => {
    setFallbackChain(fallbackChain.filter((x) => x !== id));
  };

  // ── Create ──
  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const benchmark = complexModel || (sortedModels.length > 0 ? sortedModels[sortedModels.length - 1].id : "");
      await onCreate({
        name: keyName.trim(),
        selected_models: selectedModelIds.length > 0 ? selectedModelIds : sortedModels.map((m) => m.id),
        benchmark_model: benchmark,
        model_parameters: {
          key_mode: mode,
          layers: { routing: routingEnabled, fallback: fallbackEnabled, optimize: "off" as const },
          ...(routingEnabled
            ? {
                tier_models: {
                  simple: simpleModel,
                  ...(mediumModel ? { medium: mediumModel } : {}),
                  complex: complexModel,
                },
              }
            : {}),
          fallback_chain: fallbackEnabled ? fallbackChain : [],
        },
      });
      onClose();
    } catch {} finally {
      setSubmitting(false);
    }
  };

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-1 mb-2">
          {STEP_TITLES.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {/* ═══ STEP 1: Name & Mode ═══ */}
        {step === 0 && (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">API Key Name</Label>
              <Input
                placeholder='e.g. "Production Key"'
                value={keyName}
                onChange={(e) => { setKeyName(e.target.value); setNameError(""); }}
                maxLength={50}
                className={nameError ? "border-red-400" : ""}
                autoFocus
              />
              {nameError && <p className="text-sm text-red-500">{nameError}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Mode</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "byok" as const, icon: Key, label: "BYOK", desc: "Use your own provider API keys" },
                  { id: "hosted" as const, icon: Zap, label: "Hosted", desc: "Use Nadir's Bedrock keys" },
                ].map(({ id, icon: Icon, label, desc }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`p-4 border-2 rounded-xl text-left transition-all ${
                      mode === id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${mode === id ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-semibold text-sm">{label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {mode === "hosted" && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                Powered by AWS Bedrock — currently supporting Anthropic Claude models.
              </div>
            )}

            {mode === "byok" && configuredProviders.length === 0 && !loadingProviders && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                No provider keys configured. Go to <strong>Integrations</strong> to add keys first.
              </div>
            )}
            {mode === "byok" && configuredProviders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {configuredProviders.map((p) => (
                  <Badge key={p} variant="outline" className="text-xs">
                    <Check className="w-3 h-3 mr-1" /> {PROVIDER_DISPLAY[p] || p}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 2: Routing & Models ═══ */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            {/* Routing toggle */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Brain className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Intelligent Routing</p>
                  <p className="text-xs text-muted-foreground">Auto-route prompts by complexity</p>
                </div>
              </div>
              <Switch checked={routingEnabled} onCheckedChange={setRoutingEnabled} />
            </div>

            {routingEnabled ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Assign models to tiers. Simple and Complex are required.
                </p>

                {/* Simple tier */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">Simple</Badge>
                    <span className="text-xs text-muted-foreground">Required — for trivial prompts</span>
                  </div>
                  <Select value={simpleModel} onValueChange={setSimpleModel}>
                    <SelectTrigger><SelectValue placeholder="Select model..." /></SelectTrigger>
                    <SelectContent>
                      {sortedModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} — {pricingLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Medium tier (optional) */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Medium</Badge>
                    <span className="text-xs text-muted-foreground">Optional — if empty, complex handles medium</span>
                  </div>
                  <Select value={mediumModel || "__none__"} onValueChange={(v) => setMediumModel(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="None (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No medium tier</SelectItem>
                      {sortedModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} — {pricingLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Complex tier */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs">Complex</Badge>
                    <span className="text-xs text-muted-foreground">Required — most capable model</span>
                  </div>
                  <Select value={complexModel} onValueChange={setComplexModel}>
                    <SelectTrigger><SelectValue placeholder="Select model..." /></SelectTrigger>
                    <SelectContent>
                      {sortedModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} — {pricingLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(!simpleModel || !complexModel) && (
                  <p className="text-xs text-amber-600">Simple and Complex tiers are required.</p>
                )}
              </>
            ) : (
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <p className="text-sm font-medium">Routing disabled</p>
                <p className="text-xs text-muted-foreground">
                  All prompts will use the same model. Configure your preferred model in the Fallback step.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 3: Fallback Chains ═══ */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50">
                  <Shield className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Enable Fallback Chains</p>
                  <p className="text-xs text-muted-foreground">Auto-retry with backup models on failure</p>
                </div>
              </div>
              <Switch checked={fallbackEnabled} onCheckedChange={setFallbackEnabled} />
            </div>

            {fallbackEnabled && (
              <div className="space-y-3">
                {routingEnabled ? (
                  <p className="text-xs text-muted-foreground">
                    Complex model is primary. Reorder or add up to 3 fallback models.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Choose your models in order. Primary is tried first; fallbacks used on failure. Up to 3 models.
                  </p>
                )}

                {/* Current chain */}
                {fallbackChain.map((id, idx) => {
                  const m = getModel(id);
                  return (
                    <div key={id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 group">
                      <span className="w-5 text-xs text-muted-foreground font-mono">{idx + 1}.</span>
                      <span className="text-sm flex-1 font-medium">{m?.name || id}</span>
                      {m && <span className="text-[10px] text-muted-foreground">{pricingLabel(m)}</span>}
                      {idx === 0 && <Badge className="text-[10px] bg-primary/10 text-primary border-0">Primary</Badge>}
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === 0} onClick={() => moveFallback(idx, "up")}>
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === fallbackChain.length - 1} onClick={() => moveFallback(idx, "down")}>
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                        {!routingEnabled && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => removeFromFallback(id)}>
                            ✕
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Add model (when routing is off) */}
                {!routingEnabled && fallbackChain.length < 3 && (
                  <Select onValueChange={addToFallback}>
                    <SelectTrigger className="border-dashed"><SelectValue placeholder="+ Add model to chain..." /></SelectTrigger>
                    <SelectContent>
                      {sortedModels
                        .filter((m) => !fallbackChain.includes(m.id))
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name} — {pricingLabel(m)}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {!fallbackEnabled && (
              <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                Fallback disabled. If the model fails, the request returns an error.
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 4: Review & Create ═══ */}
        {step === 3 && (
          <div className="space-y-3 py-2">
            <div className="border rounded-lg divide-y">
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium">{keyName}</span>
              </div>
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Mode</span>
                <Badge variant="outline" className="text-xs">{mode === "byok" ? "BYOK" : "Hosted (Bedrock)"}</Badge>
              </div>

              {/* Routing */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Intelligent Routing</span>
                  <Badge variant={routingEnabled ? "default" : "outline"} className="text-xs">
                    {routingEnabled ? "ON" : "OFF"}
                  </Badge>
                </div>
                {routingEnabled && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {simpleModel && (
                      <Badge variant="outline" className="text-xs">
                        {getModel(simpleModel)?.name} <span className="text-green-600 ml-1">(Simple)</span>
                      </Badge>
                    )}
                    {mediumModel && (
                      <Badge variant="outline" className="text-xs">
                        {getModel(mediumModel)?.name} <span className="text-blue-600 ml-1">(Medium)</span>
                      </Badge>
                    )}
                    {complexModel && (
                      <Badge variant="outline" className="text-xs">
                        {getModel(complexModel)?.name} <span className="text-purple-600 ml-1">(Complex)</span>
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Fallback */}
              <div className="p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Fallback Chains</span>
                  <Badge variant={fallbackEnabled ? "default" : "outline"} className="text-xs">
                    {fallbackEnabled ? "ON" : "OFF"}
                  </Badge>
                </div>
                {fallbackEnabled && fallbackChain.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {fallbackChain.map((id, idx) => (
                      <span key={id} className="flex items-center gap-1">
                        <span className="text-xs font-medium">{getModel(id)?.name || id}</span>
                        {idx < fallbackChain.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Benchmark */}
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Benchmark (auto)</span>
                <span className="text-xs font-medium">
                  {getModel(complexModel || sortedModels[sortedModels.length - 1]?.id)?.name || "—"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={handleBack} disabled={submitting}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
            {step < STEP_TITLES.length - 1 ? (
              <Button onClick={handleNext} disabled={!canProceedStep(step)}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? "Creating..." : "Create API Key"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
