/**
 * ApiKeyConfig — Configure models, fallback chain, and layers per API key.
 *
 * - Routing ON → user picks models (fetched dynamically from backend)
 * - Benchmark → auto = most expensive selected model
 * - Fallback ON → user defines fallback order from selected models
 * - Context Optimize → off / safe / aggressive
 */
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Brain,
  Shield,
  Scissors,
  Settings2,
  GripVertical,
  Search,
  RefreshCw,
  DollarSign,
  Zap,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  input_price: number;  // per 1M tokens
  output_price: number; // per 1M tokens
  tier: number;         // 1=premium, 2=mid, 3=budget
}

export interface Layers {
  routing: boolean;
  fallback: boolean;
  optimize: "off" | "safe" | "aggressive";
}

export interface ApiKeyConfiguration {
  selected_models: string[];
  benchmark_model: string;
  fallback_order: string[];
  model_parameters: {
    layers: Layers;
    fallbackModels?: string[];
    [key: string]: any;
  };
}

interface ApiKeyConfigProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: ApiKeyConfiguration) => void;
  initialConfig?: Partial<ApiKeyConfiguration>;
  keyName?: string;
}

// ── Fallback model catalog (used when backend is unavailable) ──────────

const FALLBACK_CATALOG: ModelInfo[] = [
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", input_price: 0.15, output_price: 0.60, tier: 3 },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", input_price: 2.50, output_price: 10, tier: 2 },
  { id: "o3", name: "OpenAI o3", provider: "OpenAI", input_price: 10, output_price: 40, tier: 1 },
  { id: "o4-mini", name: "OpenAI o4-mini", provider: "OpenAI", input_price: 1.10, output_price: 4.40, tier: 2 },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "Anthropic", input_price: 0.80, output_price: 4, tier: 3 },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "Anthropic", input_price: 3, output_price: 15, tier: 2 },
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", provider: "Anthropic", input_price: 15, output_price: 75, tier: 1 },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "Google", input_price: 0.10, output_price: 0.40, tier: 3 },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", input_price: 1.25, output_price: 10, tier: 2 },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", input_price: 0.15, output_price: 0.60, tier: 3 },
];

const OPTIMIZE_OPTIONS: { value: Layers["optimize"]; label: string; desc: string }[] = [
  { value: "off", label: "Off", desc: "No optimization" },
  { value: "safe", label: "Safe", desc: "Lossless transforms only" },
  { value: "aggressive", label: "Aggressive", desc: "Safe + semantic dedup" },
];

// ── Helpers ────────────────────────────────────────────────────────────

function formatPrice(input: number, output: number): string {
  const fmt = (n: number) => n < 1 ? `$${n.toFixed(2)}` : `$${n}`;
  return `${fmt(input)}/${fmt(output)}`;
}

function blendedCost(m: ModelInfo): number {
  return m.input_price + m.output_price;
}

function tierLabel(tier: number): string {
  return tier === 1 ? "Premium" : tier === 2 ? "Mid-tier" : "Budget";
}

function tierColor(tier: number): string {
  return tier === 1
    ? "bg-purple-50 text-purple-700 border-purple-200"
    : tier === 2
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : "bg-green-50 text-green-700 border-green-200";
}

// ── Component ──────────────────────────────────────────────────────────

