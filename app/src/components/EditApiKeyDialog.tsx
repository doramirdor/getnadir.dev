
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

interface ProviderModel {
  id: string;
  provider: string;
  model_id: string;
  model_name: string;
  display_name: string;
  description: string;
  is_available: string;
}

interface GroupedProvider {
  name: string;
  models: string[];
}

interface EditApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (apiKey: any) => void;
  apiKey?: any;
}


export const EditApiKeyDialog = ({ open, onOpenChange, onSave, apiKey }: EditApiKeyDialogProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: apiKey?.name || "",
    allowedProviders: apiKey?.allowedProviders || [],
    allowedModels: apiKey?.allowedModels || [],
    benchmarkModel: apiKey?.benchmarkModel || ""
  });
  const [providers, setProviders] = useState<GroupedProvider[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      logger.log('Dialog opened, fetching providers...');
      fetchProviders();
    }
  }, [open]);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      // First check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // First, let's see what data we're getting
      const { data, error } = await supabase
        .from('providers')
        .select('provider, model_id, model_name, display_name, is_available')
        .order('provider, model_name');

      logger.log('Raw provider data:', data);
      logger.log('Data length:', data?.length);
      
      if (error) {
        logger.error('Supabase error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data || data.length === 0) {
        logger.log('No provider data returned from database');
        setProviders([]);
        return;
      }

      // Filter only available models and group by provider
      const availableModels = data.filter(model => 
        model.is_available === 'true' || model.is_available === true
      );
      
      logger.log('Available models after filtering:', availableModels.length, 'out of', data.length);

      const groupedProviders: { [key: string]: string[] } = {};
      availableModels.forEach(model => {
        const providerName = model.provider;
        if (!groupedProviders[providerName]) {
          groupedProviders[providerName] = [];
        }
        groupedProviders[providerName].push(model.model_id);
      });

      logger.log('Grouped providers object:', groupedProviders);

      // Convert to array format
      const providerArray = Object.entries(groupedProviders).map(([name, models]) => ({
        name,
        models
      }));

      logger.log('Final provider array:', providerArray);
      setProviders(providerArray);
      logger.log('Loaded providers for API key dialog:', providerArray.length, 'providers with', availableModels.length, 'total models');
    } catch (error: any) {
      logger.error('Complete error object:', error);
      toast({
        variant: "destructive",
        title: "Failed to load providers",
        description: error.message || "Please check your internet connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProviderToggle = (providerName: string) => {
    setFormData(prev => ({
      ...prev,
      allowedProviders: prev.allowedProviders.includes(providerName)
        ? prev.allowedProviders.filter(p => p !== providerName)
        : [...prev.allowedProviders, providerName]
    }));
  };

  const handleModelToggle = (model: string) => {
    setFormData(prev => ({
      ...prev,
      allowedModels: prev.allowedModels.includes(model)
        ? prev.allowedModels.filter(m => m !== model)
        : [...prev.allowedModels, model]
    }));
  };

  const getAvailableModels = () => {
    return formData.allowedProviders.flatMap(providerName => {
      const provider = providers.find(p => p.name === providerName);
      return provider?.models || [];
    });
  };


  const handleSave = () => {
    const keyData = {
      ...formData,
      // Generate a new API key if creating (in real app, this would be done on backend)
      key: apiKey?.key || `sk-proj-${Math.random().toString(36).substring(2, 15)}...${Math.random().toString(36).substring(2, 8)}`,
      created: apiKey?.created || new Date().toISOString().split('T')[0],
      status: "active"
    };
    onSave(keyData);
    onOpenChange(false);
    if (!apiKey) {
      // Reset form for new key creation
      setFormData({ name: "", allowedProviders: [], allowedModels: [], benchmarkModel: "" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{apiKey ? "Edit API Key" : "Generate New API Key"}</DialogTitle>
          <DialogDescription>
            {apiKey ? "Modify the settings for this API key" : "Create a new API key with optional provider and model restrictions"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          <div>
            <Label htmlFor="name">API Key Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Production API Key"
              className="border-emerald-200"
            />
          </div>
          
          <div>
            <Label>Allowed Providers (Optional)</Label>
            <p className="text-sm text-gray-600 mb-2">Select which LLM providers this API key can access</p>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {providers.map((provider) => (
                  <div key={provider.name} className="flex items-center space-x-2">
                    <Checkbox
                      id={provider.name}
                      checked={formData.allowedProviders.includes(provider.name)}
                      onCheckedChange={() => handleProviderToggle(provider.name)}
                    />
                    <Label htmlFor={provider.name} className="text-sm">{provider.name}</Label>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {formData.allowedProviders.length > 0 && (
            <div>
              <Label>Allowed Models (Optional)</Label>
              <p className="text-sm text-gray-600 mb-2">Select which models from the chosen providers this API key can use</p>
              <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto">
                {getAvailableModels().map((model) => (
                  <div key={model} className="flex items-center space-x-2">
                    <Checkbox
                      id={model}
                      checked={formData.allowedModels.includes(model)}
                      onCheckedChange={() => handleModelToggle(model)}
                    />
                    <Label htmlFor={model} className="text-sm">{model}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {formData.allowedModels.length > 0 && (
            <div>
              <Label htmlFor="benchmark">Benchmark Model (Optional)</Label>
              <Select 
                value={formData.benchmarkModel} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, benchmarkModel: value }))}
              >
                <SelectTrigger className="border-emerald-200">
                  <SelectValue placeholder="Select benchmark model" />
                </SelectTrigger>
                <SelectContent>
                  {formData.allowedModels.map((model) => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-600 mt-1">
                This model will be used for cost calculations and performance benchmarking
              </p>
            </div>
          )}
          
          {(formData.allowedProviders.length > 0 || formData.allowedModels.length > 0 || formData.benchmarkModel) && (
            <div>
              <Label>Configuration Summary</Label>
              <div className="mt-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="space-y-2">
                  {formData.allowedProviders.length > 0 && (
                    <div>
                      <span className="text-sm font-medium">Providers: </span>
                      {formData.allowedProviders.map(providerName => (
                        <Badge key={providerName} variant="outline" className="mr-1 border-emerald-200">
                          {providerName}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {formData.allowedModels.length > 0 && (
                    <div>
                      <span className="text-sm font-medium">Models: </span>
                      <span className="text-sm text-gray-600">{formData.allowedModels.length} selected</span>
                    </div>
                  )}
                  {formData.benchmarkModel && (
                    <div>
                      <span className="text-sm font-medium">Benchmark: </span>
                      <Badge className="bg-emerald-100 text-emerald-800">{formData.benchmarkModel}</Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
            {apiKey ? "Save Changes" : "Generate API Key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
