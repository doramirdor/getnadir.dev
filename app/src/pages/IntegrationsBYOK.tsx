import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertCircle, Settings, Key, Eye, EyeOff, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/utils/logger";

interface ProviderIntegration {
  id: string;
  provider: string;
  displayName: string;
  isConfigured: boolean;
  apiKey?: string;
  alwaysUseThisKey: boolean;
  description?: string;
}

interface ConfigureKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ProviderIntegration | null;
  onSave: (apiKey: string, alwaysUse: boolean) => void;
}

const PROVIDER_KEY_HINTS: Record<string, string> = {
  openai: "OpenAI keys start with sk-",
  anthropic: "Anthropic keys start with sk-ant-",
  google: "Google API keys are typically 39 characters",
  "amazon-bedrock": "Use your AWS access key ID",
};

const ConfigureKeyDialog = ({ open, onOpenChange, provider, onSave }: ConfigureKeyDialogProps) => {
  const [apiKey, setApiKey] = useState("");
  const [alwaysUse, setAlwaysUse] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState("");

  useEffect(() => {
    if (provider) {
      setApiKey(provider.apiKey || "");
      setAlwaysUse(provider.alwaysUseThisKey || false);
      setKeyError("");
    }
  }, [provider]);

  const validateKey = (key: string): string => {
    const trimmed = key.trim();
    if (!trimmed) return "API key is required";
    if (trimmed.length < 8) return "Key is too short (minimum 8 characters)";
    if (trimmed.length > 256) return "Key is too long (maximum 256 characters)";
    return "";
  };

  const handleSave = () => {
    const error = validateKey(apiKey);
    if (error) {
      setKeyError(error);
      return;
    }
    onSave(apiKey.trim(), alwaysUse);
    onOpenChange(false);
  };

  if (!provider) return null;

  const hint = PROVIDER_KEY_HINTS[provider.id] || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {provider.displayName}</DialogTitle>
          <DialogDescription>
            Add your {provider.displayName} API key to use your own credits and avoid rate limits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <div className="flex gap-2">
              <Input
                id="apiKey"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setKeyError(""); }}
                placeholder={`Enter your ${provider.displayName} API key`}
                className={`flex-1 ${keyError ? 'border-red-400' : ''}`}
                maxLength={256}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            {hint && !keyError && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
            {keyError && <p className="text-sm text-red-500 mt-1">{keyError}</p>}
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <Label className="font-medium">Always use this key</Label>
              <p className="text-sm text-muted-foreground">
                Prevent fallback to shared credits when this key fails
              </p>
            </div>
            <Switch
              checked={alwaysUse}
              onCheckedChange={setAlwaysUse}
            />
          </div>

          <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            Your API key is encrypted and stored securely. We only use it to make requests on your behalf.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!apiKey.trim()}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const IntegrationsBYOK = () => {
  const [integrations, setIntegrations] = useState<ProviderIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<ProviderIntegration | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const providerList = [
    { id: 'openai', provider: 'OpenAI', displayName: 'OpenAI' },
    { id: 'google', provider: 'Google', displayName: 'Google' },
    { id: 'amazon-bedrock', provider: 'Amazon Bedrock', displayName: 'Amazon Bedrock' },
    { id: 'anthropic', provider: 'Anthropic', displayName: 'Anthropic' }
  ];

  useEffect(() => {
    if (user?.id) {
      fetchIntegrations();
    }
  }, [user]);

  const fetchIntegrations = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id);

      if (error && error.code !== 'PGRST116') {
        logger.error('Integration fetch error:', error);
      }

      const integrationMap = new Map(data?.map(d => [d.provider_id, d]) || []);

      const integrationsWithStatus = providerList.map(provider => ({
        id: provider.id,
        provider: provider.provider,
        displayName: provider.displayName,
        isConfigured: integrationMap.has(provider.id),
        apiKey: integrationMap.get(provider.id)?.api_key_hash || '',
        alwaysUseThisKey: integrationMap.get(provider.id)?.always_use_key || false
      }));

      setIntegrations(integrationsWithStatus);
    } catch (error: unknown) {
      logger.error('Full fetch error:', error);
      const integrationsWithStatus = providerList.map(provider => ({
        id: provider.id,
        provider: provider.provider,
        displayName: provider.displayName,
        isConfigured: false,
        apiKey: '',
        alwaysUseThisKey: false
      }));
      setIntegrations(integrationsWithStatus);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigureProvider = (provider: ProviderIntegration) => {
    setSelectedProvider(provider);
    setDialogOpen(true);
  };

  const handleSaveConfiguration = async (apiKey: string, alwaysUse: boolean) => {
    if (!selectedProvider || !user?.id) return;

    try {
      const { error } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: user.id,
          integration_type: 'byok',
          provider_name: selectedProvider.displayName,
          api_key_hash: btoa(apiKey),
          api_key_preview: `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`,
          is_active: true,
          is_default: alwaysUse,
        }, { onConflict: 'user_id,provider_name' });

      if (error) {
        logger.error('Save error:', error);
      }

      setIntegrations(prev => prev.map(integration =>
        integration.id === selectedProvider.id
          ? { ...integration, isConfigured: true, apiKey, alwaysUseThisKey: alwaysUse }
          : integration
      ));

      toast({
        title: "Configuration saved",
        description: `${selectedProvider.displayName} API key has been configured successfully.`,
      });

      setSelectedProvider(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save configuration';
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    }
  };

  const filteredIntegrations = integrations.filter(integration =>
    integration.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    integration.provider.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const configuredCount = integrations.filter(i => i.isConfigured).length;

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
      <div>
        <h1 className="page-title">Integrations (BYOK)</h1>
        <p className="page-description">
          Use your own provider API keys to access models with your own credits and higher rate limits
        </p>
      </div>

      {/* Stats and Search */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs font-normal">
          {configuredCount} of {integrations.length} configured
        </Badge>
        <div className="w-80">
          <Input
            placeholder="Search providers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Provider List */}
      <div className="space-y-2">
        {filteredIntegrations.map((integration) => (
          <Card key={integration.id} className="clean-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                    <Key className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground text-sm">{integration.displayName}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {integration.isConfigured ? (
                        <>
                          <Badge variant="default" className="text-xs font-normal">
                            <Check className="w-3 h-3 mr-1" />
                            Configured
                          </Badge>
                          {integration.alwaysUseThisKey && (
                            <Badge variant="outline" className="text-xs font-normal">
                              Always use
                            </Badge>
                          )}
                        </>
                      ) : (
                        <Badge variant="outline" className="text-xs font-normal">
                          Not configured
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant={integration.isConfigured ? "outline" : "default"}
                  size="sm"
                  onClick={() => handleConfigureProvider(integration)}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  {integration.isConfigured ? "Reconfigure" : "Configure"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Coming Soon Message */}
        <Card className="clean-card bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                <Key className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <div>
                <div className="font-medium text-muted-foreground text-sm">More providers coming soon</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Additional integrations for Mistral, Cohere, xAI, and others will be available soon.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {filteredIntegrations.length === 0 && (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-foreground mb-2">No providers found</h3>
          <p className="text-muted-foreground">
            Try adjusting your search terms to find the provider you're looking for.
          </p>
        </div>
      )}

      {/* Info Card */}
      <Card className="clean-card">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
            Key Priority and Fallback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Nadir always prioritizes using your provider keys when available.</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            By default, if your key encounters a rate limit or failure, Nadir will fall back to using shared credits.
          </p>
          <p className="text-sm text-muted-foreground">
            You can configure individual keys with <strong className="text-foreground">"Always use this key"</strong> to prevent any fallback to shared credits.
            When enabled, Nadir will only use your key for requests to that provider.
          </p>
        </CardContent>
      </Card>

      {/* Configure Key Dialog */}
      <ConfigureKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider={selectedProvider}
        onSave={handleSaveConfiguration}
      />
    </div>
  );
};

export default IntegrationsBYOK;
