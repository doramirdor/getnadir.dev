import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, X, RotateCcw, Trash2, Edit, ChevronDown, ChevronUp, Info } from "lucide-react";
import { AddFallbackPolicyDialog } from "./AddFallbackPolicyDialog";
import { AddLoadBalancePolicyDialog } from "./AddLoadBalancePolicyDialog";
import { AddSmartRoutePolicyDialog } from "./AddSmartRoutePolicyDialog";
import { logger } from "@/utils/logger";

interface ProviderModel {
  id: string;
  provider: string;
  model_id: string;
  model_name: string;
  display_name: string;
  is_available: string;
}

interface GroupedProvider {
  name: string;
  models: string[];
}

interface Provider {
  id: string;
  name: string;
  provider_id: string;
  models: string[];
  enabled: boolean;
}

interface UserProvider {
  id: string;
  provider_id: string;
  allowed_models: string[];
  enabled: boolean;
  provider: Provider;
}

interface ModelPolicy {
  id: string;
  name: string;
  policy_type: 'fallback' | 'load_balance' | 'smart_route';
  template_name?: string;
  models: ModelPolicyItem[];
  policy_config?: PolicyConfig;
}

interface ModelPolicyItem {
  model_name: string;
  provider_name: string;
  owner: string;
  input_cost: number;
  output_cost: number;
  token_capacity: number;
  distribution_percentage?: number;
  sequence_order: number;
  enabled?: boolean;
}

interface PolicyConfig {
  // Fallback config
  mode?: 'custom' | 'performance';
  
  // Load balance config
  distribution_method?: 'random' | 'round_robin' | 'weighted';
  
  // Smart route config
  benchmark_model?: string;
  performance_threshold?: number;
  cost_threshold?: number;
}

interface AvailableModel {
  model_name: string;
  provider_name: string;
  owner: string;
  input_cost: number;
  output_cost: number;
  token_capacity: number;
}

interface PresetFormData {
  // Basic Info
  name: string;
  slug: string;
  description: string;
  systemPrompt: string;
  selectedModels: string[];
  
  // Routing Configuration
  sort: string;
  benchmarkModel: string; // For Smart Routing
  loadBalancingPolicy: string; // For Load Balancing
  
  // Nadir Configuration
  useFallback: boolean;
  enableCaching: boolean;
  enableLogging: boolean;
  logLevel: string;
  
  // Parameters
  temperature: { enabled: boolean; value: number };
  topP: { enabled: boolean; value: number };
  topK: { enabled: boolean; value: number };
  frequencyPenalty: { enabled: boolean; value: number };
  presencePenalty: { enabled: boolean; value: number };
  repetitionPenalty: { enabled: boolean; value: number };
  maxTokens: { enabled: boolean; value: number };
  seed: { enabled: boolean; value: string };
}

interface ComprehensiveApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (preset: any) => void;
  editingKey?: any;
  isPresetMode?: boolean;
}


const sortOptions = [
  { value: 'standard-requests', label: 'Standard Requests' },
  { value: 'smart-routing', label: 'Smart Routing' },
  { value: 'load-balancing', label: 'Load Balancing' }
];

