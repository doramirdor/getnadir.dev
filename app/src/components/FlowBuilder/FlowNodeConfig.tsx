import { useState, useEffect } from "react";
import { FlowNodeData, FlowNodeType } from "./FlowNode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  X, 
  ChevronUp, 
  ChevronDown, 
  Plus,
  GitBranch,
  Scale,
  Brain,
  Timer,
  Filter,
  KeyRound,
  Fingerprint,
  Eye,
  Sparkles
} from "lucide-react";

interface AvailableModel {
  model_name: string;
  provider_name: string;
  owner: string;
  input_cost: number;
  output_cost: number;
  token_capacity: number;
}

interface FlowNodeConfigProps {
  node: FlowNodeData;
  availableModels: AvailableModel[];
  onUpdate: (updates: Partial<FlowNodeData>) => void;
  onClose: () => void;
}

export const FlowNodeConfig = ({ node, availableModels, onUpdate, onClose }: FlowNodeConfigProps) => {
  const [localConfig, setLocalConfig] = useState(node.config);
  const [localTitle, setLocalTitle] = useState(node.title);
  const [localDescription, setLocalDescription] = useState(node.description || "");
  const [selectedModelToAdd, setSelectedModelToAdd] = useState("");

  useEffect(() => {
    setLocalConfig(node.config);
    setLocalTitle(node.title);
    setLocalDescription(node.description || "");
  }, [node]);

  const handleSave = () => {
    onUpdate({
      title: localTitle,
      description: localDescription || undefined,
      config: localConfig,
    });
    onClose();
  };

  const updateConfig = (key: string, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const addModelToList = () => {
    if (!selectedModelToAdd) return;
    
    const modelData = availableModels.find(m => 
      `${m.model_name} (${m.provider_name})` === selectedModelToAdd
    );
    if (!modelData) return;

    const currentModels = localConfig.models || [];
    const newModel = {
      model_name: modelData.model_name,
      provider_name: modelData.provider_name,
      owner: modelData.owner,
      input_cost: modelData.input_cost,
      output_cost: modelData.output_cost,
      token_capacity: modelData.token_capacity,
      sequence_order: currentModels.length + 1,
      distribution_percentage: node.type === 'load_balance' ? Math.floor(100 / (currentModels.length + 1)) : undefined,
    };

    // Rebalance percentages for load balance
    if (node.type === 'load_balance') {
      const newPercentage = Math.floor(100 / (currentModels.length + 1));
      const updatedModels = currentModels.map((m: any) => ({
        ...m,
        distribution_percentage: newPercentage,
      }));
      updateConfig('models', [...updatedModels, { ...newModel, distribution_percentage: newPercentage }]);
    } else {
      updateConfig('models', [...currentModels, newModel]);
    }
    setSelectedModelToAdd("");
  };

  const removeModel = (index: number) => {
    const currentModels = localConfig.models || [];
    const updatedModels = currentModels
      .filter((_: any, i: number) => i !== index)
      .map((m: any, i: number) => ({ ...m, sequence_order: i + 1 }));
    
    // Rebalance percentages for load balance
    if (node.type === 'load_balance' && updatedModels.length > 0) {
      const newPercentage = Math.floor(100 / updatedModels.length);
      updatedModels.forEach((m: any) => {
        m.distribution_percentage = newPercentage;
      });
    }
    
    updateConfig('models', updatedModels);
  };

  const moveModel = (index: number, direction: 'up' | 'down') => {
    const currentModels = [...(localConfig.models || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentModels.length) return;
    
    [currentModels[index], currentModels[targetIndex]] = [currentModels[targetIndex], currentModels[index]];
    currentModels.forEach((m: any, i: number) => {
      m.sequence_order = i + 1;
    });
    
    updateConfig('models', currentModels);
  };

  const updateModelPercentage = (index: number, percentage: number) => {
    const currentModels = [...(localConfig.models || [])];
    currentModels[index].distribution_percentage = percentage;
    updateConfig('models', currentModels);
  };

  const renderNodeSpecificConfig = () => {
    switch (node.type) {
      case 'fallback':
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-900 mb-2">
                <GitBranch className="w-4 h-4" />
                <span className="font-medium text-sm">Fallback Routing</span>
              </div>
              <p className="text-xs text-blue-700">
                If the primary model fails, requests automatically route to the next model in sequence.
              </p>
            </div>
            
            {/* Model sequence */}
            <div>
              <Label className="text-sm font-medium">Model Sequence</Label>
              <div className="space-y-2 mt-2">
                {(localConfig.models || []).map((model: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                    <div className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{model.model_name}</div>
                      <div className="text-xs text-muted-foreground">{model.provider_name}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {index === 0 ? 'Primary' : 'Fallback'}
                    </Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveModel(index, 'up')} disabled={index === 0}>
                        <ChevronUp className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveModel(index, 'down')} disabled={index === (localConfig.models?.length || 0) - 1}>
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeModel(index)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Add model */}
              <div className="flex gap-2 mt-3">
                <Select value={selectedModelToAdd} onValueChange={setSelectedModelToAdd}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add model to sequence" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels
                      .filter(m => !(localConfig.models || []).some((existing: any) => 
                        existing.model_name === m.model_name && existing.provider_name === m.provider_name
                      ))
                      .map((model) => (
                        <SelectItem key={`${model.model_name}-${model.provider_name}`} value={`${model.model_name} (${model.provider_name})`}>
                          {model.model_name} ({model.provider_name})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button onClick={addModelToList} disabled={!selectedModelToAdd} size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        );

      case 'load_balance':
        return (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-emerald-900 mb-2">
                <Scale className="w-4 h-4" />
                <span className="font-medium text-sm">Load Balancing</span>
              </div>
              <p className="text-xs text-emerald-700">
                Distribute requests across multiple models based on percentage weights.
              </p>
            </div>
            
            {/* Model distribution */}
            <div>
              <Label className="text-sm font-medium">Model Distribution</Label>
              <div className="space-y-3 mt-2">
                {(localConfig.models || []).map((model: any, index: number) => (
                  <div key={index} className="p-3 bg-muted/50 rounded-lg border">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{model.model_name}</div>
                        <div className="text-xs text-muted-foreground">{model.provider_name}</div>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-800">
                        {model.distribution_percentage}%
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeModel(index)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <Slider
                      value={[model.distribution_percentage || 0]}
                      onValueChange={([value]) => updateModelPercentage(index, value)}
                      max={100}
                      min={0}
                      step={5}
                    />
                  </div>
                ))}
              </div>
              
              {/* Add model */}
              <div className="flex gap-2 mt-3">
                <Select value={selectedModelToAdd} onValueChange={setSelectedModelToAdd}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add model to balance" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels
                      .filter(m => !(localConfig.models || []).some((existing: any) => 
                        existing.model_name === m.model_name && existing.provider_name === m.provider_name
                      ))
                      .map((model) => (
                        <SelectItem key={`${model.model_name}-${model.provider_name}`} value={`${model.model_name} (${model.provider_name})`}>
                          {model.model_name} ({model.provider_name})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button onClick={addModelToList} disabled={!selectedModelToAdd} size="icon">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {/* Total percentage warning */}
              {(localConfig.models || []).length > 0 && (
                <div className={`mt-3 text-xs ${
                  (localConfig.models || []).reduce((sum: number, m: any) => sum + (m.distribution_percentage || 0), 0) !== 100
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}>
                  Total: {(localConfig.models || []).reduce((sum: number, m: any) => sum + (m.distribution_percentage || 0), 0)}%
                  {(localConfig.models || []).reduce((sum: number, m: any) => sum + (m.distribution_percentage || 0), 0) !== 100 && (
                    <span className="ml-1">(should equal 100%)</span>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 'smart_route':
        return (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-purple-900 mb-2">
                <Brain className="w-4 h-4" />
                <span className="font-medium text-sm">Smart Routing</span>
              </div>
              <p className="text-xs text-purple-700">
                Automatically routes requests to the optimal model based on complexity and cost.
              </p>
            </div>
            
            <div>
              <Label htmlFor="benchmark-model">Benchmark Model</Label>
              <Select 
                value={localConfig.benchmark_model || ""} 
                onValueChange={(value) => updateConfig('benchmark_model', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select benchmark model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={`${model.model_name}-${model.provider_name}`} value={model.model_name}>
                      {model.model_name} ({model.provider_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Performance Threshold</Label>
                <Badge variant="secondary">{Math.round((localConfig.performance_threshold || 0.8) * 100)}%</Badge>
              </div>
              <Slider
                value={[(localConfig.performance_threshold || 0.8) * 100]}
                onValueChange={([value]) => updateConfig('performance_threshold', value / 100)}
                max={100}
                min={0}
                step={5}
              />
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Cost Optimization Weight</Label>
                <Badge variant="secondary">{Math.round((localConfig.cost_threshold || 0.5) * 100)}%</Badge>
              </div>
              <Slider
                value={[(localConfig.cost_threshold || 0.5) * 100]}
                onValueChange={([value]) => updateConfig('cost_threshold', value / 100)}
                max={100}
                min={0}
                step={5}
              />
            </div>
          </div>
        );

      case 'rate_limit':
        return (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-orange-900 mb-2">
                <Timer className="w-4 h-4" />
                <span className="font-medium text-sm">Rate Limiting</span>
              </div>
              <p className="text-xs text-orange-700">
                Control request frequency to prevent abuse and manage costs.
              </p>
            </div>
            
            <div>
              <Label htmlFor="rpm">Requests per Minute</Label>
              <Input
                id="rpm"
                type="number"
                value={localConfig.requests_per_minute || 60}
                onChange={(e) => updateConfig('requests_per_minute', parseInt(e.target.value) || 60)}
                min={1}
                max={10000}
              />
            </div>
            
            <div>
              <Label htmlFor="rpd">Requests per Day</Label>
              <Input
                id="rpd"
                type="number"
                value={localConfig.requests_per_day || 10000}
                onChange={(e) => updateConfig('requests_per_day', parseInt(e.target.value) || 10000)}
                min={1}
              />
            </div>
            
            <div>
              <Label htmlFor="tpm">Tokens per Minute</Label>
              <Input
                id="tpm"
                type="number"
                value={localConfig.tokens_per_minute || 100000}
                onChange={(e) => updateConfig('tokens_per_minute', parseInt(e.target.value) || 100000)}
                min={1}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Burst Allowance</Label>
                <p className="text-xs text-muted-foreground">Allow short bursts above limit</p>
              </div>
              <Switch
                checked={localConfig.allow_burst || false}
                onCheckedChange={(checked) => updateConfig('allow_burst', checked)}
              />
            </div>
          </div>
        );

      case 'content_filter':
        return (
          <div className="space-y-4">
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-rose-900 mb-2">
                <Filter className="w-4 h-4" />
                <span className="font-medium text-sm">Content Filtering</span>
              </div>
              <p className="text-xs text-rose-700">
                Filter and moderate content to ensure safe and compliant responses.
              </p>
            </div>
            
            <div>
              <Label>Filter Type</Label>
              <Select 
                value={localConfig.filter_type || "moderate"} 
                onValueChange={(value) => updateConfig('filter_type', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strict">Strict - Block all flagged content</SelectItem>
                  <SelectItem value="moderate">Moderate - Block harmful content</SelectItem>
                  <SelectItem value="permissive">Permissive - Only block severe violations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-3">
              <Label>Filter Categories</Label>
              {['hate_speech', 'violence', 'sexual_content', 'self_harm', 'dangerous'].map((category) => (
                <div key={category} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{category.replace('_', ' ')}</span>
                  <Switch
                    checked={localConfig.categories?.[category] !== false}
                    onCheckedChange={(checked) => updateConfig('categories', { 
                      ...(localConfig.categories || {}), 
                      [category]: checked 
                    })}
                  />
                </div>
              ))}
            </div>
          </div>
        );

      case 'auth_check':
        return (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-indigo-900 mb-2">
                <KeyRound className="w-4 h-4" />
                <span className="font-medium text-sm">Authentication Check</span>
              </div>
              <p className="text-xs text-indigo-700">
                Validate API keys and user authentication before processing requests.
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Require Valid API Key</Label>
                <p className="text-xs text-muted-foreground">Reject requests without valid key</p>
              </div>
              <Switch
                checked={localConfig.require_api_key !== false}
                onCheckedChange={(checked) => updateConfig('require_api_key', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Check Credit Balance</Label>
                <p className="text-xs text-muted-foreground">Verify user has sufficient credits</p>
              </div>
              <Switch
                checked={localConfig.check_balance || false}
                onCheckedChange={(checked) => updateConfig('check_balance', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Validate Model Access</Label>
                <p className="text-xs text-muted-foreground">Check if user can access requested model</p>
              </div>
              <Switch
                checked={localConfig.validate_model_access || false}
                onCheckedChange={(checked) => updateConfig('validate_model_access', checked)}
              />
            </div>
          </div>
        );

      case 'pii_masking':
        return (
          <div className="space-y-4">
            <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-pink-900 mb-2">
                <Fingerprint className="w-4 h-4" />
                <span className="font-medium text-sm">PII Masking</span>
              </div>
              <p className="text-xs text-pink-700">
                Automatically detect and mask personally identifiable information.
              </p>
            </div>
            
            <div className="space-y-3">
              <Label>PII Types to Mask</Label>
              {['email', 'phone', 'ssn', 'credit_card', 'address', 'name'].map((type) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
                  <Switch
                    checked={localConfig.pii_types?.[type] !== false}
                    onCheckedChange={(checked) => updateConfig('pii_types', { 
                      ...(localConfig.pii_types || {}), 
                      [type]: checked 
                    })}
                  />
                </div>
              ))}
            </div>
            
            <div>
              <Label>Masking Style</Label>
              <Select 
                value={localConfig.masking_style || "redact"} 
                onValueChange={(value) => updateConfig('masking_style', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="redact">Redact - Replace with [REDACTED]</SelectItem>
                  <SelectItem value="mask">Mask - Replace with ***</SelectItem>
                  <SelectItem value="hash">Hash - Replace with hash value</SelectItem>
                  <SelectItem value="fake">Fake - Replace with fake data</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'logging':
        return (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-slate-900 mb-2">
                <Eye className="w-4 h-4" />
                <span className="font-medium text-sm">Request Logging</span>
              </div>
              <p className="text-xs text-slate-700">
                Log requests and responses for debugging and analytics.
              </p>
            </div>
            
            <div>
              <Label>Log Level</Label>
              <Select 
                value={localConfig.log_level || "info"} 
                onValueChange={(value) => updateConfig('log_level', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debug">Debug - All details</SelectItem>
                  <SelectItem value="info">Info - Standard logging</SelectItem>
                  <SelectItem value="warn">Warn - Warnings and errors only</SelectItem>
                  <SelectItem value="error">Error - Errors only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Log Request Body</Label>
                <p className="text-xs text-muted-foreground">Include full request in logs</p>
              </div>
              <Switch
                checked={localConfig.log_request || false}
                onCheckedChange={(checked) => updateConfig('log_request', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Log Response Body</Label>
                <p className="text-xs text-muted-foreground">Include full response in logs</p>
              </div>
              <Switch
                checked={localConfig.log_response || false}
                onCheckedChange={(checked) => updateConfig('log_response', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Log Latency Metrics</Label>
                <p className="text-xs text-muted-foreground">Track response times</p>
              </div>
              <Switch
                checked={localConfig.log_latency !== false}
                onCheckedChange={(checked) => updateConfig('log_latency', checked)}
              />
            </div>
          </div>
        );

      case 'cache':
        return (
          <div className="space-y-4">
            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-cyan-900 mb-2">
                <Sparkles className="w-4 h-4" />
                <span className="font-medium text-sm">Response Caching</span>
              </div>
              <p className="text-xs text-cyan-700">
                Cache identical requests to reduce latency and costs.
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Caching</Label>
                <p className="text-xs text-muted-foreground">Cache responses for identical requests</p>
              </div>
              <Switch
                checked={localConfig.enabled !== false}
                onCheckedChange={(checked) => updateConfig('enabled', checked)}
              />
            </div>
            
            <div>
              <Label htmlFor="ttl">Cache TTL (seconds)</Label>
              <Input
                id="ttl"
                type="number"
                value={localConfig.ttl || 3600}
                onChange={(e) => updateConfig('ttl', parseInt(e.target.value) || 3600)}
                min={60}
                max={86400}
              />
            </div>
            
            <div>
              <Label>Cache Strategy</Label>
              <Select 
                value={localConfig.strategy || "exact"} 
                onValueChange={(value) => updateConfig('strategy', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exact Match - Same prompt only</SelectItem>
                  <SelectItem value="semantic">Semantic - Similar meanings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-card border-l">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-lg">Configure Node</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Basic info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="node-title">Title</Label>
              <Input
                id="node-title"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                placeholder="Enter node title"
              />
            </div>
            
            <div>
              <Label htmlFor="node-description">Description (optional)</Label>
              <Input
                id="node-description"
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                placeholder="Describe what this node does"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch
                checked={node.enabled}
                onCheckedChange={(checked) => onUpdate({ enabled: checked })}
              />
            </div>
          </div>
          
          <hr className="border-border" />
          
          {/* Node-specific config */}
          {renderNodeSpecificConfig()}
        </div>
      </ScrollArea>
      
      {/* Footer */}
      <div className="p-4 border-t flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSave}>
          Save Changes
        </Button>
      </div>
    </div>
  );
};

