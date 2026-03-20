
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (provider: any) => void;
}

const providerOptions = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Gemini" }
];

const providerModels = {
  openai: ["gpt-4", "gpt-3.5-turbo", "gpt-4-vision", "gpt-4o", "gpt-4o-mini"],
  anthropic: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku", "claude-3-5-sonnet"],
  gemini: ["gemini-pro", "gemini-pro-vision", "gemini-1.5-pro", "gemini-1.5-flash"]
};

export const AddProviderDialog = ({ open, onOpenChange, onSave }: AddProviderDialogProps) => {
  const [formData, setFormData] = useState({
    provider: "",
    endpoint: "",
    description: "",
    models: [] as string[]
  });

  const handleProviderChange = (provider: string) => {
    setFormData(prev => ({
      ...prev,
      provider,
      models: [] // Reset selected models when provider changes
    }));
  };

  const handleModelToggle = (model: string) => {
    setFormData(prev => ({
      ...prev,
      models: prev.models.includes(model)
        ? prev.models.filter(m => m !== model)
        : [...prev.models, model]
    }));
  };

  const handleSave = () => {
    onSave(formData);
    setFormData({ provider: "", endpoint: "", description: "", models: [] });
    onOpenChange(false);
  };

  const availableModels = formData.provider ? providerModels[formData.provider as keyof typeof providerModels] || [] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New LLM Provider</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="provider">Provider</Label>
            <Select value={formData.provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="border-emerald-200">
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {providerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="endpoint">API Endpoint</Label>
            <Input
              id="endpoint"
              value={formData.endpoint}
              onChange={(e) => setFormData(prev => ({ ...prev, endpoint: e.target.value }))}
              placeholder="https://api.example.com/v1"
              className="border-emerald-200"
            />
          </div>
          
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe this provider..."
              className="border-emerald-200"
            />
          </div>
          
          {formData.provider && (
            <div>
              <Label>Available Models</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {availableModels.map((model) => (
                  <div key={model} className="flex items-center space-x-2">
                    <Checkbox
                      id={model}
                      checked={formData.models.includes(model)}
                      onCheckedChange={() => handleModelToggle(model)}
                    />
                    <Label htmlFor={model} className="text-sm">{model}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
            Add Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