export default function ApiKeyConfig({ open, onClose, onSave, initialConfig, keyName }: ApiKeyConfigProps) {
  // Layers state
  const [layers, setLayers] = useState<Layers>(
    initialConfig?.model_parameters?.layers || { routing: true, fallback: true, optimize: "off" }
  );

  // Model state
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(FALLBACK_CATALOG);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(
    initialConfig?.selected_models || ["gpt-4o-mini", "gpt-4o", "claude-opus-4-20250514"]
  );
  const [fallbackOrder, setFallbackOrder] = useState<string[]>(
    initialConfig?.fallback_order || initialConfig?.selected_models || ["gpt-4o-mini", "gpt-4o", "claude-opus-4-20250514"]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);

  // Fetch models from backend on mount
  useEffect(() => {
    if (!open) return;
    const fetchModels = async () => {
      setLoadingModels(true);
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/v1/models/catalog`);
        if (res.ok) {
          const data = await res.json();
          if (data.models && data.models.length > 0) {
            setAvailableModels(data.models as ModelInfo[]);
          }
        }
      } catch {
        // Keep fallback catalog
      } finally {
        setLoadingModels(false);
      }
    };
    fetchModels();
  }, [open]);

  // Auto-compute benchmark = most expensive selected model
  const benchmarkModel = useMemo(() => {
    const selected = availableModels.filter(m => selectedModelIds.includes(m.id));
    if (selected.length === 0) return "";
    return selected.sort((a, b) => blendedCost(b) - blendedCost(a))[0].id;
  }, [selectedModelIds, availableModels]);

  const benchmarkInfo = availableModels.find(m => m.id === benchmarkModel);

  // Group models by provider, filter by search
  const groupedModels = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = availableModels.filter(
      m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)
    );
    const groups: Record<string, ModelInfo[]> = {};
    for (const m of filtered) {
      if (!groups[m.provider]) groups[m.provider] = [];
      groups[m.provider].push(m);
    }
    // Sort each group by price (cheapest first)
    for (const provider of Object.keys(groups)) {
      groups[provider].sort((a, b) => blendedCost(a) - blendedCost(b));
    }
    return groups;
  }, [availableModels, searchQuery]);

  const toggleModel = (modelId: string) => {
    if (selectedModelIds.includes(modelId)) {
      setSelectedModelIds(prev => prev.filter(m => m !== modelId));
      setFallbackOrder(prev => prev.filter(m => m !== modelId));
    } else {
      setSelectedModelIds(prev => [...prev, modelId]);
      setFallbackOrder(prev => [...prev, modelId]);
    }
  };

  const moveFallback = (idx: number, direction: "up" | "down") => {
    const newOrder = [...fallbackOrder];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    setFallbackOrder(newOrder);
  };

  const getModelName = (id: string) => availableModels.find(m => m.id === id)?.name || id;

  const handleSave = () => {
    onSave({
      selected_models: selectedModelIds,
      benchmark_model: benchmarkModel,
      fallback_order: fallbackOrder,
      model_parameters: {
        layers,
        fallbackModels: fallbackOrder.slice(1),
      },
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Configure{keyName ? `: ${keyName}` : " API Key"}
          </DialogTitle>
          <DialogDescription>
            Toggle features and define which models to use
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">

          {/* ─── Layer 1: Intelligent Routing ─── */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-50">
                  <Brain className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Intelligent Routing</p>
                  <p className="text-xs text-muted-foreground">Route prompts to the optimal model by complexity</p>
                </div>
              </div>
              <Switch
                checked={layers.routing}
                onCheckedChange={(v) => setLayers({ ...layers, routing: v })}
              />
            </div>

            {layers.routing && (
              <div className="mt-4 space-y-3">
                {/* Search + refresh */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search models..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={loadingModels}
                    onClick={() => {
                      setLoadingModels(true);
                      setTimeout(() => setLoadingModels(false), 500);
                    }}
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingModels ? "animate-spin" : ""}`} />
                  </Button>
                </div>

                {/* Model chips by provider */}
                {Object.entries(groupedModels).map(([provider, models]) => (
                  <div key={provider}>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{provider}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {models.map(model => {
                        const selected = selectedModelIds.includes(model.id);
                        return (
                          <button
                            key={model.id}
                            onClick={() => toggleModel(model.id)}
                            className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                              selected
                                ? "bg-primary/10 border-primary text-primary font-medium"
                                : "bg-muted/30 border-transparent text-muted-foreground hover:border-border"
                            }`}
                          >
                            {model.name}
                            <span className="ml-1 opacity-50 text-[10px]">
                              {formatPrice(model.input_price, model.output_price)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {selectedModelIds.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-2">
                    {selectedModelIds.length} model{selectedModelIds.length !== 1 ? "s" : ""} selected
                  </div>
                )}

                {/* Auto benchmark */}
                {benchmarkInfo && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-md mt-2">
                    <DollarSign className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-xs text-amber-800">
                      Benchmark: <strong>{benchmarkInfo.name}</strong> ({formatPrice(benchmarkInfo.input_price, benchmarkInfo.output_price)}) — auto-selected as most expensive
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── Layer 2: Fallback Chains ─── */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-amber-50">
                  <Shield className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Fallback Chains</p>
                  <p className="text-xs text-muted-foreground">Auto-retry with backup models on failure</p>
                </div>
              </div>
              <Switch
                checked={layers.fallback}
                onCheckedChange={(v) => setLayers({ ...layers, fallback: v })}
              />
            </div>

            {layers.fallback && selectedModelIds.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="text-xs text-muted-foreground mb-2">
                  Drag to reorder. First model is primary; others are fallbacks.
                </p>
                {fallbackOrder.filter(m => selectedModelIds.includes(m)).map((modelId, idx) => {
                  const model = availableModels.find(m => m.id === modelId);
                  return (
                    <div
                      key={modelId}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 group"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                      <span className="w-5 text-xs text-muted-foreground font-mono">{idx + 1}.</span>
                      <span className="text-sm flex-1">{model?.name || modelId}</span>
                      {model && (
                        <Badge variant="outline" className={`text-[10px] ${tierColor(model.tier)}`}>
                          {tierLabel(model.tier)}
                        </Badge>
                      )}
                      {idx === 0 && (
                        <Badge className="text-[10px] bg-primary/10 text-primary border-0">Primary</Badge>
                      )}
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-xs" disabled={idx === 0} onClick={() => moveFallback(idx, "up")}>↑</Button>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-xs" disabled={idx === fallbackOrder.filter(m => selectedModelIds.includes(m)).length - 1} onClick={() => moveFallback(idx, "down")}>↓</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {layers.fallback && selectedModelIds.length === 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Enable Routing and select models first to define the fallback chain.
              </p>
            )}
          </div>

          {/* ─── Layer 3: Context Optimize ─── */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-md bg-green-50">
                <Scissors className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">Context Optimize</p>
                <p className="text-xs text-muted-foreground">Reduce input tokens before sending to the model</p>
              </div>
            </div>
            <div className="flex gap-2">
              {OPTIMIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLayers({ ...layers, optimize: opt.value })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    layers.optimize === opt.value
                      ? opt.value === "off"
                        ? "bg-gray-900 text-white"
                        : opt.value === "safe"
                        ? "bg-green-600 text-white"
                        : "bg-orange-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {layers.optimize !== "off" && (
              <p className="text-xs text-muted-foreground mt-2">
                {layers.optimize === "safe"
                  ? "5 lossless transforms: whitespace, empty messages, duplicate system prompts, ASCII art, comment blocks"
                  : "Safe + diff-preserving semantic dedup using sentence embeddings"}
              </p>
            )}
          </div>

          {/* ─── Always-on info ─── */}
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
            <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              <strong>Always active:</strong> Token tracking, savings tracking, response healing, rate limiting — on every request automatically.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
