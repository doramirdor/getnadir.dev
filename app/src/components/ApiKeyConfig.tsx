/**
 * ApiKeyConfig — Configure models, fallback chain, benchmark, and layers per API key.
 *
 * Shows in a dialog when creating or editing an API key.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GripVertical, Plus, X, Brain, ArrowDown, Settings2 } from "lucide-react";
import LayerConfig, { type Layers } from "@/components/LayerConfig";

// Available models grouped by tier
const MODEL_CATALOG = [
  { group: "Budget", models: [
    { id: "gpt-4o-mini", label: "GPT-4o Mini", price: "$0.15/$0.60" },
    { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", price: "$0.80/$4" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", price: "$0.10/$0.40" },
  ]},
  { group: "Mid-tier", models: [
    { id: "gpt-4o", label: "GPT-4o", price: "$2.50/$10" },
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", price: "$3/$15" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", price: "$1.25/$10" },
  ]},
  { group: "Premium", models: [
    { id: "claude-opus-4-20250514", label: "Claude Opus 4", price: "$15/$75" },
    { id: "o3", label: "OpenAI o3", price: "$10/$40" },
    { id: "gemini-2.5-pro-preview", label: "Gemini 2.5 Pro (Preview)", price: "$1.25/$10" },
  ]},
];

const ALL_MODELS = MODEL_CATALOG.flatMap(g => g.models);

export interface ApiKeyConfiguration {
  selected_models: string[];
  benchmark_model: string;
  fallback_order: string[];
  model_parameters: {
    layers: Layers;
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

export default function ApiKeyConfig({ open, onClose, onSave, initialConfig, keyName }: ApiKeyConfigProps) {
  const [selectedModels, setSelectedModels] = useState<string[]>(
    initialConfig?.selected_models || ["gpt-4o-mini", "gpt-4o", "claude-opus-4-20250514"]
  );
  const [benchmarkModel, setBenchmarkModel] = useState(
    initialConfig?.benchmark_model || "claude-opus-4-20250514"
  );
  const [fallbackOrder, setFallbackOrder] = useState<string[]>(
    initialConfig?.fallback_order || initialConfig?.selected_models || ["gpt-4o-mini", "gpt-4o", "claude-opus-4-20250514"]
  );
  const [layers, setLayers] = useState<Layers>(
    initialConfig?.model_parameters?.layers || { routing: true, fallback: true, optimize: "off" }
  );
  const [addModelOpen, setAddModelOpen] = useState(false);

  const toggleModel = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      const updated = selectedModels.filter(m => m !== modelId);
      setSelectedModels(updated);
      setFallbackOrder(prev => prev.filter(m => m !== modelId));
      if (benchmarkModel === modelId && updated.length > 0) {
        setBenchmarkModel(updated[updated.length - 1]);
      }
    } else {
      setSelectedModels([...selectedModels, modelId]);
      setFallbackOrder([...fallbackOrder, modelId]);
    }
  };

  const moveFallback = (idx: number, direction: "up" | "down") => {
    const newOrder = [...fallbackOrder];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    setFallbackOrder(newOrder);
  };

  const handleSave = () => {
    onSave({
      selected_models: selectedModels,
      benchmark_model: benchmarkModel,
      fallback_order: fallbackOrder,
      model_parameters: {
        layers,
        fallbackModels: fallbackOrder.slice(1), // first is primary, rest are fallbacks
      },
    });
    onClose();
  };

  const getModelLabel = (id: string) => ALL_MODELS.find(m => m.id === id)?.label || id;
  const getModelPrice = (id: string) => ALL_MODELS.find(m => m.id === id)?.price || "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Configure API Key{keyName ? `: ${keyName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Select models for routing, define fallback order, and configure feature layers
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Model Selection */}
          <div>
            <Label className="text-sm font-semibold mb-3 block">Selected Models</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Choose which models Nadir can route your requests to
            </p>
            <div className="space-y-3">
              {MODEL_CATALOG.map(group => (
                <div key={group.group}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{group.group}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.models.map(model => {
                      const selected = selectedModels.includes(model.id);
                      return (
                        <button
                          key={model.id}
                          onClick={() => toggleModel(model.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            selected
                              ? "bg-primary/10 border-primary text-primary"
                              : "bg-muted/50 border-transparent text-muted-foreground hover:border-border"
                          }`}
                        >
                          {model.label}
                          <span className="ml-1.5 opacity-60">{model.price}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Benchmark Model */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Benchmark Model</Label>
            <p className="text-xs text-muted-foreground mb-2">
              The model to compare against for savings calculations
            </p>
            <Select value={benchmarkModel} onValueChange={setBenchmarkModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select benchmark model" />
              </SelectTrigger>
              <SelectContent>
                {selectedModels.map(id => (
                  <SelectItem key={id} value={id}>
                    {getModelLabel(id)} {getModelPrice(id) && `(${getModelPrice(id)})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Savings = benchmark cost - actual routed cost
            </p>
          </div>

          {/* Fallback Order */}
          {layers.fallback && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Fallback Priority</Label>
              <p className="text-xs text-muted-foreground mb-2">
                If the primary model fails, Nadir tries the next one in order
              </p>
              <div className="space-y-1.5">
                {fallbackOrder.filter(m => selectedModels.includes(m)).map((modelId, idx) => (
                  <div
                    key={modelId}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 group"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                    <span className="w-6 text-xs text-muted-foreground font-mono">{idx + 1}.</span>
                    <span className="text-sm flex-1">{getModelLabel(modelId)}</span>
                    {idx === 0 && (
                      <Badge variant="outline" className="text-[10px]">Primary</Badge>
                    )}
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={idx === 0}
                        onClick={() => moveFallback(idx, "up")}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={idx === fallbackOrder.length - 1}
                        onClick={() => moveFallback(idx, "down")}
                      >
                        ↓
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feature Layers */}
          <LayerConfig layers={layers} onChange={setLayers} compact />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={selectedModels.length === 0}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
