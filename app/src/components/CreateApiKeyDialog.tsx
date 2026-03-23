/**
 * CreateApiKeyDialog — Multi-step wizard for creating an API key with full
 * model/routing/fallback configuration.
 *
 * Steps:
 *  1. Name & Mode (BYOK / Hosted)
 *  2. Model Selection (based on provider keys or hosted catalog)
 *  3. Tier Assignment (simple / medium / complex)
 *  4. Fallback Configuration
 *  5. Review & Create
 */
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  GripVertical,
  Brain,
  Shield,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──────────────────────────────────────────────────────────────

type IntegrationMode = "byok" | "hosted";
type TierName = "simple" | "medium" | "complex";

interface ModelDef {
  id: string;
  name: string;
  inputCost: number;  // per 1M input tokens
  outputCost: number; // per 1M output tokens
}

interface CreateApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the raw API key string + config so the parent can persist it */
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

// Hosted mode: only Bedrock models (what Nadir currently supports)
const HOSTED_MODELS: ModelDef[] = [
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", inputCost: 1, outputCost: 5 },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", inputCost: 3, outputCost: 15 },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", inputCost: 5, outputCost: 25 },
];

// For backwards compat
const ALL_HOSTED_MODELS = HOSTED_MODELS;

// ── Helpers ─────────────────────────────────────────────────────────────

function blendedCost(m: ModelDef): number {
  return m.inputCost + m.outputCost;
}

function formatCost(v: number): string {
  return v < 1 ? `$${v.toFixed(2)}` : `$${v}`;
}

function pricingLabel(m: ModelDef): string {
  return `${formatCost(m.inputCost)} / ${formatCost(m.outputCost)} per 1M tokens`;
}

const PROVIDER_DISPLAY: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "amazon-bedrock": "Amazon Bedrock",
};

const STEP_TITLES = [
  "Name & Mode",
  "Model Selection",
  "Tier Assignment",
  "Fallback Configuration",
  "Review & Create",
];

// ── Component ──────────────────────────────────────────────────────────

