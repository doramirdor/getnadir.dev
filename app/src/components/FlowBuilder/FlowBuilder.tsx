import { useState, useCallback } from "react";
import { FlowNode, FlowNodeData, FlowNodeType } from "./FlowNode";
import { FlowNodeConfig } from "./FlowNodeConfig";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Plus,
  GitBranch,
  Scale,
  Brain,
  Timer,
  Filter,
  KeyRound,
  Fingerprint,
  Eye,
  Sparkles,
  Zap,
  CheckCircle2,
  ChevronRight,
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AvailableModel {
  model_name: string;
  provider_name: string;
  owner: string;
  input_cost: number;
  output_cost: number;
  token_capacity: number;
}

interface FlowBuilderProps {
  nodes: FlowNodeData[];
  onNodesChange: (nodes: FlowNodeData[]) => void;
  availableModels: AvailableModel[];
}

const AVAILABLE_NODE_TYPES: { type: FlowNodeType; title: string; description: string; category: string; icon: React.ElementType }[] = [
  { type: 'fallback', title: 'Fallback Routing', description: 'Route to backup models on failure', category: 'Routing', icon: GitBranch },
  { type: 'load_balance', title: 'Load Balancing', description: 'Distribute across multiple models', category: 'Routing', icon: Scale },
  { type: 'smart_route', title: 'Smart Routing', description: 'AI-powered optimal model selection', category: 'Routing', icon: Brain },
  { type: 'rate_limit', title: 'Rate Limiting', description: 'Control request frequency', category: 'Security', icon: Timer },
  { type: 'content_filter', title: 'Content Filter', description: 'Filter harmful content', category: 'Security', icon: Filter },
  { type: 'auth_check', title: 'Auth Check', description: 'Validate authentication', category: 'Security', icon: KeyRound },
  { type: 'pii_masking', title: 'PII Masking', description: 'Mask personal information', category: 'Security', icon: Fingerprint },
  { type: 'logging', title: 'Logging', description: 'Log requests and responses', category: 'Utility', icon: Eye },
  { type: 'cache', title: 'Response Cache', description: 'Cache identical requests', category: 'Utility', icon: Sparkles },
];

const NODE_CATEGORY_COLORS: Record<string, string> = {
  'Routing': 'bg-blue-100 text-blue-800 border-blue-200',
  'Security': 'bg-rose-100 text-rose-800 border-rose-200',
  'Utility': 'bg-slate-100 text-slate-800 border-slate-200',
};

