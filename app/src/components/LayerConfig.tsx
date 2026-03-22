/**
 * LayerConfig — Feature layer picker for Nadir presets.
 *
 * Three toggleable layers:
 *   - Routing:  complexity analysis → intelligent model selection
 *   - Fallback: auto-retry with ordered fallback chain on failure
 *   - Context Optimize: off / safe (lossless) / aggressive (semantic dedup)
 *
 * Always-on (shown as info, not toggleable):
 *   Token tracking, savings tracking, response healing, rate limiting
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Shield,
  Scissors,
  BarChart3,
  DollarSign,
  Wrench,
  Gauge,
  Save,
  Info,
} from "lucide-react";

export interface Layers {
  routing: boolean;
  fallback: boolean;
  optimize: "off" | "safe" | "aggressive";
}

interface LayerConfigProps {
  layers: Layers;
  onChange: (layers: Layers) => void;
  onSave?: () => void;
  saving?: boolean;
  compact?: boolean;
}

const OPTIMIZE_OPTIONS: { value: Layers["optimize"]; label: string; desc: string }[] = [
  { value: "off", label: "Off", desc: "No optimization" },
  { value: "safe", label: "Safe", desc: "Lossless transforms only" },
  { value: "aggressive", label: "Aggressive", desc: "Safe + semantic dedup" },
];

export default function LayerConfig({ layers, onChange, onSave, saving, compact }: LayerConfigProps) {
  return (
    <div className="space-y-4">
      {/* Toggleable layers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Feature Layers
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose which features are active for your API requests
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Routing */}
          <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <Brain className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Intelligent Routing</p>
                <p className="text-xs text-muted-foreground">
                  Complexity analysis routes each prompt to the optimal model
                </p>
              </div>
            </div>
            <Switch
              checked={layers.routing}
              onCheckedChange={(checked) => onChange({ ...layers, routing: checked })}
            />
          </div>

          {/* Fallback */}
          <div className="flex items-center justify-between py-2 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Shield className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Fallback Chains</p>
                <p className="text-xs text-muted-foreground">
                  Auto-retry with backup models if primary fails
                </p>
              </div>
            </div>
            <Switch
              checked={layers.fallback}
              onCheckedChange={(checked) => onChange({ ...layers, fallback: checked })}
            />
          </div>

          {/* Context Optimize */}
          <div className="py-2 border-b">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-green-50">
                <Scissors className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Context Optimize</p>
                <p className="text-xs text-muted-foreground">
                  Reduce input tokens before sending to the model
                </p>
              </div>
            </div>
            <div className="flex gap-2 ml-11">
              {OPTIMIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChange({ ...layers, optimize: opt.value })}
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
              <p className="text-xs text-muted-foreground ml-11 mt-1.5">
                {layers.optimize === "safe"
                  ? "5 lossless transforms: whitespace, empty messages, duplicate system prompts, ASCII art, comment blocks"
                  : "Safe + diff-preserving semantic dedup using sentence embeddings"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Always-on features (informational) */}
      {!compact && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4" />
              Always Active
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These features run on every request automatically
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: BarChart3, label: "Token Tracking", color: "text-purple-600 bg-purple-50" },
                { icon: DollarSign, label: "Savings Tracking", color: "text-emerald-600 bg-emerald-50" },
                { icon: Wrench, label: "Response Healing", color: "text-blue-600 bg-blue-50" },
                { icon: Gauge, label: "Rate Limiting", color: "text-red-600 bg-red-50" },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="flex items-center gap-2 py-1.5">
                  <div className={`p-1.5 rounded-md ${color.split(" ")[1]}`}>
                    <Icon className={`h-3.5 w-3.5 ${color.split(" ")[0]}`} />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto">
                    ON
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {onSave && (
        <Button onClick={onSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Layer Configuration"}
        </Button>
      )}
    </div>
  );
}