export const ComprehensiveApiKeyDialog = ({ open, onOpenChange, onSave, editingKey, isPresetMode = false }: ComprehensiveApiKeyDialogProps) => {
  const { toast } = useToast();
  const [providers, setProviders] = useState<GroupedProvider[]>([]);
  const [allModels, setAllModels] = useState<string[]>([]);
  const [availableProviders, setAvailableProviders] = useState<Provider[]>([]);
  const [userProviders, setUserProviders] = useState<UserProvider[]>([]);
  const [modelPolicies, setModelPolicies] = useState<ModelPolicy[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [showFallbackDialog, setShowFallbackDialog] = useState(false);
  const [showLoadBalanceDialog, setShowLoadBalanceDialog] = useState(false);
  const [showSmartRouteDialog, setShowSmartRouteDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  
  const [formData, setFormData] = useState<PresetFormData>({
    // Basic Info
    name: editingKey?.name || "",
    slug: editingKey?.slug || "",
    description: editingKey?.description || "",
    systemPrompt: editingKey?.system_prompt || "",
    selectedModels: editingKey?.selected_models || [],
    
    // Routing Configuration
    sort: editingKey?.sort_strategy || "standard-requests",
    benchmarkModel: editingKey?.benchmark_model || "",
    loadBalancingPolicy: editingKey?.load_balancing_policy || "round-robin",
    
    // Nadir Configuration
    useFallback: editingKey?.use_fallback ?? true,
    enableCaching: editingKey?.enable_caching ?? true,
    enableLogging: editingKey?.enable_logging ?? true,
    logLevel: editingKey?.log_level || "info",
    
    // Parameters - Extract from model_parameters JSONB
    temperature: editingKey?.model_parameters?.temperature || { enabled: false, value: 1.0 },
    topP: editingKey?.model_parameters?.topP || { enabled: false, value: 1.0 },
    topK: editingKey?.model_parameters?.topK || { enabled: false, value: 40 },
    frequencyPenalty: editingKey?.model_parameters?.frequencyPenalty || { enabled: false, value: 0.0 },
    presencePenalty: editingKey?.model_parameters?.presencePenalty || { enabled: false, value: 0.0 },
    repetitionPenalty: editingKey?.model_parameters?.repetitionPenalty || { enabled: false, value: 1.0 },
    maxTokens: editingKey?.model_parameters?.maxTokens || { enabled: false, value: 1024 },
    seed: editingKey?.model_parameters?.seed || { enabled: false, value: "" }
  });

  useEffect(() => {
    if (open) {
      fetchProviders();
      fetchUserProviders();
      fetchModelPolicies();
      fetchAvailableModels();
    } else {
      // Reset form when dialog closes to prevent stale data
      if (!editingKey) {
        setFormData({
          name: "", slug: "", description: "", systemPrompt: "", selectedModels: [],
          sort: "standard-requests", benchmarkModel: "", loadBalancingPolicy: "round-robin",
          useFallback: true, enableCaching: true, enableLogging: true, logLevel: "info",
          temperature: { enabled: false, value: 1.0 }, topP: { enabled: false, value: 1.0 },
          topK: { enabled: false, value: 40 }, frequencyPenalty: { enabled: false, value: 0.0 },
          presencePenalty: { enabled: false, value: 0.0 }, repetitionPenalty: { enabled: false, value: 1.0 },
          maxTokens: { enabled: false, value: 1024 }, seed: { enabled: false, value: "" }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Update form data when editingKey prop changes (for editing)
  useEffect(() => {
    if (editingKey) {
      if (isPresetMode) {
        // Handle preset editing
        setFormData({
          // Basic Info
          name: editingKey.name || "",
          slug: editingKey.model_parameters?.slug || "",
          description: editingKey.description || "",
          systemPrompt: editingKey.system_prompt || "",
          selectedModels: editingKey.selected_models || [],
          
          // Routing Configuration - Extract from model_parameters
          sort: editingKey.model_parameters?.sort || "standard-requests",
          benchmarkModel: editingKey.model_parameters?.benchmarkModel || "",
          loadBalancingPolicy: editingKey.model_parameters?.loadBalancingPolicy || "round-robin",
          
          // Nadir Configuration - Extract from model_parameters
          useFallback: editingKey.model_parameters?.useFallback ?? true,
          enableCaching: editingKey.model_parameters?.enableCaching ?? true,
          enableLogging: editingKey.model_parameters?.enableLogging ?? true,
          logLevel: editingKey.model_parameters?.logLevel || "info",
          
          // Parameters - Extract from model_parameters JSONB
          temperature: editingKey.model_parameters?.temperature || { enabled: false, value: 1.0 },
          topP: editingKey.model_parameters?.topP || { enabled: false, value: 1.0 },
          topK: editingKey.model_parameters?.topK || { enabled: false, value: 40 },
          frequencyPenalty: editingKey.model_parameters?.frequencyPenalty || { enabled: false, value: 0.0 },
          presencePenalty: editingKey.model_parameters?.presencePenalty || { enabled: false, value: 0.0 },
          repetitionPenalty: editingKey.model_parameters?.repetitionPenalty || { enabled: false, value: 1.0 },
          maxTokens: editingKey.model_parameters?.maxTokens || { enabled: false, value: 1024 },
          seed: editingKey.model_parameters?.seed || { enabled: false, value: "" }
        });
      } else {
        // Handle API key editing (original logic)
        setFormData({
          // Basic Info
          name: editingKey.name || "",
          slug: editingKey.slug || "",
          description: editingKey.description || "",
          systemPrompt: editingKey.system_prompt || "",
          selectedModels: editingKey.selected_models || [],
          
          // Routing Configuration
          sort: editingKey.sort_strategy || "standard-requests",
          benchmarkModel: editingKey.benchmark_model || "",
          loadBalancingPolicy: editingKey.load_balancing_policy || "round-robin",
          
          // Nadir Configuration
          useFallback: editingKey.use_fallback ?? true,
          enableCaching: editingKey.enable_caching ?? true,
          enableLogging: editingKey.enable_logging ?? true,
          logLevel: editingKey.log_level || "info",
          
          // Parameters - Extract from model_parameters JSONB
          temperature: editingKey.model_parameters?.temperature || { enabled: false, value: 1.0 },
          topP: editingKey.model_parameters?.topP || { enabled: false, value: 1.0 },
          topK: editingKey.model_parameters?.topK || { enabled: false, value: 40 },
          frequencyPenalty: editingKey.model_parameters?.frequencyPenalty || { enabled: false, value: 0.0 },
          presencePenalty: editingKey.model_parameters?.presencePenalty || { enabled: false, value: 0.0 },
          repetitionPenalty: editingKey.model_parameters?.repetitionPenalty || { enabled: false, value: 1.0 },
          maxTokens: editingKey.model_parameters?.maxTokens || { enabled: false, value: 1024 },
          seed: editingKey.model_parameters?.seed || { enabled: false, value: "" }
        });
      }
    } else {
      // Reset form for new creation
      setFormData({
        name: "", slug: "", description: "", systemPrompt: "", selectedModels: [],
        sort: "standard-requests", benchmarkModel: "", loadBalancingPolicy: "round-robin",
        useFallback: true, enableCaching: true, enableLogging: true, logLevel: "info",
        temperature: { enabled: false, value: 1.0 }, topP: { enabled: false, value: 1.0 },
        topK: { enabled: false, value: 40 }, frequencyPenalty: { enabled: false, value: 0.0 },
        presencePenalty: { enabled: false, value: 0.0 }, repetitionPenalty: { enabled: false, value: 1.0 },
        maxTokens: { enabled: false, value: 1024 }, seed: { enabled: false, value: "" }
      });
    }
  }, [editingKey, isPresetMode]);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Fetch all available models from the providers table
      const { data, error } = await supabase
        .from('providers')
        .select('provider, model_id, model_name, display_name, is_available')
        .or('is_available.eq.true,is_available.eq.True')
        .order('provider, model_name');

      if (error) throw new Error(`Database error: ${error.message}`);

      // Group models by provider for provider-first selection
      const groupedProviders: { [key: string]: string[] } = {};
      const allModelsList: string[] = [];
      
      (data as ProviderModel[])?.forEach(model => {
        const providerName = model.provider;
        if (!groupedProviders[providerName]) {
          groupedProviders[providerName] = [];
        }
        groupedProviders[providerName].push(model.model_id);
        allModelsList.push(model.model_id);
      });

      // Convert to array format
      const providerArray = Object.entries(groupedProviders).map(([name, models]) => ({
        name,
        models
      }));

      setProviders(providerArray);
      setAllModels(allModelsList);
      
      // If this is a new API key (not editing), set all models as default
      if (!editingKey && formData.selectedModels.length === 0) {
        setFormData(prev => ({
          ...prev,
          selectedModels: allModelsList
        }));
      }
      
      logger.log('Loaded providers and models:', providerArray.length, 'providers with', allModelsList.length, 'total models');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load models';
      toast({
        variant: "destructive",
        title: "Failed to load models",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProviders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // provider_keys table stores BYOK keys, not provider configurations
      // Use an empty array as user providers are configured via provider_keys
      const { data, error } = await supabase
        .from('provider_keys')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        logger.warn('Could not fetch provider keys:', error.message);
        setUserProviders([]);
        return;
      }
      // Map provider_keys to the expected UserProvider format
      setUserProviders([]);
    } catch (error) {
      logger.error('Error fetching provider keys:', error);
      setUserProviders([]);
    }
  };

  const fetchModelPolicies = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch policies for this API key/preset if editing, otherwise fetch all
      const query = supabase
        .from('model_policies')
        .select('*')
        .eq('user_id', user.id);
      
      if (editingKey?.id) {
        if (isPresetMode) {
          query.eq('preset_id', editingKey.id);
        } else {
          query.eq('api_key_id', editingKey.id);
        }
      } else {
        // For new creation, get policies not associated with any key/preset
        query.is('api_key_id', null).is('preset_id', null);
      }

      const { data: policies, error: policiesError } = await query.order('created_at', { ascending: false });

      if (policiesError) {
        // If table doesn't exist (404), just set empty array
        if (policiesError.code === 'PGRST116' || (policiesError.message && policiesError.message.includes('does not exist'))) {
          logger.warn('Model policies table does not exist yet. Fallback functionality will be disabled.');
          setModelPolicies([]);
          return;
        }
        throw policiesError;
      }

      // Policies now include models as JSON, no need for separate table
      const policiesWithModels: ModelPolicy[] = (policies || []).map(policy => ({
        ...policy,
        models: policy.models || [],
        policy_config: policy.policy_config || {}
      }));

      setModelPolicies(policiesWithModels);
    } catch (error) {
      logger.error('Error fetching model policies:', error);
      // Set empty array on any error to prevent UI crashes
      setModelPolicies([]);
    }
  };

  const fetchAvailableModels = async () => {
    // Mock available models - in production, this would come from your provider APIs
    const models: AvailableModel[] = [
      {
        model_name: "gpt-4o",
        provider_name: "openai",
        owner: "OpenAI",
        input_cost: 0.000005,
        output_cost: 0.000015,
        token_capacity: 128000
      },
      {
        model_name: "gpt-4o-mini",
        provider_name: "openai",
        owner: "OpenAI",
        input_cost: 0.00000015,
        output_cost: 0.0000006,
        token_capacity: 128000
      },
      {
        model_name: "o1",
        provider_name: "openai",
        owner: "OpenAI",
        input_cost: 0.000015,
        output_cost: 0.00006,
        token_capacity: 200000
      },
      {
        model_name: "o3-mini",
        provider_name: "openai",
        owner: "OpenAI",
        input_cost: 0.00001,
        output_cost: 0.00004,
        token_capacity: 200000
      },
      {
        model_name: "deepseek-r1",
        provider_name: "deepseek",
        owner: "DeepSeek",
        input_cost: 0.0000014,
        output_cost: 0.0000028,
        token_capacity: 65536
      },
      {
        model_name: "claude-3-5-sonnet-20241022",
        provider_name: "anthropic",
        owner: "Anthropic",
        input_cost: 0.000003,
        output_cost: 0.000015,
        token_capacity: 200000
      }
    ];
    setAvailableModels(models);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: prev.slug || generateSlug(name)
    }));
  };


  const handleModelToggle = (modelId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedModels: prev.selectedModels.includes(modelId)
        ? prev.selectedModels.filter(m => m !== modelId)
        : [...prev.selectedModels, modelId]
    }));
  };

  const handleProviderToggle = (provider: GroupedProvider) => {
    const providerModels = provider.models;
    const allSelected = providerModels.every(modelId => formData.selectedModels.includes(modelId));
    
    setFormData(prev => ({
      ...prev,
      selectedModels: allSelected
        ? prev.selectedModels.filter(m => !providerModels.includes(m))
        : [...new Set([...prev.selectedModels, ...providerModels])]
    }));
  };

  const isProviderSelected = (provider: GroupedProvider) => {
    return provider.models.every(modelId => formData.selectedModels.includes(modelId));
  };

  const isProviderPartiallySelected = (provider: GroupedProvider) => {
    return provider.models.some(modelId => formData.selectedModels.includes(modelId)) && 
           !provider.models.every(modelId => formData.selectedModels.includes(modelId));
  };


  const handleParameterToggle = (param: keyof PresetFormData, enabled: boolean) => {
    setFormData(prev => ({
      ...prev,
      [param]: { ...prev[param] as any, enabled }
    }));
  };

  const handleParameterValueChange = (param: keyof PresetFormData, value: number | string) => {
    setFormData(prev => ({
      ...prev,
      [param]: { ...prev[param] as any, value }
    }));
  };


  const filteredModels = allModels.filter(model =>
    model.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const handleDeletePolicy = async (policyId: string) => {
    try {
      // Delete policy (no need to delete items separately since they're JSON now)
      const { error: policyError } = await supabase
        .from('model_policies')
        .delete()
        .eq('id', policyId);

      if (policyError) throw policyError;

      setModelPolicies(prev => prev.filter(p => p.id !== policyId));

      toast({
        title: "Success",
        description: "Policy deleted successfully"
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete policy"
      });
    }
  };

  const formatCost = (cost: number) => {
    return `$${(cost * 1000000).toFixed(2)}M`;
  };

  const getFilteredAvailableModels = () => {
    // Create available models based on the selected models in the form data
    const selectedModelIds = formData.selectedModels;
    if (selectedModelIds.length === 0) {
      return []; // No models selected
    }

    // Map selected model IDs to available model format
    // This matches the selected models from the providers data with the availableModels format
    const filteredModels: AvailableModel[] = [];
    
    selectedModelIds.forEach(modelId => {
      // Find the provider and model info from the providers data
      providers.forEach(provider => {
        if (provider.models.includes(modelId)) {
          // Find or create the corresponding available model
          let existingModel = availableModels.find(
            am => am.model_name === modelId && am.provider_name === provider.name.toLowerCase()
          );
          
          if (existingModel) {
            filteredModels.push(existingModel);
          } else {
            // Create a default available model if not found in mock data
            filteredModels.push({
              model_name: modelId,
              provider_name: provider.name.toLowerCase(),
              owner: provider.name,
              input_cost: 0.000001,
              output_cost: 0.000002,
              token_capacity: 4096
            });
          }
        }
      });
    });

    return filteredModels;
  };

  const handleSave = () => {
    const presetData = {
      ...formData,
      key: editingKey?.key || `sk-proj-${Math.random().toString(36).substring(2, 15)}...${Math.random().toString(36).substring(2, 8)}`,
      created: editingKey?.created || new Date().toISOString().split('T')[0],
      status: "active"
    };
    
    onSave(presetData);
    onOpenChange(false);
    
    if (!editingKey) {
      // Reset form for new preset creation
      setFormData({
        name: "", slug: "", description: "", systemPrompt: "", selectedModels: [],
        sort: "standard-requests", benchmarkModel: "", loadBalancingPolicy: "round-robin",
        useFallback: true, enableCaching: true, enableLogging: true, logLevel: "info",
        temperature: { enabled: false, value: 1.0 }, topP: { enabled: false, value: 1.0 },
        topK: { enabled: false, value: 40 }, frequencyPenalty: { enabled: false, value: 0.0 },
        presencePenalty: { enabled: false, value: 0.0 }, repetitionPenalty: { enabled: false, value: 1.0 },
        maxTokens: { enabled: false, value: 1024 }, seed: { enabled: false, value: "" }
      });
    }
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isPresetMode 
              ? (editingKey ? "Edit Preset" : "Create New Preset")
              : (editingKey ? "Edit API Key" : "Create New API Key")
            }
          </DialogTitle>
          <DialogDescription>
            {isPresetMode 
              ? "Configure a comprehensive preset for API routing, model selection, and parameters"
              : "Configure a comprehensive API key for routing, model selection, and parameters"
            }
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="routing">Routing</TabsTrigger>
            <TabsTrigger value="fallback">Fallback</TabsTrigger>
            <TabsTrigger value="nadir">Nadir Config</TabsTrigger>
            <TabsTrigger value="parameters">Parameters</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="My API Preset"
                    />
                  </div>
                  <div>
                    <Label htmlFor="slug">Slug</Label>
                    <Input
                      id="slug"
                      value={formData.slug}
                      onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                      placeholder="my-api-preset"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this preset is used for..."
                    rows={3}
                  />
                </div>
                
                <div>
                  <Label htmlFor="systemPrompt">System Prompt</Label>
                  <Textarea
                    id="systemPrompt"
                    value={formData.systemPrompt}
                    onChange={(e) => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                    placeholder="You are a helpful assistant..."
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
            
          </TabsContent>

          {/* Models Tab */}
          <TabsContent value="models" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Model Selection</CardTitle>
                <p className="text-sm text-gray-600">
                  Select which models this preset should use. All models are selected by default.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Search Bar for Models */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search models..."
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {/* Provider-First Model Selection */}
                  {providers.map((provider) => {
                    // Filter models based on search
                    const filteredModels = provider.models.filter(model =>
                      model.toLowerCase().includes(modelSearch.toLowerCase())
                    );
                    
                    // Skip provider if no models match search
                    if (filteredModels.length === 0 && modelSearch.trim()) {
                      return null;
                    }
                    
                    return (
                    <div key={provider.name} className="rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-gray-900">{provider.name}</h4>
                          <Badge variant="outline" className="text-xs">
                            {filteredModels.length} models
                            {modelSearch.trim() && filteredModels.length !== provider.models.length && (
                              <span className="ml-1 text-gray-500">/ {provider.models.length}</span>
                            )}
                          </Badge>
                          {isProviderPartiallySelected(provider) && (
                            <Badge variant="secondary" className="text-xs">
                              Partial
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleProviderToggle(provider)}
                          className={isProviderSelected(provider) ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}
                        >
                          {isProviderSelected(provider) ? 'Remove All' : 'Add All'}
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {filteredModels.map((modelId) => (
                          <div key={modelId} className="flex items-center space-x-2">
                            <Checkbox
                              id={`${provider.name}-${modelId}`}
                              checked={formData.selectedModels.includes(modelId)}
                              onCheckedChange={() => handleModelToggle(modelId)}
                            />
                            <Label htmlFor={`${provider.name}-${modelId}`} className="text-xs font-mono">
                              {modelId}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
                  
                  {formData.selectedModels.length > 0 && (
                    <div className="mt-4">
                      <Label className="text-sm font-medium">Selected Models:</Label>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {formData.selectedModels.map((modelId) => (
                          <Badge key={modelId} variant="secondary" className="text-xs">
                            {modelId}
                            <X 
                              className="w-3 h-3 ml-1 cursor-pointer" 
                              onClick={() => handleModelToggle(modelId)}
                            />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Routing Tab */}
          <TabsContent value="routing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Routing Configuration</CardTitle>
                <p className="text-sm text-gray-600">
                  Configure how requests should be routed and distributed across providers and models.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="sort">Sort Strategy</Label>
                  <Select value={formData.sort} onValueChange={(value) => setFormData(prev => ({ ...prev, sort: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select routing strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Smart Route Policies Management - Only show when smart-routing is selected */}
                {formData.sort === 'smart-routing' && (
                  <div className="mt-4">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>Smart Route Policies</CardTitle>
                            <p className="text-sm text-gray-600">
                              Create intelligent routing policies that automatically select optimal models based on request complexity and cost.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700"
                            onClick={() => setShowSmartRouteDialog(true)}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {modelPolicies.filter(p => p.policy_type === 'smart_route').length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                              <div className="mb-4">
                                <RotateCcw className="w-12 h-12 mx-auto text-gray-300" />
                              </div>
                              <h3 className="font-medium text-lg mb-2">No Smart Route Policies</h3>
                              <p className="mb-4">Create your first smart routing policy to enable intelligent model selection.</p>
                            </div>
                          ) : (
                            modelPolicies
                              .filter(p => p.policy_type === 'smart_route')
                              .map((policy) => (
                              <Card key={policy.id}>
                                <CardContent className="pt-6">
                                  <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                      <h3 className="font-medium text-gray-900">{policy.name}</h3>
                                      <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                                        Smart Route
                                      </Badge>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button variant="ghost" size="sm">
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="text-red-600 hover:text-red-700"
                                        onClick={() => handleDeletePolicy(policy.id)}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <Label className="text-sm font-medium">Benchmark Model</Label>
                                        <p className="text-sm text-gray-600">{policy.policy_config?.benchmark_model || 'Not set'}</p>
                                      </div>
                                      <div>
                                        <Label className="text-sm font-medium">Performance Threshold</Label>
                                        <p className="text-sm text-gray-600">{Math.round((policy.policy_config?.performance_threshold || 0) * 100)}%</p>
                                      </div>
                                    </div>
                                    <div>
                                      <Label className="text-sm font-medium">Available Models: {policy.models?.length || 0}</Label>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
                
                {/* Load Balancing Policy Selection */}
                {formData.sort === 'load-balancing' && (
                  <div>
                    <Label htmlFor="loadBalancingPolicy">Load Balancing Policy</Label>
                    <Select 
                      value={formData.loadBalancingPolicy} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, loadBalancingPolicy: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select load balancing policy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="round-robin">Round Robin</SelectItem>
                        <SelectItem value="weighted-round-robin">Weighted Round Robin</SelectItem>
                        <SelectItem value="least-connections">Least Connections</SelectItem>
                        <SelectItem value="least-response-time">Least Response Time</SelectItem>
                        <SelectItem value="random">Random</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-gray-600 mt-1">
                      Policy for distributing requests across multiple providers
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Load Balancing Policies Management - Only show when load-balancing is selected */}
            {formData.sort === 'load-balancing' && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle>Load Balancing Policies</CardTitle>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <div className="space-y-2 text-sm">
                              <h4 className="font-medium">How Load Balancing Works</h4>
                              <p><strong>1. Create a Policy:</strong> Define model distribution with assigned weights (e.g., 50% to Model A, 30% to Model B, 20% to Model C).</p>
                              <p><strong>2. Route Requests:</strong> Each request gets routed to one of the models based on the distribution you set.</p>
                              <p><strong>3. Benefits:</strong> A/B Testing, smarter resource usage, improved performance, and cost optimization.</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <p className="text-sm text-gray-600">
                        Create and manage custom load balancing policies with model distribution weights.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setShowLoadBalanceDialog(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {modelPolicies.filter(p => p.policy_type === 'load_balance').length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <div className="mb-4">
                          <RotateCcw className="w-12 h-12 mx-auto text-gray-300" />
                        </div>
                        <h3 className="font-medium text-lg mb-2">No Load Balancing Policies</h3>
                        <p className="mb-4">Create your first policy to start distributing requests across models.</p>
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Example Policy: Reasoning-experiment</p>
                          <div className="text-sm space-y-1">
                            <p>• openai/o1: 50%</p>
                            <p>• openai/o3-mini: 25%</p>
                            <p>• deepseek/reasoner: 25%</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      modelPolicies
                        .filter(p => p.policy_type === 'load_balance')
                        .map((policy) => (
                        <Card key={policy.id}>
                          <CardContent className="pt-6">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <h3 className="font-medium text-gray-900">{policy.name}</h3>
                                <Badge variant={policy.policy_type === 'load_balance' ? "default" : "secondary"}>
                                  {policy.policy_type === 'load_balance' ? 'Load Balance' : 'Fallback'}
                                </Badge>
                                {policy.template_name && (
                                  <Badge variant="outline">
                                    {policy.template_name}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="sm">
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => handleDeletePolicy(policy.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <Label className="text-sm font-medium">Model Distribution</Label>
                              <div className="space-y-2">
                                {policy.models.map((model, index) => (
                                  <div key={model.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                                    <div className="flex items-center gap-3">
                                      <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium">
                                        {index + 1}
                                      </div>
                                      <div>
                                        <div className="font-medium text-sm">{model.model_name}</div>
                                        <div className="text-xs text-gray-600">{model.owner}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-xs text-gray-600">
                                        {formatCost(model.input_cost)} / {formatCost(model.output_cost)}
                                      </div>
                                      {policy.policy_type === 'load_balance' && (
                                        <div className="font-medium text-sm">
                                          {model.distribution_percentage}%
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Fallback Tab */}
          <TabsContent value="fallback" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Fallback Configuration</CardTitle>
                <p className="text-sm text-gray-600">
                  Configure fallback behavior when primary models are unavailable or fail.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50">
                  <div>
                    <Label className="font-medium">Use Fallback</Label>
                    <p className="text-sm text-gray-600">Enable fallback to other providers when primary fails</p>
                  </div>
                  <Switch
                    checked={formData.useFallback}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, useFallback: checked }))}
                  />
                </div>

                {/* Fallback Policy Management - Only show when use fallback is enabled */}
                {formData.useFallback && (
                  <Card className="bg-blue-50">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Fallback Policies</CardTitle>
                          <p className="text-sm text-gray-600">
                            Create fallback sequences to try models in order until one succeeds.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={() => setShowFallbackDialog(true)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {modelPolicies.filter(p => p.policy_type === 'fallback').length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <div className="mb-4">
                              <RotateCcw className="w-12 h-12 mx-auto text-gray-300" />
                            </div>
                            <h3 className="font-medium text-lg mb-2">No Fallback Policies</h3>
                            <p className="mb-4">Create your first fallback policy to define model sequences.</p>
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Example Fallback Sequence:</p>
                              <div className="text-sm space-y-1">
                                <p>1. openai/gpt-4o (Primary)</p>
                                <p>2. anthropic/claude-3-5-sonnet (Fallback)</p>
                                <p>3. deepseek/deepseek-r1 (Final Fallback)</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          modelPolicies
                            .filter(p => p.policy_type === 'fallback')
                            .map((policy) => (
                              <Card key={policy.id}>
                                <CardContent className="pt-6">
                                  <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                      <h3 className="font-medium text-gray-900">{policy.name}</h3>
                                      <Badge variant="secondary">
                                        Fallback Sequence
                                      </Badge>
                                      {policy.template_name && (
                                        <Badge variant="outline">
                                          {policy.template_name}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex gap-2">
                                      <Button variant="ghost" size="sm">
                                        <Edit className="w-4 h-4" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="text-red-600 hover:text-red-700"
                                        onClick={() => handleDeletePolicy(policy.id)}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <Label className="text-sm font-medium">Fallback Sequence</Label>
                                    <div className="space-y-2">
                                      {policy.models.map((model, index) => (
                                        <div key={model.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                                          <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-medium">
                                              {index + 1}
                                            </div>
                                            <div>
                                              <div className="font-medium text-sm">{model.model_name}</div>
                                              <div className="text-xs text-gray-600">{model.owner}</div>
                                            </div>
                                            <div className="text-xs text-gray-500">
                                              {index === 0 ? 'Primary' : index === policy.models.length - 1 ? 'Final Fallback' : 'Fallback'}
                                            </div>
                                          </div>
                                          <div className="text-xs text-gray-600">
                                            {formatCost(model.input_cost)} / {formatCost(model.output_cost)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Nadir Configuration Tab */}
          <TabsContent value="nadir" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Nadir Configuration</CardTitle>
                <p className="text-sm text-gray-600">
                  Configure caching and logging behavior for this API key
                </p>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* Caching Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Label>Enable Caching</Label>
                      <p className="text-sm text-gray-600">Cache responses to improve performance and reduce costs</p>
                    </div>
                    <Switch
                      checked={formData.enableCaching}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enableCaching: checked }))}
                    />
                  </div>
                </div>

                <Separator />


                {/* Logging Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Label>Enable Logging</Label>
                      <p className="text-sm text-gray-600">Log requests and responses for debugging</p>
                    </div>
                    <Switch
                      checked={formData.enableLogging}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enableLogging: checked }))}
                    />
                  </div>

                  {formData.enableLogging && (
                    <div className="pl-4">
                      <Label htmlFor="logLevel">Log Level</Label>
                      <Select 
                        value={formData.logLevel} 
                        onValueChange={(value) => setFormData(prev => ({ ...prev, logLevel: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="error">Error Only</SelectItem>
                          <SelectItem value="warn">Warning</SelectItem>
                          <SelectItem value="info">Info (Recommended)</SelectItem>
                          <SelectItem value="debug">Debug (Verbose)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-gray-600 mt-1">
                        Higher levels include more detailed logging information
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Parameters Tab */}
          <TabsContent value="parameters" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Model Parameters</CardTitle>
                <p className="text-sm text-gray-600">
                  Configure model parameters that will override default values when this preset is used.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {[
                  { key: 'temperature', label: 'Temperature', description: 'Controls randomness in the output. Lower values are more deterministic.', min: 0, max: 2, step: 0.01 },
                  { key: 'topP', label: 'Top P', description: 'Nucleus sampling parameter. Controls diversity via cumulative probability.', min: 0, max: 1, step: 0.01 },
                  { key: 'topK', label: 'Top K', description: 'Limits the number of highest probability tokens to consider.', min: 1, max: 100, step: 1 },
                  { key: 'frequencyPenalty', label: 'Frequency Penalty', description: 'Reduces repetition based on token frequency in the text so far.', min: -2, max: 2, step: 0.01 },
                  { key: 'presencePenalty', label: 'Presence Penalty', description: 'Reduces repetition based on whether tokens appear in the text so far.', min: -2, max: 2, step: 0.01 },
                  { key: 'repetitionPenalty', label: 'Repetition Penalty', description: 'Penalizes repetition. Values > 1 discourage repetition, < 1 encourage it.', min: 0.1, max: 2, step: 0.01 },
                  { key: 'maxTokens', label: 'Max Tokens', description: 'Maximum number of tokens to generate.', min: 1, max: 8192, step: 1 }
                ].map((param) => (
                  <div key={param.key} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <Checkbox
                          id={`${param.key}-enabled`}
                          checked={(formData[param.key as keyof PresetFormData] as any).enabled}
                          onCheckedChange={(checked) => handleParameterToggle(param.key as keyof PresetFormData, checked as boolean)}
                        />
                        <Label htmlFor={`${param.key}-enabled`} className="font-medium">
                          {param.label}
                        </Label>
                      </div>
                      <p className="text-sm text-gray-600">{param.description}</p>
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={(formData[param.key as keyof PresetFormData] as any).value}
                        onChange={(e) => handleParameterValueChange(param.key as keyof PresetFormData, parseFloat(e.target.value))}
                        disabled={!(formData[param.key as keyof PresetFormData] as any).enabled}
                      />
                    </div>
                  </div>
                ))}
                
                {/* Seed Parameter - Special case */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <Checkbox
                        id="seed-enabled"
                        checked={formData.seed.enabled}
                        onCheckedChange={(checked) => handleParameterToggle('seed', checked as boolean)}
                      />
                      <Label htmlFor="seed-enabled" className="font-medium">
                        Seed
                      </Label>
                    </div>
                    <p className="text-sm text-gray-600">Random seed for deterministic outputs (when supported).</p>
                  </div>
                  <div className="w-32">
                    <Input
                      type="text"
                      value={formData.seed.value}
                      onChange={(e) => handleParameterValueChange('seed', e.target.value)}
                      disabled={!formData.seed.enabled}
                      placeholder="12345"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!formData.name}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {editingKey ? "Update Preset" : "Create Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AddFallbackPolicyDialog
        open={showFallbackDialog}
        onOpenChange={setShowFallbackDialog}
        onSave={(policy) => {
          fetchModelPolicies();
          setShowFallbackDialog(false);
        }}
        apiKeyId={isPresetMode ? undefined : editingKey?.id}
        presetId={isPresetMode ? editingKey?.id : undefined}
        availableModels={getFilteredAvailableModels()}
      />
      
      <AddLoadBalancePolicyDialog
        open={showLoadBalanceDialog}
        onOpenChange={setShowLoadBalanceDialog}
        onSave={(policy) => {
          fetchModelPolicies();
          setShowLoadBalanceDialog(false);
        }}
        apiKeyId={isPresetMode ? undefined : editingKey?.id}
        presetId={isPresetMode ? editingKey?.id : undefined}
        availableModels={getFilteredAvailableModels()}
      />
      
      <AddSmartRoutePolicyDialog
        open={showSmartRouteDialog}
        onOpenChange={setShowSmartRouteDialog}
        onSave={(policy) => {
          fetchModelPolicies();
          setShowSmartRouteDialog(false);
        }}
        apiKeyId={isPresetMode ? undefined : editingKey?.id}
        presetId={isPresetMode ? editingKey?.id : undefined}
        availableModels={getFilteredAvailableModels()}
      />
      </Dialog>
    </TooltipProvider>
  );
};