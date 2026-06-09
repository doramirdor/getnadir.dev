import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Copy, Trash2, Key, Settings2, Eye, EyeOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useApiKey } from "@/hooks/useApiKey";
import { logger } from "@/utils/logger";
import CreateApiKeyDialog from "@/components/CreateApiKeyDialog";
import { trackPageView, trackApiKeyCreated, trackApiKeyDeleted } from "@/utils/analytics";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Stash the freshly-created key here when we redirect to Stripe to collect a
// card. sessionStorage survives the cross-origin round trip (same tab, same
// origin on return), so we can re-show the one-time key after checkout.
const PENDING_KEY_STORAGE = "nadir_pending_reveal_key";

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  is_active: boolean;
  last_used_at: string | null;
  selected_models: string[] | null;
  benchmark_model: string | null;
  model_parameters: Record<string, any> | null;
}

const ApiKeys = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnceKey, setShowOnceKey] = useState<string | null>(null);
  const [configKeyId, setConfigKeyId] = useState<string | null>(null);
  const [configEditData, setConfigEditData] = useState<any>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [sessionKeys, setSessionKeys] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { apiKey: sessionApiKey, setApiKey: setSessionApiKey } = useApiKey();

  useEffect(() => {
    if (sessionApiKey && sessionApiKey.length >= 8) {
      const prefix = sessionApiKey.substring(0, 8);
      setSessionKeys((prev) =>
        prev[prefix] === sessionApiKey ? prev : { ...prev, [prefix]: sessionApiKey },
      );
    }
  }, [sessionApiKey]);

  useEffect(() => {
    trackPageView("api_keys");
    fetchApiKeys();
  }, []);

  // Returning from the Stripe card-collection round trip: re-reveal the
  // one-time key we stashed before redirecting, and acknowledge the outcome.
  useEffect(() => {
    let pending: string | null = null;
    try { pending = sessionStorage.getItem(PENDING_KEY_STORAGE); } catch { /* ignore */ }
    if (pending) {
      try { sessionStorage.removeItem(PENDING_KEY_STORAGE); } catch { /* ignore */ }
      setSessionApiKey(pending);
      setShowOnceKey(pending);
    }
    const card = new URLSearchParams(window.location.search).get("card");
    if (card === "added") {
      toast({
        title: "Card on file",
        description: "You're all set. You only pay on what we save you.",
      });
    } else if (card === "skipped") {
      toast({
        variant: "destructive",
        title: "No payment method added",
        description: "Add a card in Billing before this key can route.",
      });
    }
  }, []);

  // Returning from Stripe checkout after upgrading mid-wizard — re-open the
  // create dialog so the user can finish picking Hosted mode + finalize the
  // key. The Pro gate inside CreateApiKeyDialog will now allow Hosted because
  // the subscription is active.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true") {
      setShowCreateDialog(true);
      toast({
        title: "Pro trial active",
        description: "You can now create a Hosted API key.",
      });
      window.history.replaceState({}, "", "/dashboard/api-keys");
    }
  }, [toast]);

  const fetchApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, prefix, created_at, is_active, last_used_at, selected_models, benchmark_model, model_parameters')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch API keys";
      logger.error('API Keys fetch error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  // After creating a key, make sure the user has a card on file. If not,
  // redirect to Stripe Checkout — the existing $0/mo base subscription with
  // payment_method_collection: "always" — so the monthly savings-fee invoice
  // and any "use our keys" usage have a payment method to charge off-session.
  // Returns true when we're navigating away to Stripe.
  const ensureCardOnFile = async (newKey: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // An active subscription row means a card is already on file (checkout
      // forces one), so we don't prompt again on subsequent key creations.
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (sub?.status === "active") return false;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return false;

      const res = await fetch(`${API_BASE}/v1/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          plan_id: "pro",
          success_url: `${window.location.origin}/dashboard/api-keys?card=added`,
          cancel_url: `${window.location.origin}/dashboard/api-keys?card=skipped`,
        }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { checkout_url?: string };
      if (!data.checkout_url) return false;

      // Persist the one-time key so it survives the Stripe round trip and can
      // be re-revealed when the user returns (whether they add the card or not).
      try { sessionStorage.setItem(PENDING_KEY_STORAGE, newKey); } catch { /* ignore */ }
      window.location.href = data.checkout_url;
      return true;
    } catch (e) {
      // Never block key creation on a billing hiccup — the key still exists
      // and the user can add a card later from Billing.
      logger.error("ensureCardOnFile failed:", e);
      return false;
    }
  };

  const handleCreateKey = async (config: {
    name: string;
    selected_models: string[];
    benchmark_model: string;
    model_parameters: Record<string, any>;
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Generate API key using cryptographically secure random values
      const randomBytes = crypto.getRandomValues(new Uint8Array(24));
      const apiKey = `sk-${Array.from(randomBytes, b => b.toString(36).padStart(2, '0')).join('').substring(0, 32)}`;
      const prefix = apiKey.substring(0, 8);

      // Hash with SHA-256 (one-way -- key cannot be recovered from DB)
      const keyHash = await sha256(apiKey);

      const insertData = {
        user_id: user.id,
        name: config.name,
        key_hash: keyHash,
        prefix: prefix,
        is_active: true,
        selected_models: config.selected_models,
        benchmark_model: config.benchmark_model,
        model_parameters: config.model_parameters,
      };

      const { error } = await supabase
        .from('api_keys')
        .insert(insertData);

      if (error) throw error;

      // Store key in session so user doesn't have to re-enter it
      setSessionApiKey(apiKey);
      trackApiKeyCreated("dashboard");

      // Show the key once before clearing
      setShowOnceKey(apiKey);

      fetchApiKeys();

      // Collect a card with Stripe if the user doesn't have one yet. If this
      // redirects to Checkout, the key is stashed and re-revealed on return.
      await ensureCardOnFile(apiKey);
    } catch (error: unknown) {
      logger.error('Create key error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create API key";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
      throw error; // re-throw so dialog knows it failed
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!window.confirm("Are you sure you want to delete this API key? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;

      trackApiKeyDeleted();
      toast({
        title: "Success",
        description: "API key deleted successfully",
      });

      fetchApiKeys();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete API key";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    }
  };

  const handleOpenConfig = (key: ApiKey) => {
    setConfigKeyId(key.id);
    setConfigEditData({
      name: key.name,
      selected_models: key.selected_models || [],
      benchmark_model: key.benchmark_model || "",
      model_parameters: key.model_parameters || {},
    });
  };

  const handleSaveConfig = async (config: { name: string; selected_models: string[]; benchmark_model: string; model_parameters: Record<string, any> }) => {
    if (!configKeyId) return;
    try {
      const { error } = await supabase
        .from("api_keys")
        .update({
          selected_models: config.selected_models,
          benchmark_model: config.benchmark_model,
          model_parameters: config.model_parameters,
        })
        .eq("id", configKeyId);

      if (error) throw error;

      toast({ title: "Saved", description: "API key configuration updated" });
      setConfigKeyId(null);
      fetchApiKeys();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to save config";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "API key copied to clipboard",
    });
  };

  const getFullKey = (prefix: string): string | null => sessionKeys[prefix] ?? null;

  const toggleReveal = (keyId: string) => {
    setRevealedKeys((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between animate-fade-up">
        <div className="page-header">
          <h1 className="page-title">API Keys</h1>
          <p className="page-description">Create and manage keys for your LLM routing workloads</p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          size="sm"
          className="focus-ring shrink-0"
        >
          <Plus className="w-4 h-4 mr-2" strokeWidth={2} />
          New API Key
        </Button>
      </div>

      {/* Intro callout — accent-soft blue tint per ApiKeysScreen.jsx */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl border border-border"
        style={{ background: "hsl(var(--brand-blue-soft))" }}
      >
        <span className="text-[hsl(var(--brand-blue-strong))] mt-0.5 flex-shrink-0">
          <Key className="w-4 h-4" strokeWidth={1.75} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-foreground mb-0.5">
            Your keys are OpenAI-compatible
          </div>
          <div className="text-[12px] text-muted-foreground">
            Drop in any key below as{" "}
            <code className="mono text-[11px] bg-card border border-border rounded px-1.5 py-0.5">
              OPENAI_API_KEY
            </code>{" "}
            and point your base URL to{" "}
            <code className="mono text-[11px] bg-card border border-border rounded px-1.5 py-0.5">
              https://api.getnadir.com/v1
            </code>
            .
          </div>
        </div>
      </div>

      {/* Existing API Keys */}
      <Card className="clean-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Your API Keys</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-3">
            {apiKeys.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                  <Key className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No API keys yet</h3>
                <p className="text-muted-foreground mb-4">Create your first API key to get started.</p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" strokeWidth={2} />
                  Create API Key
                </Button>
              </div>
            ) : (
              apiKeys.map((apiKey) => (
                <div
                  key={apiKey.id}
                  className="group p-5 rounded-xl border border-border bg-card hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="font-semibold text-foreground text-[15px] truncate">
                          {apiKey.name}
                        </h3>
                        {apiKey.is_active ? (
                          <span className="chip chip-ok">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: "hsl(var(--ok-dot))" }}
                            />
                            Active
                          </span>
                        ) : (
                          <span className="chip chip-neutral">Paused</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        {(() => {
                          const fullKey = getFullKey(apiKey.prefix);
                          const isRevealed = !!revealedKeys[apiKey.id];
                          const canReveal = !!fullKey;
                          const displayValue =
                            isRevealed && fullKey
                              ? fullKey
                              : `${apiKey.prefix}…••••••••`;
                          return (
                            <>
                              <code className="mono bg-muted px-3 py-1.5 rounded-lg text-[12px] text-muted-foreground flex-1 min-w-0 truncate">
                                {displayValue}
                              </code>
                              {canReveal && (
                                <>
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => toggleReveal(apiKey.id)}
                                          className="hover:bg-muted"
                                          aria-label={
                                            isRevealed ? "Hide key" : "Show key"
                                          }
                                        >
                                          {isRevealed ? (
                                            <EyeOff
                                              className="w-4 h-4"
                                              strokeWidth={1.5}
                                            />
                                          ) : (
                                            <Eye
                                              className="w-4 h-4"
                                              strokeWidth={1.5}
                                            />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        {isRevealed
                                          ? "Hide full key"
                                          : "Reveal full key"}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            copyToClipboard(fullKey)
                                          }
                                          className="hover:bg-muted"
                                          aria-label="Copy full key"
                                        >
                                          <Copy
                                            className="w-4 h-4"
                                            strokeWidth={1.5}
                                          />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        Copy full key
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                        <span>
                          Created{" "}
                          <span className="mono">
                            {new Date(apiKey.created_at).toLocaleDateString()}
                          </span>
                        </span>
                        <span>
                          Last used{" "}
                          <span className="mono">
                            {apiKey.last_used_at
                              ? new Date(apiKey.last_used_at).toLocaleDateString()
                              : "Never"}
                          </span>
                        </span>
                        {apiKey.selected_models && apiKey.selected_models.length > 0 && (
                          <span>
                            <span className="mono">{apiKey.selected_models.length}</span>{" "}
                            models configured
                          </span>
                        )}
                        {apiKey.benchmark_model && (
                          <span>
                            Benchmark: <span className="mono">{apiKey.benchmark_model}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleOpenConfig(apiKey)}
                      >
                        <Settings2 className="w-4 h-4 mr-1" strokeWidth={1.5} />
                        Configure
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteKey(apiKey.id)}
                        aria-label="Delete key"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={2} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create API Key Dialog (multi-step wizard) */}
      <CreateApiKeyDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreateKey}
      />

      {/* API Key Configuration Dialog (reuses create wizard in edit mode) */}
      <CreateApiKeyDialog
        open={!!configKeyId}
        onClose={() => { setConfigKeyId(null); setConfigEditData(null); }}
        onCreate={handleSaveConfig}
        editConfig={configEditData}
      />

      {/* Show-Once Key Dialog */}
      <Dialog open={!!showOnceKey} onOpenChange={(open) => { if (!open) setShowOnceKey(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Your new API Key</DialogTitle>
            <DialogDescription>
              Copy this key now. For security, it cannot be displayed again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <code className="block w-full p-3 bg-muted rounded-lg mono text-sm break-all select-all">
              {showOnceKey}
            </code>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (showOnceKey) copyToClipboard(showOnceKey);
              }}
            >
              <Copy className="w-4 h-4 mr-2" /> Copy to Clipboard
            </Button>
            <Button variant="outline" onClick={() => setShowOnceKey(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiKeys;
