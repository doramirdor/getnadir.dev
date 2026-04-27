import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Loader2,
  Copy,
  Check,
  Zap,
  Brain,
  Shield,
  Route,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { trackPageView, trackPlaygroundSend, trackPlaygroundResult } from "@/utils/analytics";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  model_parameters?: {
    key_mode?: string;
    layers?: {
      routing?: boolean;
      fallback?: boolean;
      optimize?: string;
    };
    tier_models?: {
      simple?: string;
      medium?: string;
      complex?: string;
    };
    fallback_chain?: string[];
  };
}

interface RoutingMeta {
  model_used?: string;
  provider?: string;
  complexity_score?: number;
  strategy?: string;
  latency_ms?: number;
  cost_usd?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  selection_reasoning?: any;
  nadir?: any;
}

/** Helper to call the dashboard playground endpoint with Supabase JWT */
async function playgroundFetch(path: string, body: any, signal?: AbortSignal) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || JSON.stringify(data));
  return data;
}

export default function Playground() {
  const { user } = useAuth();
  const { toast } = useToast();

  // API key selection
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [selectedKeyConfig, setSelectedKeyConfig] = useState<ApiKeyRecord["model_parameters"] | null>(null);

  // Request state
  const [prompt, setPrompt] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [mode, setMode] = useState<"completion" | "analysis">("analysis");

  // Response state
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string>("");
  const [meta, setMeta] = useState<RoutingMeta | null>(null);
  const [rawJson, setRawJson] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { trackPageView("playground"); }, []);

  // Load user's API keys
  const [keysLoading, setKeysLoading] = useState(true);
  useEffect(() => {
    if (!user?.id) { setKeysLoading(false); return; }
    setKeysLoading(true);
    supabase
      .from("api_keys")
      .select("id, name, prefix, model_parameters")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .then(({ data, error }) => {
        if (error) {
          toast({ variant: "destructive", title: "Failed to load API keys", description: error.message });
          setKeysLoading(false);
          return;
        }
        if (data) setApiKeys(data);
        // Auto-select first key
        if (data?.length && !selectedKeyId) {
          setSelectedKeyId(data[0].id);
          setSelectedKeyConfig(data[0].model_parameters || null);
        }
        setKeysLoading(false);
      });
  }, [user?.id]);

  const handleSelectKey = (keyId: string) => {
    setSelectedKeyId(keyId);
    const key = apiKeys.find((k) => k.id === keyId);
    setSelectedKeyConfig(key?.model_parameters || null);
  };

  const handleSend = async () => {
    if (!prompt.trim()) return;
    if (!selectedKeyId) {
      toast({ variant: "destructive", title: "No API Key", description: "Select an API key first." });
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setResponse("");
    setMeta(null);
    setRawJson(null);
    trackPlaygroundSend(mode);
    const startTime = Date.now();

    try {
      const messages: any[] = [];
      if (systemMessage.trim()) {
        messages.push({ role: "system", content: systemMessage.trim() });
      }
      messages.push({ role: "user", content: prompt.trim() });

      const data = await playgroundFetch("/v1/dashboard/playground", {
        key_id: selectedKeyId,
        messages,
        model: "auto",
        temperature,
        max_tokens: maxTokens,
        mode,
      }, controller.signal);

      const latencyMs = Date.now() - startTime;
      setElapsed(latencyMs);
      setRawJson(data);

      if (mode === "analysis") {
        // Analysis mode — show the routing analysis
        setResponse(JSON.stringify(data, null, 2));
        setMeta({
          model_used: data.recommendation?.selected_model,
          strategy: data.recommendation?.strategy,
          complexity_score: data.complexity_analysis?.extracted_metrics?.complexity_score,
        });
        trackPlaygroundResult(mode, "success", {
          latency_ms: latencyMs,
          model_used: data.recommendation?.selected_model,
        });
      } else {
        // Full completion
        const content = data.choices?.[0]?.message?.content || data.response || "";
        setResponse(content);
        setMeta({
          model_used: data.model_used || data.model,
          provider: data.provider,
          complexity_score: data.nadir?.complexity_score,
          strategy: data.nadir?.mode || "smart-routing",
          latency_ms: data.latency_ms,
          cost_usd: data.cost_usd || data.estimated_cost_usd,
          prompt_tokens: data.usage?.prompt_tokens,
          completion_tokens: data.usage?.completion_tokens,
          selection_reasoning: data.nadir?.model_analysis,
          nadir: data.nadir,
        });
        trackPlaygroundResult(mode, "success", {
          latency_ms: data.latency_ms || latencyMs,
          model_used: data.model_used || data.model,
        });
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        trackPlaygroundResult(mode, "abort", { latency_ms: Date.now() - startTime });
        return; // Superseded by a newer request
      }
      const latencyMs = Date.now() - startTime;
      setElapsed(latencyMs);
      setResponse(`Error: ${error.message}`);
      trackPlaygroundResult(mode, "error", {
        latency_ms: latencyMs,
        error: String(error?.message || error).slice(0, 200),
      });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const layers = selectedKeyConfig?.layers;
  const tierModels = selectedKeyConfig?.tier_models;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Playground</h1>
        <p className="page-description">Test your API key configuration and see how Nadir routes your prompts</p>
      </div>

      {!keysLoading && apiKeys.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <Zap className="h-4 w-4 shrink-0" />
          <span>No API keys found. Create one on the <a href="/dashboard/api-keys" className="underline font-medium">API Keys</a> page first.</span>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ─── Left: Request Panel ─── */}
        <div className="space-y-4">
          {/* API Key & Mode Selection */}
          <Card className="clean-card">
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">API Key</Label>
                  <Select value={selectedKeyId} onValueChange={handleSelectKey}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select a key" />
                    </SelectTrigger>
                    <SelectContent>
                      {apiKeys.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.name} ({k.prefix}...)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Mode</Label>
                  <div className="flex gap-1 mt-1">
                    <Button
                      size="sm"
                      variant={mode === "completion" ? "default" : "outline"}
                      onClick={() => setMode("completion")}
                      className="flex-1 text-xs"
                    >
                      <Play className="w-3 h-3 mr-1" /> Full
                    </Button>
                    <Button
                      size="sm"
                      variant={mode === "analysis" ? "default" : "outline"}
                      onClick={() => setMode("analysis")}
                      className="flex-1 text-xs"
                    >
                      <Brain className="w-3 h-3 mr-1" /> Analysis
                    </Button>
                  </div>
                </div>
              </div>

              {/* Key Config Summary */}
              {selectedKeyConfig && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Key Configuration</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs gap-1">
                      {selectedKeyConfig.key_mode === "hosted" ? (
                        <><Sparkles className="w-3 h-3" /> Hosted</>
                      ) : (
                        <><Zap className="w-3 h-3" /> BYOK</>
                      )}
                    </Badge>
                    {layers?.routing !== false && (
                      <span className="chip chip-direct gap-1">
                        <Route className="w-3 h-3" /> Routing
                      </span>
                    )}
                    {layers?.optimize && layers.optimize !== "off" && (
                      <span className={`chip gap-1 ${layers.optimize === "aggressive" ? "chip-warn" : "chip-cluster"}`}>
                        <Minimize2 className="w-3 h-3" /> Compact ({layers.optimize})
                      </span>
                    )}
                    {layers?.fallback !== false && (
                      <span className="chip chip-load-balance gap-1">
                        <Shield className="w-3 h-3" /> Fallback
                      </span>
                    )}
                  </div>
                  {tierModels && (Object.values(tierModels).some(Boolean)) && (
                    <div className="mt-2 space-y-0.5">
                      {tierModels.simple && (
                        <p className="text-xs text-muted-foreground">Simple → <span className="mono text-foreground">{tierModels.simple}</span></p>
                      )}
                      {tierModels.medium && (
                        <p className="text-xs text-muted-foreground">Medium → <span className="mono text-foreground">{tierModels.medium}</span></p>
                      )}
                      {tierModels.complex && (
                        <p className="text-xs text-muted-foreground">Complex → <span className="mono text-foreground">{tierModels.complex}</span></p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Parameters */}
          <Card className="clean-card">
            <CardContent className="pt-5 space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">System Message (optional)</Label>
                <Textarea
                  value={systemMessage}
                  onChange={(e) => setSystemMessage(e.target.value)}
                  placeholder="You are a helpful assistant..."
                  className="mt-1 h-16 resize-none text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Temperature: {temperature}</Label>
                  <Slider
                    value={[temperature]}
                    onValueChange={([v]) => setTemperature(v)}
                    min={0}
                    max={2}
                    step={0.1}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Max Tokens: {maxTokens}</Label>
                  <Slider
                    value={[maxTokens]}
                    onValueChange={([v]) => setMaxTokens(v)}
                    min={64}
                    max={16384}
                    step={64}
                    className="mt-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prompt Input */}
          <Card className="clean-card">
            <CardContent className="pt-5 space-y-3">
              <Label className="text-xs text-muted-foreground">Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Write a haiku about machine learning..."
                className="min-h-[140px] resize-y text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {mode === "analysis" ? "Analysis only, no LLM call" : "Sends to Nadir, routes to best model"}
                  {" · "}⌘+Enter to send
                </p>
                <Button onClick={handleSend} disabled={loading || !prompt.trim() || !selectedKeyId}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  {loading ? "Sending..." : "Send"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Right: Response Panel ─── */}
        <div className="space-y-4">
          {/* Routing Metadata */}
          {meta && (
            <Card className="clean-card border-blue-100 dark:border-blue-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-foreground flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[hsl(var(--brand-blue-strong))]" strokeWidth={1.75} /> Routing Info
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {meta.model_used && (
                    <div className="p-2.5 bg-muted/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Model</p>
                      <p className="mono text-sm font-medium text-foreground truncate">{meta.model_used}</p>
                    </div>
                  )}
                  {meta.strategy && (
                    <div className="p-2.5 bg-muted/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Strategy</p>
                      <p className="text-sm font-medium text-foreground">{meta.strategy}</p>
                    </div>
                  )}
                  {meta.complexity_score != null && (
                    <div className="p-2.5 bg-muted/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Complexity</p>
                      <p className="text-sm font-medium text-foreground">{Math.round(meta.complexity_score * 100)}%</p>
                    </div>
                  )}
                  {meta.provider && (
                    <div className="p-2.5 bg-muted/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Provider</p>
                      <p className="text-sm font-medium text-foreground">{meta.provider}</p>
                    </div>
                  )}
                  {meta.cost_usd != null && (
                    <div className="p-2.5 bg-muted/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cost</p>
                      <p className="text-sm font-medium text-foreground flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />{meta.cost_usd.toFixed(4)}
                      </p>
                    </div>
                  )}
                  {elapsed > 0 && (
                    <div className="p-2.5 bg-muted/50 rounded-lg">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Latency</p>
                      <p className="text-sm font-medium text-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />{meta.latency_ms || elapsed}ms
                      </p>
                    </div>
                  )}
                </div>
                {(meta.prompt_tokens || meta.completion_tokens) && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Tokens: {meta.prompt_tokens || 0} in / {meta.completion_tokens || 0} out
                  </p>
                )}
                {meta.selection_reasoning && (
                  <div
                    className="mt-3 p-2.5 rounded-lg border"
                    style={{
                      background: "hsl(var(--brand-blue-soft))",
                      borderColor: "hsl(var(--brand-blue) / 0.25)",
                    }}
                  >
                    <p className="text-xs font-medium text-[hsl(var(--brand-blue-strong))] mb-1">Selection Reasoning</p>
                    <p className="text-xs text-[hsl(var(--brand-blue-strong))]">
                      {typeof meta.selection_reasoning === "string"
                        ? meta.selection_reasoning
                        : meta.selection_reasoning.selection_reasoning || meta.selection_reasoning.complexity_reasoning || JSON.stringify(meta.selection_reasoning)
                      }
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Response Content */}
          <Card className="clean-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-foreground">Response</CardTitle>
                {response && (
                  <Button size="sm" variant="ghost" onClick={() => handleCopy(response)}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center space-y-3">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {mode === "analysis" ? "Analyzing routing..." : "Routing & generating..."}
                    </p>
                  </div>
                </div>
              ) : response ? (
                <div className={mode === "analysis" ? "font-mono text-xs" : ""}>
                  <pre className="whitespace-pre-wrap text-sm text-foreground leading-relaxed max-h-[500px] overflow-y-auto">
                    {response}
                  </pre>
                </div>
              ) : (
                <div className="flex items-center justify-center py-16 text-center">
                  <div>
                    <Play className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Write a prompt and hit Send to see Nadir in action
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {mode === "analysis"
                        ? "Analysis mode shows routing decisions without making an LLM call"
                        : "Full mode routes your prompt and returns the LLM response"
                      }
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Raw JSON */}
          {rawJson && (
            <Card className="clean-card">
              <CardContent className="pt-4">
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  {showRaw ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Raw JSON response
                </button>
                {showRaw && (
                  <pre className="mt-3 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-[400px] font-mono">
                    {JSON.stringify(rawJson, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