export default function CreateApiKeyDialog({ open, onClose, onCreate }: CreateApiKeyDialogProps) {
  const { user } = useAuth();

  // Step navigation
  const [step, setStep] = useState(0);

  // Step 1: Name & Mode
  const [keyName, setKeyName] = useState("");
  const [nameError, setNameError] = useState("");
  const [mode, setMode] = useState<IntegrationMode>("hosted");

  // Provider keys (fetched from Supabase)
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Step 2: Model selection
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

  // Step 3: Tier assignment
  const [tierModels, setTierModels] = useState<Record<TierName, string>>({
    simple: "",
    medium: "",
    complex: "",
  });

  // Step 4: Fallback
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [fallbackChain, setFallbackChain] = useState<string[]>([]);

  // Layers
  const [routingEnabled, setRoutingEnabled] = useState(true);
  const [optimizeMode, setOptimizeMode] = useState<"off" | "safe" | "aggressive">("off");

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // ── Reset state when dialog opens ────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep(0);
      setKeyName("");
      setNameError("");
      setSelectedModelIds([]);
      setTierModels({ simple: "", medium: "", complex: "" });
      setFallbackEnabled(true);
      setFallbackChain([]);
      setRoutingEnabled(true);
      setOptimizeMode("off");
      setSubmitting(false);
      fetchProviderKeys();
      fetchUserMode();
    }
  }, [open]);

  // ── Fetch user's configured provider keys ────────────────────────────
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

  // ── Fetch user's saved mode from profile ─────────────────────────────
  const fetchUserMode = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("model_parameters")
        .eq("id", user.id)
        .single();
      const saved = data?.model_parameters?.key_mode;
      if (saved === "byok" || saved === "hosted") {
        setMode(saved);
      }
    } catch {
      // keep default
    }
  };

  // ── Available models based on mode + provider keys ───────────────────
  const availableModels: ModelDef[] = useMemo(() => {
    if (mode === "hosted") return ALL_HOSTED_MODELS;
    const models: ModelDef[] = [];
    for (const provider of configuredProviders) {
      if (provider === "amazon-bedrock") {
        models.push(...BEDROCK_MODELS);
      } else if (MODELS_BY_PROVIDER[provider]) {
        models.push(...MODELS_BY_PROVIDER[provider]);
      }
    }
    return models;
  }, [mode, configuredProviders]);

  // Group available models by provider for display
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelDef[]> = {};
    for (const m of availableModels) {
      // Derive provider from model id
      let provider = "other";
      if (m.id.startsWith("bedrock/")) provider = "amazon-bedrock";
      else if (m.id.startsWith("claude")) provider = "anthropic";
      else if (m.id.startsWith("gpt") || m.id.startsWith("o3") || m.id.startsWith("o4")) provider = "openai";
      else if (m.id.startsWith("gemini")) provider = "google";
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(m);
    }
    return groups;
  }, [availableModels]);

  // ── Selected model objects sorted by price ───────────────────────────
  const selectedModels = useMemo(
    () =>
      availableModels
        .filter((m) => selectedModelIds.includes(m.id))
        .sort((a, b) => blendedCost(a) - blendedCost(b)),
    [availableModels, selectedModelIds]
  );

  // ── Auto-suggest tiers when models change ────────────────────────────
  useEffect(() => {
    if (selectedModels.length < 2) {
      setTierModels({ simple: "", medium: "", complex: "" });
      return;
    }
    const sorted = [...selectedModels].sort((a, b) => blendedCost(a) - blendedCost(b));
    const cheapest = sorted[0].id;
    const mostExpensive = sorted[sorted.length - 1].id;
    const mid = sorted.length >= 3 ? sorted[Math.floor(sorted.length / 2)].id : "";
    setTierModels({ simple: cheapest, medium: mid, complex: mostExpensive });
  }, [selectedModels]);

  // ── Build fallback chain when tiers / selection changes ──────────────
  useEffect(() => {
    // Default fallback: complex -> medium -> simple
    const chain: string[] = [];
    if (tierModels.complex) chain.push(tierModels.complex);
    if (tierModels.medium && tierModels.medium !== tierModels.complex) chain.push(tierModels.medium);
    if (tierModels.simple && !chain.includes(tierModels.simple)) chain.push(tierModels.simple);
    // Add remaining selected models not yet in the chain
    for (const m of selectedModels) {
      if (!chain.includes(m.id)) chain.push(m.id);
    }
    setFallbackChain(chain);
  }, [tierModels, selectedModels]);

  // ── Model lookup helper ──────────────────────────────────────────────
  const getModel = (id: string): ModelDef | undefined => availableModels.find((m) => m.id === id);
  const getModelName = (id: string): string => getModel(id)?.name || id;

  // ── Validation per step ──────────────────────────────────────────────
  const validateStep = (s: number): boolean => {
    switch (s) {
      case 0: {
        const trimmed = keyName.trim();
        if (trimmed.length < 1 || trimmed.length > 50) {
          setNameError("Name must be 1-50 characters");
          return false;
        }
        if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
          setNameError("Only letters, numbers, spaces, dashes, and underscores");
          return false;
        }
        if (mode === "byok" && configuredProviders.length === 0) {
          setNameError("Configure at least one provider key in Integrations first");
          return false;
        }
        setNameError("");
        return true;
      }
      case 1:
        return selectedModelIds.length >= 2;
      case 2:
        return !!tierModels.simple && !!tierModels.complex;
      case 3:
        return true;
      default:
        return true;
    }
  };

  const canProceed = (s: number): boolean => {
    switch (s) {
      case 0:
        return keyName.trim().length >= 1 && (mode === "hosted" || configuredProviders.length > 0);
      case 1:
        return selectedModelIds.length >= 2;
      case 2:
        return !!tierModels.simple && !!tierModels.complex;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  // ── Toggle model selection ───────────────────────────────────────────
  const toggleModel = (id: string) => {
    setSelectedModelIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  // ── Move fallback chain item ─────────────────────────────────────────
  const moveFallback = (idx: number, direction: "up" | "down") => {
    const newChain = [...fallbackChain];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newChain.length) return;
    [newChain[idx], newChain[swapIdx]] = [newChain[swapIdx], newChain[idx]];
    setFallbackChain(newChain);
  };

  // ── Final create ─────────────────────────────────────────────────────
  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const complexModel = tierModels.complex;
      await onCreate({
        name: keyName.trim(),
        selected_models: selectedModelIds,
        benchmark_model: complexModel,
        model_parameters: {
          layers: { routing: routingEnabled, fallback: fallbackEnabled, optimize: optimizeMode },
          tier_models: {
            simple: tierModels.simple,
            ...(tierModels.medium ? { medium: tierModels.medium } : {}),
            complex: tierModels.complex,
          },
          fallback_chain: fallbackChain,
        },
      });
      onClose();
    } catch {
      // parent handles error toast
    } finally {
      setSubmitting(false);
    }
  };

  // ── Tier options for selects (models sorted by cost) ─────────────────
  const tierSelectOptions = selectedModels;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
          </DialogDescription>
        </DialogHeader>

        {/* ─── Progress indicator ─── */}
        <div className="flex items-center gap-1 mb-2">
          {STEP_TITLES.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Step 1: Name & Mode                                           */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <div className="space-y-6 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="create-key-name" className="text-sm font-medium">
                API Key Name
              </Label>
              <Input
                id="create-key-name"
                placeholder='e.g. "My Chatbot Key"'
                value={keyName}
                onChange={(e) => { setKeyName(e.target.value); setNameError(""); }}
                maxLength={50}
                className={nameError ? "border-red-400" : ""}
                autoFocus
              />
              {nameError && <p className="text-sm text-red-500">{nameError}</p>}
            </div>

            {/* Mode selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Mode</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode("byok")}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    mode === "byok"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Key className={`w-4 h-4 ${mode === "byok" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-semibold text-sm">BYOK</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use your own provider API keys
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("hosted")}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    mode === "hosted"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className={`w-4 h-4 ${mode === "hosted" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-semibold text-sm">Hosted</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use Nadir's Bedrock keys, pay per token
                  </p>
                </button>
              </div>
            </div>

            {mode === "byok" && configuredProviders.length === 0 && !loadingProviders && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                No provider keys configured yet. Go to <strong>Integrations</strong> to add your API keys first.
              </div>
            )}
            {mode === "byok" && configuredProviders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {configuredProviders.map((p) => (
                  <Badge key={p} variant="outline" className="text-xs">
                    <Check className="w-3 h-3 mr-1" />
                    {PROVIDER_DISPLAY[p] || p}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Step 2: Model Selection                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Select at least 2 models.{" "}
              {mode === "byok"
                ? "Showing models for your configured providers."
                : "Nadir hosted mode runs on AWS Bedrock — currently supporting Anthropic Claude models."}
            </p>
            {mode === "hosted" && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                Powered by AWS Bedrock. More providers coming soon.
              </div>
            )}

            {availableModels.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No models available.{" "}
                {mode === "byok" && "Configure provider keys in Integrations first."}
              </div>
            )}

            {Object.entries(groupedModels).map(([provider, models]) => (
              <div key={provider} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {PROVIDER_DISPLAY[provider] || provider}
                </p>
                <div className="space-y-1">
                  {models.map((model) => {
                    const isSelected = selectedModelIds.includes(model.id);
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => toggleModel(model.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-border/80"
                        }`}
                      >
                        <Checkbox checked={isSelected} className="pointer-events-none" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{model.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {pricingLabel(model)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="text-xs text-muted-foreground">
              {selectedModelIds.length} model{selectedModelIds.length !== 1 ? "s" : ""} selected
              {selectedModelIds.length < 2 && (
                <span className="text-amber-600 ml-2">(minimum 2 required)</span>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Step 3: Tier Assignment                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-5 py-2">
            <p className="text-sm text-muted-foreground">
              Assign models to complexity tiers. Nadir routes each prompt to the
              appropriate tier automatically.
            </p>

            {/* Simple tier */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">Simple</Badge>
                <span className="text-xs text-muted-foreground">Required -- cheapest model for trivial prompts</span>
              </div>
              <Select
                value={tierModels.simple}
                onValueChange={(v) => setTierModels((prev) => ({ ...prev, simple: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select simple tier model" />
                </SelectTrigger>
                <SelectContent>
                  {tierSelectOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} -- {pricingLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tierModels.simple && (
                <p className="text-xs text-muted-foreground">
                  {pricingLabel(getModel(tierModels.simple)!)}
                </p>
              )}
            </div>

            {/* Medium tier */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Medium</Badge>
                <span className="text-xs text-muted-foreground">Optional -- if not set, complex model handles medium too</span>
              </div>
              <Select
                value={tierModels.medium || "__none__"}
                onValueChange={(v) => setTierModels((prev) => ({ ...prev, medium: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No medium tier (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No medium tier</SelectItem>
                  {tierSelectOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} -- {pricingLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tierModels.medium && getModel(tierModels.medium) && (
                <p className="text-xs text-muted-foreground">
                  {pricingLabel(getModel(tierModels.medium)!)}
                </p>
              )}
            </div>

            {/* Complex tier */}
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs">Complex</Badge>
                <span className="text-xs text-muted-foreground">Required -- most capable model for hard prompts</span>
              </div>
              <Select
                value={tierModels.complex}
                onValueChange={(v) => setTierModels((prev) => ({ ...prev, complex: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select complex tier model" />
                </SelectTrigger>
                <SelectContent>
                  {tierSelectOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} -- {pricingLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tierModels.complex && (
                <p className="text-xs text-muted-foreground">
                  {pricingLabel(getModel(tierModels.complex)!)}
                </p>
              )}
            </div>

            {(!tierModels.simple || !tierModels.complex) && (
              <p className="text-xs text-amber-600">
                Simple and Complex tiers are required to proceed.
              </p>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Step 4: Fallback Configuration                                */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold">Enable Fallback Chains</p>
                  <p className="text-xs text-muted-foreground">Auto-retry with backup models on failure</p>
                </div>
              </div>
              <Switch checked={fallbackEnabled} onCheckedChange={setFallbackEnabled} />
            </div>

            {fallbackEnabled && fallbackChain.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Reorder the fallback chain. The first model is tried first; if it fails, the
                  next model is used, and so on.
                </p>
                {fallbackChain.map((modelId, idx) => {
                  const model = getModel(modelId);
                  return (
                    <div
                      key={modelId}
                      className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 group"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                      <span className="w-5 text-xs text-muted-foreground font-mono">{idx + 1}.</span>
                      <span className="text-sm flex-1">{model?.name || modelId}</span>
                      {model && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatCost(model.inputCost)}/{formatCost(model.outputCost)}
                        </span>
                      )}
                      {idx === 0 && (
                        <Badge className="text-[10px] bg-primary/10 text-primary border-0">Primary</Badge>
                      )}
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-xs"
                          disabled={idx === 0}
                          onClick={() => moveFallback(idx, "up")}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-xs"
                          disabled={idx === fallbackChain.length - 1}
                          onClick={() => moveFallback(idx, "down")}
                        >
                          ↓
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!fallbackEnabled && (
              <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                Fallback is disabled. If the primary model fails, the request will return an error
                instead of retrying with another model.
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* Step 5: Review & Create                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <div className="space-y-4 py-2">
            <div className="border rounded-lg divide-y">
              {/* Name */}
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium">{keyName}</span>
              </div>
              {/* Mode */}
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Mode</span>
                <Badge variant="outline" className="text-xs">
                  {mode === "byok" ? "BYOK" : "Hosted"}
                </Badge>
              </div>
              {/* Models */}
              <div className="p-3 space-y-2">
                <span className="text-sm text-muted-foreground">Models ({selectedModelIds.length})</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {selectedModels.map((m) => {
                    let tierBadge: string | null = null;
                    if (m.id === tierModels.simple) tierBadge = "Simple";
                    else if (m.id === tierModels.medium) tierBadge = "Medium";
                    else if (m.id === tierModels.complex) tierBadge = "Complex";
                    return (
                      <Badge key={m.id} variant="outline" className="text-xs gap-1">
                        {m.name}
                        {tierBadge && (
                          <span className="text-[10px] text-primary font-semibold ml-1">
                            ({tierBadge})
                          </span>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              {/* Fallback chain */}
              <div className="p-3 space-y-1">
                <span className="text-sm text-muted-foreground">Fallback Chain</span>
                {fallbackEnabled ? (
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {fallbackChain.map((id, idx) => (
                      <span key={id} className="flex items-center gap-1">
                        <span className="text-xs font-medium">{getModelName(id)}</span>
                        {idx < fallbackChain.length - 1 && (
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Disabled</p>
                )}
              </div>
              {/* Layers — interactive toggles */}
              <div className="p-3 space-y-3">
                <span className="text-sm text-muted-foreground">Feature Layers</span>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium">Intelligent Routing</p>
                      <p className="text-xs text-muted-foreground">Auto-route by complexity</p>
                    </div>
                  </div>
                  <Switch checked={routingEnabled} onCheckedChange={setRoutingEnabled} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium">Fallback Chains</p>
                      <p className="text-xs text-muted-foreground">Auto-retry on failure</p>
                    </div>
                  </div>
                  <Switch checked={fallbackEnabled} onCheckedChange={setFallbackEnabled} />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M3 12h4m5 0h9M5.6 5.6l2.8 2.8m7.2 7.2l2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2l2.8-2.8"/></svg>
                    <div>
                      <p className="text-sm font-medium">Context Optimize</p>
                      <p className="text-xs text-muted-foreground">Reduce input tokens</p>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-6">
                    {(["off", "safe", "aggressive"] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setOptimizeMode(opt)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          optimizeMode === opt
                            ? opt === "off"
                              ? "bg-gray-900 text-white"
                              : opt === "safe"
                              ? "bg-green-600 text-white"
                              : "bg-orange-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Footer navigation ─── */}
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div>
            {step > 0 && (
              <Button variant="outline" onClick={handleBack} disabled={submitting}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            {step < STEP_TITLES.length - 1 ? (
              <Button onClick={handleNext} disabled={!canProceed(step)}>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
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
