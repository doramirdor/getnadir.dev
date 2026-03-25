import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Brain, Zap, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

interface SmartRoutePolicy {
  id?: string;
  name: string;
  policy_type: 'smart_route';
  template_name?: string;
  models: SmartRoutePolicyItem[];
  policy_config?: {
    benchmark_model: string;
    performance_threshold: number;
    cost_threshold: number;
  };
}

interface SmartRoutePolicyItem {
  model_name: string;
  provider_name: string;
  owner: string;
  input_cost: number;
  output_cost: number;
  token_capacity: number;
  sequence_order: number;
  enabled?: boolean;
}

interface AvailableModel {
  model_name: string;
  provider_name: string;
  owner: string;
  input_cost: number;
  output_cost: number;
  token_capacity: number;
}

interface AddSmartRoutePolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (policy: SmartRoutePolicy) => void;
  apiKeyId?: string;
  presetId?: string;
  availableModels: AvailableModel[];
}

export const AddSmartRoutePolicyDialog = ({ open, onOpenChange, onSave, apiKeyId, presetId, availableModels }: AddSmartRoutePolicyDialogProps) => {
  const [formData, setFormData] = useState<SmartRoutePolicy>({
    name: "",
    policy_type: 'smart_route',
    template_name: undefined,
    models: [],
    policy_config: {
      benchmark_model: "",
      performance_threshold: 0.8,
      cost_threshold: 0.5
    }
  });
  const { toast } = useToast();

  useEffect(() => {
    if (open && availableModels.length > 0) {
      // Auto-select all available models for smart routing
      const smartRouteModels: SmartRoutePolicyItem[] = availableModels.map((model, index) => ({
        model_name: model.model_name,
        provider_name: model.provider_name,
        owner: model.owner,
        input_cost: model.input_cost,
        output_cost: model.output_cost,
        token_capacity: model.token_capacity,
        sequence_order: index + 1,
        enabled: true
      }));

      setFormData(prev => ({
        ...prev,
        models: smartRouteModels,
        policy_config: {
          ...prev.policy_config!,
          benchmark_model: availableModels[0]?.model_name || ""
        }
      }));
    }
  }, [open, availableModels]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Policy name is required"
      });
      return;
    }

    if (!formData.policy_config?.benchmark_model) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Benchmark model is required"
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create the policy with models as JSON
      const policyData = {
        user_id: user.id,
        name: formData.name,
        policy_type: 'smart_route' as const,
        template_name: null,
        models: formData.models,
        policy_config: formData.policy_config
      };

      // Add either api_key_id or preset_id
      if (apiKeyId) {
        (policyData as any).api_key_id = apiKeyId;
      } else if (presetId) {
        (policyData as any).preset_id = presetId;
      }

      const { error: policyError } = await supabase
        .from('model_policies')
        .insert(policyData)
        .select()
        .single();

      if (policyError) throw policyError;

      toast({
        title: "Success",
        description: "Smart route policy created successfully"
      });

      onSave(formData);
      onOpenChange(false);
      
      // Reset form
      setFormData({
        name: "",
        policy_type: 'smart_route',
        template_name: undefined,
        models: [],
        policy_config: {
          benchmark_model: "",
          performance_threshold: 0.8,
          cost_threshold: 0.5
        }
      });
    } catch (error: unknown) {
      logger.error('Error creating policy:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create smart route policy";
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage
      });
    }
  };

  const formatCost = (cost: number) => {
    return `$${(cost * 1000000).toFixed(2)}M`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Smart Route Policy</DialogTitle>
          <DialogDescription>
            Automatically route requests to the optimal model based on performance metrics and cost efficiency.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Smart Route Info */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-900 mb-2">
              <Brain className="w-5 h-5" />
              <h4 className="font-medium">Smart Route Policy</h4>
            </div>
            <p className="text-sm text-purple-800 mb-3">
              Smart routing analyzes each request and automatically selects the best model based on complexity, performance requirements, and cost optimization.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-purple-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-purple-900 mb-1">
                  <Zap className="w-4 h-4" />
                  <span className="text-sm font-medium">Performance</span>
                </div>
                <p className="text-xs text-purple-700">Routes complex queries to high-capability models</p>
              </div>
              <div className="bg-white border border-purple-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-purple-900 mb-1">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-sm font-medium">Cost Efficiency</span>
                </div>
                <p className="text-xs text-purple-700">Uses cost-effective models for simple queries</p>
              </div>
            </div>
          </div>

          {/* Policy Name */}
          <div>
            <Label htmlFor="policy-name" className="text-red-500">* Policy Name</Label>
            <Input
              id="policy-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="smart-routing-policy"
              className="border-purple-200"
            />
          </div>

          {/* Benchmark Model */}
          <div>
            <Label htmlFor="benchmark-model" className="text-red-500">* Benchmark Model</Label>
            <Select 
              value={formData.policy_config?.benchmark_model || ""} 
              onValueChange={(value) => setFormData(prev => ({
                ...prev,
                policy_config: { ...prev.policy_config!, benchmark_model: value }
              }))}
            >
              <SelectTrigger className="border-purple-200">
                <SelectValue placeholder="Select benchmark model for performance comparison" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={`${model.model_name}-${model.provider_name}`} value={model.model_name}>
                    <div className="flex items-center justify-between w-full">
                      <span>{model.model_name}</span>
                      <Badge variant="outline" className="ml-2">
                        {model.owner}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-600 mt-1">
              This model will be used as the performance baseline for routing decisions
            </p>
          </div>

          {/* Threshold Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Routing Thresholds</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Performance Threshold */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Performance Threshold</Label>
                  <span className="text-sm font-medium bg-purple-100 text-purple-800 px-2 py-1 rounded">
                    {Math.round((formData.policy_config?.performance_threshold || 0.8) * 100)}%
                  </span>
                </div>
                <Slider
                  value={[(formData.policy_config?.performance_threshold || 0.8) * 100]}
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    policy_config: { ...prev.policy_config!, performance_threshold: value[0] / 100 }
                  }))}
                  max={100}
                  min={0}
                  step={5}
                  className="mb-2"
                />
                <p className="text-sm text-gray-600">
                  Minimum performance score required before considering cost optimization
                </p>
              </div>

              {/* Cost Threshold */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Cost Optimization Weight</Label>
                  <span className="text-sm font-medium bg-emerald-100 text-emerald-800 px-2 py-1 rounded">
                    {Math.round((formData.policy_config?.cost_threshold || 0.5) * 100)}%
                  </span>
                </div>
                <Slider
                  value={[(formData.policy_config?.cost_threshold || 0.5) * 100]}
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    policy_config: { ...prev.policy_config!, cost_threshold: value[0] / 100 }
                  }))}
                  max={100}
                  min={0}
                  step={5}
                  className="mb-2"
                />
                <p className="text-sm text-gray-600">
                  How much to prioritize cost savings vs. performance (higher = more cost-focused)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Available Models Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Available Models for Smart Routing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {formData.models.map((model, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium">{model.model_name}</div>
                        <div className="text-sm text-gray-600">{model.owner}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-600">
                        {formatCost(model.input_cost)} / {formatCost(model.output_cost)}
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {model.token_capacity.toLocaleString()} tokens
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-600 mt-3">
                All available models will be considered for smart routing based on the configured thresholds.
              </p>
            </CardContent>
          </Card>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
            Create Smart Route Policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};