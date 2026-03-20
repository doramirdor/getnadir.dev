import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, ChevronDown, ChevronUp, Sparkles, Cpu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

interface FallbackPolicy {
  id?: string;
  name: string;
  policy_type: 'fallback';
  template_name?: string;
  policy_mode: 'performance' | 'custom';
  models: FallbackPolicyItem[];
  policy_config?: {
    mode: 'performance' | 'custom';
  };
}

interface FallbackPolicyItem {
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

interface AddFallbackPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (policy: FallbackPolicy) => void;
  apiKeyId?: string;
  presetId?: string;
  availableModels: AvailableModel[];
}

const FALLBACK_TEMPLATES = [
  { name: "Custom Sequence", slug: "custom-sequence", mode: "custom" as const },
  { name: "Performance Based", slug: "performance-based", mode: "performance" as const }
];

export const AddFallbackPolicyDialog = ({ open, onOpenChange, onSave, apiKeyId, presetId, availableModels }: AddFallbackPolicyDialogProps) => {
  const [formData, setFormData] = useState<FallbackPolicy>({
    name: "",
    policy_type: 'fallback',
    template_name: "Custom Sequence",
    policy_mode: 'custom',
    models: []
  });
  const [selectedModelToAdd, setSelectedModelToAdd] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      // Auto-generate policy name from template
      const template = FALLBACK_TEMPLATES.find(t => t.name === formData.template_name);
      if (template) {
        setFormData(prev => ({
          ...prev,
          name: template.slug,
          policy_mode: template.mode
        }));
      }
    }
  }, [open, formData.template_name]);

  const handleTemplateChange = (templateName: string) => {
    const template = FALLBACK_TEMPLATES.find(t => t.name === templateName);
    setFormData(prev => ({
      ...prev,
      template_name: templateName,
      name: template?.slug || "",
      policy_mode: template?.mode || 'performance',
      // Clear models when switching templates
      models: template?.mode === 'performance' ? [] : prev.models
    }));
  };

  const handleAddModel = () => {
    if (!selectedModelToAdd) return;

    const modelData = availableModels.find(m => 
      `${m.model_name} (${m.provider_name})` === selectedModelToAdd
    );

    if (!modelData) return;

    const newModel: FallbackPolicyItem = {
      model_name: modelData.model_name,
      provider_name: modelData.provider_name,
      owner: modelData.owner,
      input_cost: modelData.input_cost,
      output_cost: modelData.output_cost,
      token_capacity: modelData.token_capacity,
      sequence_order: formData.models.length + 1
    };

    setFormData(prev => ({
      ...prev,
      models: [...prev.models, newModel]
    }));

    setSelectedModelToAdd("");
  };

  const handleRemoveModel = (index: number) => {
    setFormData(prev => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index).map((model, i) => ({
        ...model,
        sequence_order: i + 1
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

  const getPerformanceBasedSequence = (): FallbackPolicyItem[] => {
    // Sort models by performance (token capacity desc, then by cost efficiency)
    const sortedModels = [...availableModels].sort((a, b) => {
      // Primary: Higher token capacity (more capable models first)
      if (b.token_capacity !== a.token_capacity) {
        return b.token_capacity - a.token_capacity;
      }
      // Secondary: Lower cost per token (more cost-efficient)
      const aCostPerToken = (a.input_cost + a.output_cost) / 2;
      const bCostPerToken = (b.input_cost + b.output_cost) / 2;
      return aCostPerToken - bCostPerToken;
    });

    // Take top 3 models for fallback sequence
    return sortedModels.slice(0, 3).map((model, index) => ({
      model_name: model.model_name,
      provider_name: model.provider_name,
      owner: model.owner,
      input_cost: model.input_cost,
      output_cost: model.output_cost,
      token_capacity: model.token_capacity,
      sequence_order: index + 1
    }));
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

    let finalModels = formData.models;

    // For performance mode, generate the sequence automatically
    if (formData.policy_mode === 'performance') {
      finalModels = getPerformanceBasedSequence();
    } else if (formData.models.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "At least one model is required for custom sequence"
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
        policy_type: 'fallback' as const,
        template_name: formData.template_name,
        models: finalModels.map(model => ({
          model_name: model.model_name,
          provider_name: model.provider_name,
          owner: model.owner,
          input_cost: model.input_cost,
          output_cost: model.output_cost,
          token_capacity: model.token_capacity,
          sequence_order: model.sequence_order,
          enabled: true
        })),
        policy_config: {
          mode: formData.policy_mode
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

      if (policyError) {
        // If table doesn't exist (404), show helpful message
        if (policyError.code === 'PGRST116' || (policyError.message && policyError.message.includes('does not exist'))) {
          toast({
            variant: "destructive",
            title: "Feature Not Available",
            description: "Fallback policies are not available yet. The required database tables are not set up.",
          });
          onOpenChange(false);
          return;
        }
        throw policyError;
      }

      toast({
        title: "Success",
        description: "Fallback policy created successfully"
      });

      onSave({ ...formData, models: finalModels });
      onOpenChange(false);
      
      // Reset form
      setFormData({
        name: "",
        policy_type: 'fallback',
        template_name: "Custom Sequence",
        policy_mode: 'custom',
        models: []
      });
    } catch (error: unknown) {
      logger.error('Error creating policy:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to create fallback policy";
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
          <DialogTitle>Create Fallback Policy</DialogTitle>
          <DialogDescription>
            Configure how your API key handles model fallbacks when the primary model fails.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Policy Template */}
          <div>
            <Label>Fallback Template</Label>
            <div className="flex items-center gap-2 mt-2">
              <Sparkles className="w-4 h-4 text-gray-400" />
              <Select 
                value={formData.template_name} 
                onValueChange={handleTemplateChange}
              >
                <SelectTrigger className="border-emerald-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FALLBACK_TEMPLATES.map((template) => (
                    <SelectItem key={template.name} value={template.name}>
                      <div className="flex items-center gap-2">
                        {template.mode === 'performance' ? (
                          <Cpu className="w-4 h-4" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        {template.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Sparkles className="w-4 h-4 text-gray-400" />
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

          {/* Policy Mode Explanation */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="pt-6">
              {formData.policy_mode === 'performance' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-blue-900">
                    <Cpu className="w-5 h-5" />
                    <h4 className="font-medium">Performance-Based Fallback</h4>
                  </div>
                  <p className="text-sm text-blue-800">
                    The system automatically selects the best fallback sequence at runtime based on your allowed models and prompt complexity. 
                    The fallback sequence is determined dynamically and cannot be previewed.
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    <p className="text-xs text-amber-800">
                      <strong>Note:</strong> The actual fallback sequence will be determined at runtime based on the specific prompt and available models. 
                      This provides optimal performance but sequences cannot be predetermined.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <h4 className="font-medium text-blue-900">Custom Fallback Sequence</h4>
                  <p className="text-sm text-blue-800">
                    Define your own fallback sequence by manually adding models in the order you want them to be tried.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom Models - Only show for custom mode */}
          {formData.policy_mode === 'custom' && (
            <div>
              <Label className="text-red-500">* Fallback Sequence</Label>
              <div className="space-y-3 mt-2">
                {formData.models.map((model, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{model.model_name}</div>
                          <div className="text-sm text-gray-600">{model.owner}</div>
                          <div className="text-sm text-gray-600">
                            Input: {formatCost(model.input_cost)} Output: {formatCost(model.output_cost)}
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {model.token_capacity.toLocaleString()} tokens
                        </Badge>
                        <div className="text-xs text-gray-500">
                          {index === 0 ? 'Primary' : index === formData.models.length - 1 ? 'Final Fallback' : 'Fallback'}
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

              {/* Add Model - Only for custom mode */}
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
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
            Create Fallback Policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};