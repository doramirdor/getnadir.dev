import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, ChevronDown, ChevronUp, Sparkles, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

interface LoadBalancePolicy {
  id?: string;
  name: string;
  policy_type: 'load_balance';
  template_name?: string;
  models: LoadBalancePolicyItem[];
  policy_config?: {
    distribution_method: 'random' | 'round_robin' | 'weighted';
  };
}

interface LoadBalancePolicyItem {
  model_name: string;
  provider_name: string;
  owner: string;
  input_cost: number;
  output_cost: number;
  token_capacity: number;
  distribution_percentage: number;
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

interface AddLoadBalancePolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (policy: LoadBalancePolicy) => void;
  apiKeyId?: string;
  presetId?: string;
  availableModels: AvailableModel[];
}

// Load balancing is currently random distribution
// A/B testing and session-based distribution will be added in future updates

export const AddLoadBalancePolicyDialog = ({ open, onOpenChange, onSave, apiKeyId, presetId, availableModels }: AddLoadBalancePolicyDialogProps) => {
  const [formData, setFormData] = useState<LoadBalancePolicy>({
    name: "",
    policy_type: 'load_balance',
    template_name: undefined,
    models: []
  });
  const [selectedModelToAdd, setSelectedModelToAdd] = useState("");
  const { toast } = useToast();

  // No templates needed - user defines their own distribution

  const handleAddModel = () => {
    if (!selectedModelToAdd) return;

    const modelData = availableModels.find(m => 
      `${m.model_name} (${m.provider_name})` === selectedModelToAdd
    );

    if (!modelData) return;

    const newModel: LoadBalancePolicyItem = {
      model_name: modelData.model_name,
      provider_name: modelData.provider_name,
      owner: modelData.owner,
      input_cost: modelData.input_cost,
      output_cost: modelData.output_cost,
      token_capacity: modelData.token_capacity,
      sequence_order: formData.models.length + 1,
      distribution_percentage: Math.floor(100 / (formData.models.length + 1))
    };

    // Recalculate distribution for existing models
    const updatedModels = formData.models.map(model => ({
      ...model,
      distribution_percentage: Math.floor(100 / (formData.models.length + 1))
    }));

    setFormData(prev => ({
      ...prev,
      models: [...updatedModels, newModel]
    }));

    setSelectedModelToAdd("");
  };

  const handleRemoveModel = (index: number) => {
    setFormData(prev => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index).map((model, i) => ({
        ...model,
        sequence_order: i + 1,
        distribution_percentage: prev.models.length > 1 ? Math.floor(100 / (prev.models.length - 1)) : 100
      }))
    }));
  };

  const handleMoveModel = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === formData.models.length - 1)
    ) return;

    const newModels = [...formData.models];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    [newModels[index], newModels[targetIndex]] = [newModels[targetIndex], newModels[index]];
    
    // Update sequence orders
    newModels.forEach((model, i) => {
      model.sequence_order = i + 1;
    });

    setFormData(prev => ({
      ...prev,
      models: newModels
    }));
  };

  const handleDistributionChange = (index: number, value: string) => {
    const percentage = parseInt(value) || 0;
    setFormData(prev => ({
      ...prev,
      models: prev.models.map((model, i) => 
        i === index ? { ...model, distribution_percentage: percentage } : model
      )
    }));
  };

  const getTotalDistribution = () => {
    return formData.models.reduce((sum, model) => sum + (model.distribution_percentage || 0), 0);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Policy name is required"
      });
      return;
    }

    if (formData.models.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "At least one model is required"
      });
      return;
    }

    if (getTotalDistribution() !== 100) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Total distribution must equal 100%"
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
        policy_type: 'load_balance' as const,
        template_name: null,
        models: formData.models.map(model => ({
          model_name: model.model_name,
          provider_name: model.provider_name,
          owner: model.owner,
          input_cost: model.input_cost,
          output_cost: model.output_cost,
          token_capacity: model.token_capacity,
          distribution_percentage: model.distribution_percentage,
          sequence_order: model.sequence_order,
          enabled: true
        })),
        policy_config: {
          distribution_method: 'random' as const
        }
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
        description: "Load balancing policy created successfully"
      });

      onSave(formData);
      onOpenChange(false);
      
      // Reset form
      setFormData({
        name: "",
        policy_type: 'load_balance',
        template_name: undefined,
        models: []
      });
    } catch (error: unknown) {
      logger.error('Error creating policy:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create load balancing policy";
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
          <DialogTitle>Create Load Balancing Policy</DialogTitle>
          <DialogDescription>
            Distribute your requests across multiple models with custom weights and percentages.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Load Balancing Info */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-emerald-900 mb-2">
              <RotateCcw className="w-5 h-5" />
              <h4 className="font-medium">Load Balancing Policy</h4>
            </div>
            <p className="text-sm text-emerald-800 mb-3">
              Distribute your requests across multiple models with custom weights. Currently uses random distribution based on your percentages.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                <strong>Coming Soon:</strong> A/B testing and session-based distribution policies will be available in future updates for more advanced load balancing strategies.
              </p>
            </div>
          </div>

          {/* Policy Name */}
          <div>
            <Label htmlFor="policy-name" className="text-red-500">* Policy Name</Label>
            <Input
              id="policy-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter policy name"
              className="border-emerald-200"
            />
          </div>

          {/* Models */}
          <div>
            <Label className="text-red-500">* Model Distribution</Label>
            <div className="space-y-3 mt-2">
              {formData.models.map((model, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{model.model_name}</div>
                        <div className="text-sm text-gray-600">{model.owner}</div>
                        <div className="text-sm text-gray-600">
                          Input: {formatCost(model.input_cost)} Output: {formatCost(model.output_cost)}
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        {model.token_capacity.toLocaleString()} tokens
                      </Badge>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={model.distribution_percentage || 0}
                          onChange={(e) => handleDistributionChange(index, e.target.value)}
                          className="w-16 text-center"
                          min="0"
                          max="100"
                        />
                        <span className="text-sm">%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMoveModel(index, 'up')}
                        disabled={index === 0}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMoveModel(index, 'down')}
                        disabled={index === formData.models.length - 1}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveModel(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Model */}
            <div className="flex gap-2 mt-3">
              <Select value={selectedModelToAdd} onValueChange={setSelectedModelToAdd}>
                <SelectTrigger className="border-emerald-200">
                  <SelectValue placeholder="Select a model to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.length === 0 ? (
                    <SelectItem value="no-models" disabled>
                      No models available - configure models first
                    </SelectItem>
                  ) : (
                    availableModels
                      .filter(model => !formData.models.some(m => 
                        m.model_name === model.model_name && m.provider_name === model.provider_name
                      ))
                      .map((model) => (
                        <SelectItem 
                          key={`${model.model_name}-${model.provider_name}`} 
                          value={`${model.model_name} (${model.provider_name})`}
                        >
                          {model.model_name} ({model.provider_name})
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleAddModel}
                disabled={!selectedModelToAdd}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Add Model
              </Button>
            </div>

            {/* Distribution Total */}
            {formData.models.length > 0 && (
              <div className="mt-2 text-sm">
                Total: <span className={getTotalDistribution() === 100 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                  {getTotalDistribution()}%
                </span> (must equal 100%)
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
            Create Load Balance Policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};