export const FlowBuilder = ({ nodes, onNodesChange, availableModels }: FlowBuilderProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showNodePicker, setShowNodePicker] = useState(false);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  
  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const generateId = () => `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addNode = useCallback((type: FlowNodeType, position?: number) => {
    const nodeTypeInfo = AVAILABLE_NODE_TYPES.find(n => n.type === type);
    if (!nodeTypeInfo) return;

    const newNode: FlowNodeData = {
      id: generateId(),
      type,
      title: nodeTypeInfo.title,
      description: nodeTypeInfo.description,
      config: getDefaultConfig(type),
      position: position ?? nodes.length - 1,
      enabled: true,
    };

    const insertAt = position ?? nodes.length - 1;
    const newNodes = [
      ...nodes.slice(0, insertAt),
      newNode,
      ...nodes.slice(insertAt),
    ].map((n, i) => ({ ...n, position: i }));

    onNodesChange(newNodes);
    setSelectedNodeId(newNode.id);
    setShowNodePicker(false);
    setInsertPosition(null);
  }, [nodes, onNodesChange]);

  const updateNode = useCallback((nodeId: string, updates: Partial<FlowNodeData>) => {
    const newNodes = nodes.map(n => 
      n.id === nodeId ? { ...n, ...updates } : n
    );
    onNodesChange(newNodes);
  }, [nodes, onNodesChange]);

  const deleteNode = useCallback((nodeId: string) => {
    const newNodes = nodes
      .filter(n => n.id !== nodeId)
      .map((n, i) => ({ ...n, position: i }));
    onNodesChange(newNodes);
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  }, [nodes, onNodesChange, selectedNodeId]);

  // Reorder nodes function
  const reorderNodes = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    // Don't allow moving trigger (index 0) or output (last index)
    if (fromIndex === 0 || fromIndex === nodes.length - 1) return;
    if (toIndex === 0 || toIndex === nodes.length - 1) return;
    
    const newNodes = [...nodes];
    const [movedNode] = newNodes.splice(fromIndex, 1);
    newNodes.splice(toIndex, 0, movedNode);
    
    // Create new objects with updated positions
    const updatedNodes = newNodes.map((n, i) => ({ ...n, position: i }));
    onNodesChange(updatedNodes);
  }, [nodes, onNodesChange]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    const node = nodes[index];
    if (!node || node.type === 'trigger' || node.type === 'output') {
      e.preventDefault();
      return;
    }
    
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    
    // Set drag image
    if (e.currentTarget instanceof HTMLElement) {
      const rect = e.currentTarget.getBoundingClientRect();
      e.dataTransfer.setDragImage(e.currentTarget, rect.width / 2, rect.height / 2);
    }
  }, [nodes]);

  const handleDragEnd = useCallback(() => {
    // Perform the reorder if we have valid indices
    if (draggedIndex !== null && dropTargetIndex !== null && draggedIndex !== dropTargetIndex) {
      reorderNodes(draggedIndex, dropTargetIndex);
    }
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, [draggedIndex, dropTargetIndex, reorderNodes]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const node = nodes[index];
    // Don't allow dropping on trigger or output
    if (!node || node.type === 'trigger' || node.type === 'output') return;
    // Don't mark as drop target if dragging over self
    if (index === draggedIndex) return;
    
    setDropTargetIndex(index);
  }, [nodes, draggedIndex]);

  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    
    const node = nodes[index];
    if (!node || node.type === 'trigger' || node.type === 'output') return;
    
    if (draggedIndex !== null && draggedIndex !== index) {
      reorderNodes(draggedIndex, index);
    }
    
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, [draggedIndex, nodes, reorderNodes]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Check if we're leaving the entire drop zone area
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !relatedTarget.closest('[data-drop-zone]')) {
      setDropTargetIndex(null);
    }
  }, []);

  const getDefaultConfig = (type: FlowNodeType): Record<string, any> => {
    switch (type) {
      case 'fallback':
        return { models: [], mode: 'custom' };
      case 'load_balance':
        return { models: [] };
      case 'smart_route':
        return { benchmark_model: '', performance_threshold: 0.8, cost_threshold: 0.5 };
      case 'rate_limit':
        return { requests_per_minute: 60, requests_per_day: 10000, tokens_per_minute: 100000, allow_burst: false };
      case 'content_filter':
        return { filter_type: 'moderate', categories: { hate_speech: true, violence: true, sexual_content: true, self_harm: true, dangerous: true } };
      case 'auth_check':
        return { require_api_key: true, check_balance: true, validate_model_access: true };
      case 'pii_masking':
        return { pii_types: { email: true, phone: true, ssn: true, credit_card: true, address: true, name: true }, masking_style: 'redact' };
      case 'logging':
        return { log_level: 'info', log_request: false, log_response: false, log_latency: true };
      case 'cache':
        return { enabled: true, ttl: 3600, strategy: 'exact' };
      default:
        return {};
    }
  };

  const handleAddNodeClick = (position: number) => {
    setInsertPosition(position);
    setShowNodePicker(true);
  };

  // Group available nodes by category
  const nodesByCategory = AVAILABLE_NODE_TYPES.reduce((acc, node) => {
    if (!acc[node.category]) acc[node.category] = [];
    acc[node.category].push(node);
    return acc;
  }, {} as Record<string, typeof AVAILABLE_NODE_TYPES>);

  const middleNodes = nodes.filter(n => n.type !== 'trigger' && n.type !== 'output');

  return (
    <div className="flex h-full flex-col">
      {/* Canvas header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm">Flow Builder</span>
          <Badge variant="secondary" className="ml-1 text-xs">
            {middleNodes.length} layer{middleNodes.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Drag layers to reorder
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddNodeClick(nodes.length - 1)}
            className="gap-1.5 h-8"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Layer
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Flow canvas - horizontal scrollable */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-8 min-h-full flex items-center" data-drop-zone>
              <div className="flex items-center">
                {nodes.map((node, index) => {
                  const isDraggable = node.type !== 'trigger' && node.type !== 'output';
                  const isBeingDragged = draggedIndex === index;
                  const isDropTarget = dropTargetIndex === index && draggedIndex !== index;
                  
                  return (
                    <div 
                      key={node.id} 
                      className={cn(
                        "relative flex items-center transition-transform duration-150",
                        isBeingDragged && "opacity-50 scale-95"
                      )}
                      draggable={isDraggable}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, index)}
                    >
                      <FlowNode
                        node={node}
                        isSelected={selectedNodeId === node.id}
                        onSelect={() => setSelectedNodeId(node.id)}
                        onDelete={() => deleteNode(node.id)}
                        onConfigure={() => setSelectedNodeId(node.id)}
                        isFirst={index === 0}
                        isLast={index === nodes.length - 1}
                        isDragging={isBeingDragged}
                        isDragOver={isDropTarget}
                      />
                      
                      {/* Add button between nodes (not after trigger or before output) */}
                      {index > 0 && index < nodes.length - 1 && (
                        <Button
                          variant="outline"
                          size="icon"
                          className={cn(
                            "h-5 w-5 rounded-full border-dashed opacity-0 hover:opacity-100 transition-all bg-background absolute right-8 top-1/2 -translate-y-1/2 z-10",
                            showNodePicker && insertPosition === index + 1 && "opacity-100 border-primary"
                          )}
                          onClick={() => handleAddNodeClick(index + 1)}
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* Side panel - Config or Node picker */}
        <div className={cn(
          "w-[380px] border-l transition-all duration-200 flex-shrink-0",
          (selectedNode || showNodePicker) ? "" : "hidden"
        )}>
          {showNodePicker ? (
            <div className="h-full flex flex-col bg-card">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold">Add Layer</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowNodePicker(false)}>
                  Cancel
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-5">
                  {Object.entries(nodesByCategory).map(([category, categoryNodes]) => (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs font-medium", NODE_CATEGORY_COLORS[category])}
                        >
                          {category}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {categoryNodes.map((nodeType) => {
                          const Icon = nodeType.icon;
                          return (
                            <button
                              key={nodeType.type}
                              onClick={() => addNode(nodeType.type, insertPosition ?? undefined)}
                              className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 transition-colors text-left group"
                            >
                              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10">
                                <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{nodeType.title}</div>
                                <div className="text-xs text-muted-foreground truncate">{nodeType.description}</div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : selectedNode && selectedNode.type !== 'trigger' && selectedNode.type !== 'output' ? (
            <FlowNodeConfig
              node={selectedNode}
              availableModels={availableModels}
              onUpdate={(updates) => updateNode(selectedNode.id, updates)}
              onClose={() => setSelectedNodeId(null)}
            />
          ) : selectedNode ? (
            <div className="h-full flex flex-col bg-card">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="font-semibold">
                  {selectedNode.type === 'trigger' ? 'Request Entry' : 'Response Output'}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedNodeId(null)}>
                  Close
                </Button>
              </div>
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div>
                  {selectedNode.type === 'trigger' ? (
                    <>
                      <Zap className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                      <h4 className="font-medium mb-1.5">Incoming Request</h4>
                      <p className="text-sm text-muted-foreground">
                        All requests start here and pass through the layers you configure.
                      </p>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                      <h4 className="font-medium mb-1.5">Response Output</h4>
                      <p className="text-sm text-muted-foreground">
                        The final response is returned after passing through all layers.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// Helper to create initial flow with trigger and output nodes
export const createInitialFlow = (): FlowNodeData[] => [
  {
    id: 'trigger',
    type: 'trigger',
    title: 'Incoming Request',
    description: 'API request entry point',
    config: {},
    position: 0,
    enabled: true,
  },
  {
    id: 'output',
    type: 'output',
    title: 'Send Response',
    description: 'Return processed response',
    config: {},
    position: 1,
    enabled: true,
  },
];
