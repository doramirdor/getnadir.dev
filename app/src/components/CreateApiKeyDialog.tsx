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
  CircleCheck,
  Loader2,
  Lock,
  Crown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const PROVIDER_KEY_FIELDS = [
  { key: "openai", label: "OpenAI", placeholder: "sk-..." },
  { key: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { key: "google", label: "Google AI", placeholder: "AI..." },
  { key: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
  { key: "groq", label: "Groq", placeholder: "gsk_..." },
];

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

// ── Types ──────────────────────────────────────────────────────────────

type IntegrationMode = "byok" | "hosted";

interface ModelDef {
  id: string;
  name: string;
  inputCost: number;
  outputCost: number;
}

interface ApiKeyConfig {
  name: string;
  selected_models: string[];
  benchmark_model: string;
  model_parameters: Record<string, any>;
}

interface CreateApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (config: ApiKeyConfig) => Promise<void>;
  /** When set, dialog opens in edit mode pre-populated with this config */
  editConfig?: ApiKeyConfig;
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
  groq: [
    { id: "groq/llama-3.3-70b-versatile", name: "Llama 3.3 70B", inputCost: 0.59, outputCost: 0.79 },
    { id: "groq/mixtral-8x7b-32768", name: "Mixtral 8x7B", inputCost: 0.24, outputCost: 0.24 },
  ],
  openrouter: [
    { id: "openrouter/auto", name: "OpenRouter Auto", inputCost: 1, outputCost: 5 },
    { id: "openrouter/anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4 (OR)", inputCost: 3, outputCost: 15 },
    { id: "openrouter/openai/gpt-4o", name: "GPT-4o (OR)", inputCost: 2.5, outputCost: 10 },
    { id: "openrouter/google/gemini-2.0-flash-001", name: "Gemini Flash (OR)", inputCost: 0.1, outputCost: 0.4 },
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
  openrouter: "OpenRouter",
  groq: "Groq",
};

const BASE_STEPS = ["Name & Mode", "Routing & Models", "Fallback Chains", "Review & Create"];
const PROVIDER_STEP_TITLE = "Provider Keys";

function blendedCost(m: ModelDef): number {
  return m.inputCost + m.outputCost;
}

function pricingLabel(m: ModelDef): string {
  const fmt = (v: number) => (v < 1 ? `$${v.toFixed(2)}` : `$${v}`);
  return `${fmt(m.inputCost)} / ${fmt(m.outputCost)} per 1M`;
}

// ── Component ──────────────────────────────────────────────────────────

export default function CreateApiKeyDialog({ open, onClose, onCreate, editConfig }: CreateApiKeyDialogProps) {
  const isEdit = !!editConfig;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [newProviderKeys, setNewProviderKeys] = useState<Record<string, string>>({});

  // Step 1
  const [keyName, setKeyName] = useState("");
  const [nameError, setNameError] = useState("");
  // Default to BYOK — Hosted (Nadir-managed Bedrock keys) is a Pro-only feature.
  // Free accounts bring their own provider keys; if they pick Hosted we
  // intercept "Next" and send them to Stripe checkout with FIRST1.
  const [mode, setMode] = useState<IntegrationMode>("byok");
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [redirectingToCheckout, setRedirectingToCheckout] = useState(false);

  // Pro gate — Hosted mode requires an active subscription.
  const { data: subscription } = useQuery({
    queryKey: ["subscription", "create-api-key-dialog", user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });
  const isPro = subscription?.status === "active";

  const startProCheckout = async () => {
    setRedirectingToCheckout(true);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData.session) throw new Error("Please sign in to upgrade.");

      // Return to whichever page launched the dialog (admin /api-keys or
      // /onboarding). Both pages listen for ?upgraded=true and re-open the
      // wizard so the user can finish picking Hosted mode and create the key.
      const returnPath = window.location.pathname;
      const res = await fetch(`${API_BASE}/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          plan_id: "pro",
          promo_code: "FIRST1",
          success_url: `${window.location.origin}${returnPath}?upgraded=true`,
          cancel_url: `${window.location.origin}${returnPath}`,
        }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j.detail) detail = j.detail; } catch { /* ignore */ }
        throw new Error(detail);
      }
      const data = (await res.json()) as { checkout_url: string };
      window.location.href = data.checkout_url;
    } catch (e: any) {
      toast({ variant: "destructive", title: "Couldn't start checkout", description: e.message });
      setRedirectingToCheckout(false);
    }
  };

  // Step 2: Routing + models
  const [routingEnabled, setRoutingEnabled] = useState(true);
  const [simpleModel, setSimpleModel] = useState("");
  const [mediumModel, setMediumModel] = useState("");
  const [complexModel, setComplexModel] = useState("");

  // Step 2b: Optimize
  const [optimizeMode, setOptimizeMode] = useState<"off" | "safe" | "aggressive">("off");

  // Step 3: Fallback
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [fallbackChain, setFallbackChain] = useState<string[]>([]);

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // ── Dynamic steps: insert "Provider Keys" step after "Name & Mode" when BYOK + no keys ──
  // Only show provider step for new keys (not edit) when providers haven't loaded yet or are empty
  const needsProviderStep = !isEdit && mode === "byok" && !loadingProviders && configuredProviders.length === 0;
  const STEP_TITLES = useMemo(() => {
    if (needsProviderStep) {
      return [BASE_STEPS[0], PROVIDER_STEP_TITLE, ...BASE_STEPS.slice(1)];
    }
    return BASE_STEPS;
  }, [needsProviderStep]);

  // Map logical step index to step type
  const stepType = (s: number): string => STEP_TITLES[s] || "";

  // ── Reset / pre-populate ──
  useEffect(() => {
    if (open) {
      setStep(isEdit ? 1 : 0); // Skip name step in edit mode
      setNameError("");
      setSubmitting(false);
      fetchProviderKeys();
      fetchUserMode();

      if (editConfig) {
        // Pre-populate from existing config
        setKeyName(editConfig.name);
        const mp = editConfig.model_parameters || {};
        const layers = mp.layers || {};
        const tierModels = mp.tier_models || {};
        setMode(mp.key_mode || "hosted");
        setRoutingEnabled(layers.routing ?? true);
        setFallbackEnabled(layers.fallback ?? true);
        setOptimizeMode(layers.optimize || "off");
        setSimpleModel(tierModels.simple || "");
        setMediumModel(tierModels.medium || "");
        setComplexModel(tierModels.complex || "");
        setFallbackChain(mp.fallback_chain || []);
      } else {
        // Fresh create
        setKeyName("");
        setSimpleModel("");
        setMediumModel("");
        setComplexModel("");
        setRoutingEnabled(true);
        setFallbackEnabled(true);
        setFallbackChain([]);
        setOptimizeMode("off");
        setNewProviderKeys({});
      }
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

  // ── Available models (includes both saved + newly entered provider keys) ──
  const allProviders = useMemo(() => {
    const s = new Set(configuredProviders);
    for (const [provider, key] of Object.entries(newProviderKeys)) {
      if (key.trim() && isProviderKeyFormatValid(provider, key)) s.add(provider);
    }
    return Array.from(s);
  }, [configuredProviders, newProviderKeys]);

  const availableModels: ModelDef[] = useMemo(() => {
    if (mode === "hosted") return HOSTED_MODELS;
    const models: ModelDef[] = [];
    const seen = new Set<string>();
    for (const provider of allProviders) {
      if (MODELS_BY_PROVIDER[provider]) {
        for (const m of MODELS_BY_PROVIDER[provider]) {
          if (!seen.has(m.id)) { models.push(m); seen.add(m.id); }
        }
      }
    }
    // In edit mode, ensure previously-selected models are always available
    if (editConfig?.model_parameters?.tier_models) {
      const tiers = editConfig.model_parameters.tier_models;
      for (const id of [tiers.simple, tiers.medium, tiers.complex].filter(Boolean)) {
        if (!seen.has(id)) {
          models.push({ id, name: id, inputCost: 0, outputCost: 0 });
          seen.add(id);
        }
      }
    }
    if (editConfig?.model_parameters?.fallback_chain) {
      for (const id of editConfig.model_parameters.fallback_chain) {
        if (!seen.has(id)) {
          models.push({ id, name: id, inputCost: 0, outputCost: 0 });
          seen.add(id);
        }
      }
    }
    return models;
  }, [mode, allProviders, editConfig]);

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
  // Count valid new inline provider keys
  const validNewKeys = Object.entries(newProviderKeys).filter(
    ([provider, key]) => key.trim() && isProviderKeyFormatValid(provider, key)
  );
  const totalProviders = configuredProviders.length + validNewKeys.length;

  const canProceedStep = (s: number): boolean => {
    const type = stepType(s);
    switch (type) {
      case "Name & Mode":
        return keyName.trim().length >= 1;
      case "Provider Keys":
        return validNewKeys.length > 0;
      case "Routing & Models":
        if (routingEnabled) return !!simpleModel && !!complexModel;
        return true;
      default:
        return true;
    }
  };

  const validateStep = (s: number): boolean => {
    const type = stepType(s);
    if (type === "Name & Mode") {
      const t = keyName.trim();
      if (t.length < 1 || t.length > 50) { setNameError("Name must be 1-50 characters"); return false; }
      if (!/^[a-zA-Z0-9 _-]+$/.test(t)) { setNameError("Letters, numbers, spaces, dashes, underscores only"); return false; }
      setNameError("");
      return true;
    }
    if (type === "Provider Keys") {
      return validNewKeys.length > 0;
    }
    if (type === "Routing & Models") {
    }
    return canProceedStep(s);
  };

  // On the Name & Mode step, if a free user selected Hosted, "Next" should
  // route them to Stripe checkout (FIRST1) instead of advancing the wizard.
  // Hosted requires an active subscription — the Pro lock is enforced here,
  // not later in the flow, so free users see the price wall before they
  // configure routing or generate a key.
  const needsUpgradeForHosted =
    stepType(step) === "Name & Mode" && mode === "hosted" && !isPro;

  const handleNext = () => {
    if (!validateStep(step)) return;
    if (needsUpgradeForHosted) {
      void startProCheckout();
      return;
    }
    setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
  };
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

  // ── Save new provider keys via JWT, then create API key ──
  const handleCreate = async () => {
    setSubmitting(true);
    try {
      // Save any new provider keys entered inline
      if (mode === "byok" && validNewKeys.length > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Not authenticated");

        for (const [provider, key] of validNewKeys) {
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
        toast({
          title: "Provider keys saved",
          description: `${validNewKeys.length} provider key(s) configured.`,
        });
      }

      const benchmark = complexModel || (sortedModels.length > 0 ? sortedModels[sortedModels.length - 1].id : "");
      await onCreate({
        name: keyName.trim(),
        selected_models: selectedModelIds.length > 0 ? selectedModelIds : sortedModels.map((m) => m.id),
        benchmark_model: benchmark,
        model_parameters: {
          key_mode: mode,
          layers: { routing: routingEnabled, fallback: fallbackEnabled, optimize: optimizeMode },
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
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Configure API Key" : "Create API Key"}</DialogTitle>
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
        {stepType(step) === "Name & Mode" && (
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
                  { id: "byok" as const, icon: Key, label: "BYOK", desc: "Use your own provider API keys", proOnly: false },
                  { id: "hosted" as const, icon: Zap, label: "Hosted", desc: "Use Nadir's Bedrock keys", proOnly: true },
                ].map(({ id, icon: Icon, label, desc, proOnly }) => {
                  const locked = proOnly && !isPro;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMode(id)}
                      className={`relative p-4 border-2 rounded-xl text-left transition-all ${
                        mode === id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      {locked && (
                        <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                          <Crown className="w-3 h-3" /> Pro
                        </span>
                      )}
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${mode === id ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="font-semibold text-sm">{label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === "hosted" && isPro && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400">
                <Zap className="w-3.5 h-3.5 flex-shrink-0" />
                Powered by AWS Bedrock - currently supporting Anthropic Claude models.
              </div>
            )}

            {mode === "hosted" && !isPro && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">Hosted is a Pro feature.</p>
                  <p>
                    Free accounts use BYOK with their own provider keys. Click <strong>Next</strong> to start your Pro
                    trial — first month is $0 with code <code className="mono font-semibold">FIRST1</code>.
                  </p>
                </div>
              </div>
            )}

            {mode === "byok" && !loadingProviders && configuredProviders.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {configuredProviders.map((p) => (
                  <Badge key={p} variant="outline" className="text-xs">
                    <Check className="w-3 h-3 mr-1" /> {PROVIDER_DISPLAY[p] || p}
                  </Badge>
                ))}
              </div>
            )}
            {mode === "byok" && !loadingProviders && configuredProviders.length === 0 && !isEdit && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                <Key className="w-3.5 h-3.5 flex-shrink-0" />
                You'll configure provider keys in the next step.
              </div>
            )}
          </div>
        )}

        {/* ═══ PROVIDER KEYS STEP (only when BYOK + no existing keys) ═══ */}
        {stepType(step) === "Provider Keys" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Add at least one provider key to use BYOK mode. You can add more later from Integrations.
            </p>
            <div className="space-y-3">
              {PROVIDER_KEY_FIELDS.map((field) => {
                const value = newProviderKeys[field.key] || "";
                const valid = isProviderKeyFormatValid(field.key, value);
                const showValidation = value.trim().length > 0;
                return (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs">{field.label}</Label>
                    <div className="relative">
                      <Input
                        type="password"
                        placeholder={field.placeholder}
                        value={value}
                        onChange={(e) =>
                          setNewProviderKeys({ ...newProviderKeys, [field.key]: e.target.value })
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
            </div>
            <p className="text-xs text-muted-foreground">Keys are encrypted at rest.</p>
          </div>
        )}

        {/* ═══ Routing & Models ═══ */}
        {stepType(step) === "Routing & Models" && (
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
                    <span className="text-xs text-muted-foreground">Required - for trivial prompts</span>
                  </div>
                  <Select value={simpleModel} onValueChange={setSimpleModel}>
                    <SelectTrigger><SelectValue placeholder="Select model..." /></SelectTrigger>
                    <SelectContent>
                      {sortedModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} - {pricingLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Medium tier (optional) */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Medium</Badge>
                    <span className="text-xs text-muted-foreground">Optional - if empty, complex handles medium</span>
                  </div>
                  <Select value={mediumModel || "__none__"} onValueChange={(v) => setMediumModel(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="None (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No medium tier</SelectItem>
                      {sortedModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} - {pricingLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Complex tier */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs">Complex</Badge>
                    <span className="text-xs text-muted-foreground">Required - most capable model</span>
                  </div>
                  <Select value={complexModel} onValueChange={setComplexModel}>
                    <SelectTrigger><SelectValue placeholder="Select model..." /></SelectTrigger>
                    <SelectContent>
                      {sortedModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} - {pricingLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(!simpleModel || !complexModel) && (
                  <p className="text-xs text-amber-600">Simple and Complex tiers are required.</p>
                )}

                {/* Warn if tier pricing is inverted */}
                {simpleModel && complexModel && (() => {
                  const s = getModel(simpleModel);
                  const m = mediumModel ? getModel(mediumModel) : null;
                  const c = getModel(complexModel);
                  const warnings: string[] = [];
                  if (s && c && blendedCost(s) > blendedCost(c)) {
                    warnings.push(
                      `Simple tier (${s.name} — ${pricingLabel(s)}) is more expensive than Complex tier (${c.name} — ${pricingLabel(c)}).`
                    );
                  }
                  if (s && m && blendedCost(s) > blendedCost(m)) {
                    warnings.push(
                      `Simple tier (${s.name}) is more expensive than Medium tier (${m.name}).`
                    );
                  }
                  if (m && c && blendedCost(m) > blendedCost(c)) {
                    warnings.push(
                      `Medium tier (${m.name}) is more expensive than Complex tier (${c.name}).`
                    );
                  }
                  if (warnings.length === 0) return null;
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
                      <p className="text-sm font-medium text-amber-800">Inverted pricing detected</p>
                      {warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-700">{w}</p>
                      ))}
                      <p className="text-xs text-amber-700 font-medium">
                        Routing will cost you more, not less. Did you mean to swap them?
                      </p>
                    </div>
                  );
                })()}
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
        {stepType(step) === "Fallback Chains" && (
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

            {fallbackEnabled && routingEnabled && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Complex model is primary. Reorder the fallback chain below.
                </p>
                {fallbackChain.map((id, idx) => {
                  const m = getModel(id);
                  return (
                    <div key={id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 group">
                      <span className="w-5 text-xs text-muted-foreground font-mono">{idx + 1}.</span>
                      <span className="text-sm flex-1 font-medium">{m?.name || id}</span>
                      {idx === 0 && <Badge className="text-[10px] bg-primary/10 text-primary border-0">Primary</Badge>}
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === 0} onClick={() => moveFallback(idx, "up")}>
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={idx === fallbackChain.length - 1} onClick={() => moveFallback(idx, "down")}>
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {fallbackEnabled && !routingEnabled && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Choose your models. Primary is tried first; fallbacks on failure.
                </p>

                {/* Slot 1: Primary (required) */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">1</span>
                    <span className="text-sm font-medium">Primary Model</span>
                    <span className="text-xs text-muted-foreground">Required</span>
                  </div>
                  <Select value={fallbackChain[0] || ""} onValueChange={(v) => {
                    const c = [...fallbackChain]; c[0] = v; setFallbackChain(c.filter(Boolean));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select primary model..." /></SelectTrigger>
                    <SelectContent>
                      {sortedModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} - {pricingLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Slot 2: First fallback (required) */}
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">2</span>
                    <span className="text-sm font-medium">First Fallback</span>
                    <span className="text-xs text-muted-foreground">Required</span>
                  </div>
                  <Select value={fallbackChain[1] || ""} onValueChange={(v) => {
                    const c = [...fallbackChain]; c[1] = v; setFallbackChain(c.filter(Boolean));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select fallback model..." /></SelectTrigger>
                    <SelectContent>
                      {sortedModels.filter((m) => m.id !== fallbackChain[0]).map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} - {pricingLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Slot 3: Second fallback (optional) */}
                <div className="border border-dashed rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center font-bold">3</span>
                    <span className="text-sm font-medium">Second Fallback</span>
                    <span className="text-xs text-muted-foreground">Optional</span>
                  </div>
                  <Select value={fallbackChain[2] || "__none__"} onValueChange={(v) => {
                    if (v === "__none__") { setFallbackChain(fallbackChain.slice(0, 2)); return; }
                    const c = [...fallbackChain]; c[2] = v; setFallbackChain(c.filter(Boolean));
                  }}>
                    <SelectTrigger><SelectValue placeholder="None (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No third model</SelectItem>
                      {sortedModels.filter((m) => !fallbackChain.slice(0, 2).includes(m.id)).map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name} - {pricingLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {!fallbackEnabled && (
              <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                Fallback disabled. If the model fails, the request returns an error.
              </div>
            )}

            {/* Context Optimize */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-green-50">
                  <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 12.5-6-3-6 3"/><path d="m18 18-6-3-6 3"/><path d="m18 7-6-3-6 3"/></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold">Context Optimize</p>
                  <p className="text-xs text-muted-foreground">Reduce input tokens before sending to the model</p>
                </div>
              </div>
              <div className="flex gap-2 ml-11">
                {(["off", "safe", "aggressive"] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setOptimizeMode(opt)}
                    className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
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
              {optimizeMode !== "off" && (
                <p className="text-xs text-muted-foreground ml-11 mt-2">
                  {optimizeMode === "safe"
                    ? "Lossless transforms: whitespace, empty messages, duplicate system prompts"
                    : "Safe + semantic dedup using sentence embeddings"}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Review & Create ═══ */}
        {stepType(step) === "Review & Create" && (
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

              {/* Context Optimize */}
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Context Optimize</span>
                <Badge variant={optimizeMode !== "off" ? "default" : "outline"} className={`text-xs ${
                  optimizeMode === "safe" ? "bg-green-600" : optimizeMode === "aggressive" ? "bg-orange-600" : ""
                }`}>
                  {optimizeMode.charAt(0).toUpperCase() + optimizeMode.slice(1)}
                </Badge>
              </div>

              {/* Benchmark */}
              <div className="p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Benchmark (auto)</span>
                <span className="text-xs font-medium">
                  {getModel(complexModel || fallbackChain[0] || sortedModels[sortedModels.length - 1]?.id)?.name || "—"}
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
              <Button
                onClick={handleNext}
                disabled={!canProceedStep(step) || redirectingToCheckout}
              >
                {redirectingToCheckout ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Redirecting to checkout...</>
                ) : needsUpgradeForHosted ? (
                  <><Crown className="w-4 h-4 mr-1" /> Start Pro trial <ChevronRight className="w-4 h-4 ml-1" /></>
                ) : (
                  <>Next <ChevronRight className="w-4 h-4 ml-1" /></>
                )}
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? "Saving..." : isEdit ? "Save Changes" : "Create API Key"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
