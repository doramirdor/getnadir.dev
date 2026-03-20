
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Save, LogOut, Brain, DollarSign, Settings as SettingsIcon, Shield, Mail, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { logger } from "@/utils/logger";

interface AvailableModel {
  model_name: string;
  provider_name: string;
  owner: string;
}

interface UserProvider {
  id: string;
  user_id: string;
  provider_id: string;
  enabled: boolean;
  use_byok: boolean;
  api_key_hash: string | null;
  allowed_models: string[];
  budget_limit: number | null;
  cost_this_month: number | null;
  requests_this_month: number | null;
  provider: {
    id: string;
    name: string;
    provider_id: string;
    models: string[];
  };
}

interface Provider {
  id: string;
  name: string;
  provider_id: string;
  models: string[];
}

const Settings = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [benchmarkModel, setBenchmarkModel] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [allProviders, setAllProviders] = useState<Provider[]>([]);
  const [allowedProviders, setAllowedProviders] = useState<string[]>([]);
  const [ignoredProviders, setIgnoredProviders] = useState<string[]>([]);
  const [alwaysEnforce, setAlwaysEnforce] = useState(false);
  const [lowBalanceNotifications, setLowBalanceNotifications] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState("");

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchAvailableModels();
      fetchAllProviders();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    try {
      logger.log('Fetching user profile for user:', user?.id);

      if (!user?.id) {
        logger.error('No user ID available');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        logger.error('Supabase error:', error);
        throw error;
      }

      logger.log('User profile fetched successfully:', data);
      setUserProfile(data);
      setBenchmarkModel(data.benchmark_model || ''); // Load from profile or empty
      setMonthlyBudget(data.monthly_budget?.toString() || '100'); // Load from profile
      setCompanyName(data.name || '');
      setAllowedProviders(data.allowed_providers || []);
      setIgnoredProviders(data.ignored_providers || []);
      setAlwaysEnforce(data.always_enforce_providers || false);
      setLowBalanceNotifications(data.low_balance_notifications ?? true);
      setNotificationEmail(data.notification_email || user?.email || '');
    } catch (error) {
      logger.error('Error fetching user profile:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load user profile. Please refresh the page.",
      });
    }
  };

  const fetchAvailableModels = async () => {
    if (!user?.id) return;

    try {
      // Fetch user's enabled providers with their configurations
      const { data: userProviders, error } = await supabase
        .from('user_providers')
        .select(`
          *,
          provider:providers(*)
        `)
        .eq('user_id', user.id)
        .eq('enabled', true);

      if (error) {
        logger.error('Error fetching user providers for benchmark:', error);
        return;
      }

      const userAvailableModels: AvailableModel[] = [];

      (userProviders || []).forEach((userProvider: UserProvider) => {
        const modelsToUse = userProvider.allowed_models && userProvider.allowed_models.length > 0
          ? userProvider.allowed_models
          : userProvider.provider.models;

        modelsToUse.forEach(modelName => {
          userAvailableModels.push({
            model_name: modelName,
            provider_name: userProvider.provider.name,
            owner: userProvider.provider.provider_id
          });
        });
      });

      setAvailableModels(userAvailableModels);
      logger.log('Available models for benchmark loaded:', userAvailableModels.length);
    } catch (error: any) {
      logger.error('Error fetching available models:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch available models for benchmark selection",
      });
    }
  };

  const fetchAllProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('providers')
        .select('id, name, provider_id, models')
        .order('name');

      if (error) throw error;

      const providers: Provider[] = (data || []).map(item => ({
        id: item.provider_id,
        name: item.name,
        provider_id: item.provider_id,
        models: item.models || []
      }));

      setAllProviders(providers);
    } catch (error) {
      logger.error('Error fetching providers:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch providers",
      });
    }
  };

  const addAllowedProvider = (providerId: string) => {
    if (!allowedProviders.includes(providerId)) {
      setAllowedProviders([...allowedProviders, providerId]);
    }
  };

  const removeAllowedProvider = (providerId: string) => {
    setAllowedProviders(allowedProviders.filter(id => id !== providerId));
  };

  const addIgnoredProvider = (providerId: string) => {
    if (!ignoredProviders.includes(providerId)) {
      setIgnoredProviders([...ignoredProviders, providerId]);
    }
  };

  const removeIgnoredProvider = (providerId: string) => {
    setIgnoredProviders(ignoredProviders.filter(id => id !== providerId));
  };

  const handleSave = async () => {
    if (!user || !userProfile) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: companyName,
          benchmark_model: benchmarkModel,
          monthly_budget: parseFloat(monthlyBudget) || 100,
          allowed_providers: allowedProviders,
          ignored_providers: ignoredProviders,
          always_enforce_providers: alwaysEnforce,
          low_balance_notifications: lowBalanceNotifications,
          notification_email: notificationEmail
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: "Your settings have been updated successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };


  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to sign out. Please try again.",
      });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-description">Configure your Nadir preferences and limits</p>
      </div>

      {/* Basic Settings */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-primary" />
            <CardTitle className="text-foreground">Account Information</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Name</label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your name or company name"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Email</label>
            <Input
              value={user?.email || ""}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground mt-1">Email cannot be changed from here</p>
          </div>
        </CardContent>
      </Card>

      {/* Budget Settings */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            <CardTitle className="text-foreground">Budget Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Overall Monthly Budget</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                className="pl-8"
                placeholder="100"
                min="0"
                step="10"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Set your total monthly spending limit across all providers.
            </p>
          </div>


          {userProfile && (
            <div className="bg-muted rounded-lg p-3">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Current Usage</h4>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">This month:</span>
                <span className="font-medium">${(userProfile.cost_this_month || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Remaining:</span>
                <span className="font-medium text-primary">
                  ${((userProfile.monthly_budget || 100) - (userProfile.cost_this_month || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Low Balance Notifications */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <CardTitle className="text-foreground">Low Balance Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-muted-foreground block">Send me emails</label>
              <p className="text-xs text-muted-foreground">Get notified when your balance is running low</p>
            </div>
            <Switch
              checked={lowBalanceNotifications}
              onCheckedChange={setLowBalanceNotifications}
            />
          </div>

          {lowBalanceNotifications && (
            <div className="bg-muted rounded-lg p-3">
              <p className="text-sm text-muted-foreground">
                Alert notifications will be sent to <strong>{notificationEmail}</strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Allowed Providers */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle className="text-foreground">Allowed Providers</CardTitle>
          </div>
          <p className="text-muted-foreground text-sm">
            Select the providers you want to exclusively enable for your requests. Additional providers can be added on API requests via the `only` field. Enabling Always enforce will ensure that only the providers you have explicitly allowed will be used.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Always enforce</label>
            <Switch
              checked={alwaysEnforce}
              onCheckedChange={setAlwaysEnforce}
            />
          </div>

          <div>
            <Select onValueChange={addAllowedProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {allProviders
                  .filter(provider => !allowedProviders.includes(provider.id))
                  .map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {allowedProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No providers are specifically allowed. All non-ignored providers are used.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allowedProviders.map((providerId) => {
                const provider = allProviders.find(p => p.id === providerId);
                return provider ? (
                  <Badge
                    key={providerId}
                    variant="outline"
                    className="flex items-center gap-1 text-emerald-600 border-emerald-200 bg-emerald-50"
                  >
                    {provider.name}
                    <X
                      className="w-3 h-3 cursor-pointer"
                      onClick={() => removeAllowedProvider(providerId)}
                    />
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ignored Providers */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <CardTitle className="text-foreground">Ignored Providers</CardTitle>
          </div>
          <p className="text-muted-foreground text-sm">
            Select the providers you want to exclude from serving your requests.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Select onValueChange={addIgnoredProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {allProviders
                  .filter(provider => !ignoredProviders.includes(provider.id))
                  .map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {ignoredProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No providers are ignored.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ignoredProviders.map((providerId) => {
                const provider = allProviders.find(p => p.id === providerId);
                return provider ? (
                  <Badge
                    key={providerId}
                    variant="outline"
                    className="flex items-center gap-1 text-red-600 border-red-200 bg-red-50"
                  >
                    {provider.name}
                    <X
                      className="w-3 h-3 cursor-pointer"
                      onClick={() => removeIgnoredProvider(providerId)}
                    />
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="text-destructive"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
        <Button
          onClick={handleSave}
          disabled={loading}
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};

export default Settings;
