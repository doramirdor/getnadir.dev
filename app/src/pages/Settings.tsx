
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Save, LogOut, Brain, DollarSign, Settings as SettingsIcon, Shield, Key, Trash2, AlertTriangle, Loader2, MessageSquare, Send } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useApiKey } from "@/hooks/useApiKey";
import { logger } from "@/utils/logger";
import LayerConfig, { type Layers } from "@/components/LayerConfig";
import { trackPageView } from "@/utils/analytics";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const Settings = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { apiKey } = useApiKey();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [sendingSupport, setSendingSupport] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [benchmarkModel, setBenchmarkModel] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [layers, setLayers] = useState<Layers>({ routing: true, fallback: true, optimize: "off" });

  useEffect(() => { trackPageView("settings"); }, []);

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

      {/* Contact Support */}
      <Card className="clean-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <CardTitle className="text-foreground">Contact Support</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Subject</label>
            <Input
              value={supportSubject}
              onChange={(e) => setSupportSubject(e.target.value)}
              placeholder="e.g. Billing question, Bug report, Feature request"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">Message</label>
            <Textarea
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              placeholder="Describe your issue or question..."
              className="min-h-[120px] resize-y"
            />
          </div>
          <Button
            disabled={sendingSupport || !supportSubject.trim() || !supportMessage.trim()}
            onClick={async () => {
              if (!apiKey) {
                toast({ variant: "destructive", title: "Error", description: "API key required to submit a ticket." });
                return;
              }
              setSendingSupport(true);
              try {
                const res = await fetch(`${API_BASE}/v1/support/tickets`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
                  body: JSON.stringify({ subject: supportSubject.trim(), message: supportMessage.trim() }),
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.detail || `HTTP ${res.status}`);
                }
                toast({ title: "Ticket submitted", description: "We'll get back to you soon." });
                setSupportSubject("");
                setSupportMessage("");
              } catch (error: any) {
                toast({ variant: "destructive", title: "Failed to submit", description: error?.message || "Please try again." });
              } finally {
                setSendingSupport(false);
              }
            }}
          >
            {sendingSupport ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-4 h-4 mr-2" /> Send Message</>
            )}
          </Button>
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

      {/* Danger Zone — Delete Account */}
      <Separator />
      <Card className="clean-card border-destructive/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data. This action is
            irreversible and complies with GDPR and CCPA data deletion requirements.
            Your subscription will be cancelled, payment methods removed, and all
            usage data, API keys, and personal information will be erased.
          </p>

          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete My Account
            </Button>
          ) : (
            <div className="space-y-3 p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
              <p className="text-sm font-medium text-destructive">
                Type <strong>DELETE</strong> to confirm permanent account deletion:
              </p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="border-destructive/30 max-w-xs"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={deleteConfirmText !== "DELETE" || deleting}
                  onClick={async () => {
                    if (!apiKey) return;
                    setDeleting(true);
                    try {
                      const res = await fetch(`${API_BASE}/v1/account`, {
                        method: "DELETE",
                        headers: {
                          "Content-Type": "application/json",
                          "X-API-Key": apiKey,
                        },
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.detail || `HTTP ${res.status}`);
                      }
                      toast({
                        title: "Account deleted",
                        description: "Your account and all data have been permanently deleted.",
                      });
                      await signOut();
                    } catch (error: any) {
                      toast({
                        variant: "destructive",
                        title: "Deletion failed",
                        description: error?.message || "Something went wrong. Please try again.",
                      });
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Permanently Delete Account
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
