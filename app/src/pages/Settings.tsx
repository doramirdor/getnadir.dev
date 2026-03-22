
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Save, LogOut, Brain, DollarSign, Settings as SettingsIcon, Shield, Key } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { logger } from "@/utils/logger";
import LayerConfig, { type Layers } from "@/components/LayerConfig";

const Settings = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [benchmarkModel, setBenchmarkModel] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [layers, setLayers] = useState<Layers>({ routing: true, fallback: true, optimize: "off" });

  useEffect(() => {
    if (user) {
      fetchUserProfile();
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
        .eq('id', user.id)
        .single();

      if (error) {
        logger.error('Supabase error:', error);
        throw error;
      }

      logger.log('User profile fetched successfully:', data);
      setUserProfile(data);
      setBenchmarkModel(data.benchmark_model || '');
      setCompanyName(data.name || data.full_name || '');
      // Load layers from profile model_parameters
      const savedLayers = data.model_parameters?.layers;
      if (savedLayers) {
        setLayers({
          routing: savedLayers.routing ?? true,
          fallback: savedLayers.fallback ?? true,
          optimize: savedLayers.optimize ?? "off",
        });
      }
    } catch (error) {
      logger.error('Error fetching user profile:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load user profile. Please refresh the page.",
      });
    }
  };

  const handleSave = async () => {
    if (!user || !userProfile) return;

    setLoading(true);
    try {
      // Merge layers into existing model_parameters
      const existingParams = userProfile?.model_parameters || {};
      const { error } = await supabase
        .from('profiles')
        .update({
          name: companyName,
          benchmark_model: benchmarkModel,
          model_parameters: { ...existingParams, layers },
        })
        .eq('id', user.id);

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

      {/* Benchmark Model */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <CardTitle className="text-foreground">Benchmark Model</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Model Name</label>
            <Input
              value={benchmarkModel}
              onChange={(e) => setBenchmarkModel(e.target.value)}
              placeholder="e.g. gpt-4o"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The model used for cost calculations and performance benchmarking.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Feature Layers */}
      <LayerConfig layers={layers} onChange={setLayers} />

      {/* Current Usage */}
      {userProfile && (
        <Card className="clean-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <CardTitle className="text-foreground">Current Usage</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cost this month:</span>
                <span className="font-medium">${(userProfile.cost_this_month || 0).toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provider Keys */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <CardTitle className="text-foreground">Provider Keys</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configure your provider API keys in the <strong>Integrations</strong> page to bring your own keys for each LLM provider.
          </p>
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
