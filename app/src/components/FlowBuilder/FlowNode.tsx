import { memo } from "react";
import { 
  Zap, 
  Shield, 
  GitBranch, 
  Scale, 
  Brain, 
  Lock, 
  Timer, 
  Filter,
  Eye,
  KeyRound,
  Fingerprint,
  GripVertical,
  Trash2,
  Settings,
  CheckCircle2,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type FlowNodeType = 
  | 'trigger' 
  | 'fallback' 
  | 'load_balance' 
  | 'smart_route' 
  | 'rate_limit' 
  | 'content_filter' 
  | 'auth_check' 
  | 'pii_masking'
  | 'logging'
  | 'cache'
  | 'output';

export interface FlowNodeData {
  id: string;
  type: FlowNodeType;
  title: string;
  description?: string;
  config: Record<string, any>;
  position: number;
  enabled: boolean;
}

interface FlowNodeProps {
  node: FlowNodeData;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onConfigure: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
}

const NODE_ICONS: Record<FlowNodeType, React.ElementType> = {
  trigger: Zap,
  fallback: GitBranch,
  load_balance: Scale,
  smart_route: Brain,
  rate_limit: Timer,
  content_filter: Filter,
  auth_check: KeyRound,
  pii_masking: Fingerprint,
  logging: Eye,
  cache: Sparkles,
  output: CheckCircle2,
};

const NODE_COLORS: Record<FlowNodeType, { bg: string; border: string; icon: string; badge: string }> = {
  trigger: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', badge: 'bg-amber-100 text-amber-800' },
  fallback: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-800' },
  load_balance: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-800' },
  smart_route: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600', badge: 'bg-purple-100 text-purple-800' },
  rate_limit: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600', badge: 'bg-orange-100 text-orange-800' },
  content_filter: { bg: 'bg-rose-50', border: 'border-rose-200', icon: 'text-rose-600', badge: 'bg-rose-100 text-rose-800' },
  auth_check: { bg: 'bg-indigo-50', border: 'border-indigo-200', icon: 'text-indigo-600', badge: 'bg-indigo-100 text-indigo-800' },
  pii_masking: { bg: 'bg-pink-50', border: 'border-pink-200', icon: 'text-pink-600', badge: 'bg-pink-100 text-pink-800' },
  logging: { bg: 'bg-slate-50', border: 'border-slate-200', icon: 'text-slate-600', badge: 'bg-slate-100 text-slate-800' },
  cache: { bg: 'bg-cyan-50', border: 'border-cyan-200', icon: 'text-cyan-600', badge: 'bg-cyan-100 text-cyan-800' },
  output: { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-600', badge: 'bg-green-100 text-green-800' },
};

const NODE_CATEGORIES: Record<FlowNodeType, string> = {
  trigger: 'Entry',
  fallback: 'Routing',
  load_balance: 'Routing',
  smart_route: 'Routing',
  rate_limit: 'Security',
  content_filter: 'Security',
  auth_check: 'Security',
  pii_masking: 'Security',
  logging: 'Utility',
  cache: 'Utility',
  output: 'Exit',
};

export const FlowNode = memo(({ 
  node, 
  isSelected, 
  onSelect, 
  onDelete,
  onConfigure,
  isFirst,
  isLast,
  isDragging,
  isDragOver
}: FlowNodeProps) => {
  const Icon = NODE_ICONS[node.type];
  const colors = NODE_COLORS[node.type];
  const category = NODE_CATEGORIES[node.type];
  
  const isTriggerOrOutput = node.type === 'trigger' || node.type === 'output';

  return (
    <div className="flex items-center relative">
      {/* Drop indicator - left side */}
      {isDragOver && (
        <div className="absolute -left-1 top-0 bottom-0 w-1 bg-primary rounded-full z-20 animate-pulse" />
      )}
      
      {/* Main node card */}
      <div
        onClick={onSelect}
        className={cn(
          "relative group w-[200px] rounded-lg border transition-all duration-200 flex-shrink-0",
          isTriggerOrOutput ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          colors.bg,
          colors.border,
          isSelected && "ring-2 ring-offset-2 ring-primary shadow-md",
          !isSelected && "hover:shadow-sm",
          isDragOver && "ring-2 ring-primary ring-offset-2",
          !node.enabled && "opacity-50"
        )}
      >
        {/* Card content */}
        <div className="p-3">
          <div className="flex items-start gap-2">
            {/* Icon container */}
            <div className={cn(
              "w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0",
              "bg-white/60 border",
              colors.border
            )}>
              <Icon className={cn("w-4 h-4", colors.icon)} />
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-0.5">
                <h3 className="font-medium text-xs text-foreground truncate">{node.title}</h3>
              </div>
              <Badge variant="secondary" className={cn("text-[9px] px-1 py-0 h-3.5 font-medium", colors.badge)}>
                {category}
              </Badge>
              
              {/* Config summary */}
              {Object.keys(node.config).length > 0 && (
                <div className="mt-1">
                  {node.type === 'fallback' && node.config.models?.length > 0 && (
                    <span className="text-[9px] text-muted-foreground">
                      {node.config.models.length} model{node.config.models.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {node.type === 'load_balance' && node.config.models?.length > 0 && (
                    <span className="text-[9px] text-muted-foreground">
                      {node.config.models.length} model{node.config.models.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {node.type === 'rate_limit' && node.config.requests_per_minute && (
                    <span className="text-[9px] text-muted-foreground">
                      {node.config.requests_per_minute} req/min
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Action buttons - shown on hover */}
          {!isTriggerOrOutput && (
            <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5"
                onClick={(e) => { e.stopPropagation(); onConfigure(); }}
              >
                <Settings className="w-2.5 h-2.5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5 text-destructive hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="w-2.5 h-2.5" />
              </Button>
            </div>
          )}
        </div>
        
        {/* Enabled/disabled indicator */}
        {!node.enabled && (
          <div className="absolute inset-0 bg-background/60 rounded-lg flex items-center justify-center backdrop-blur-[1px]">
            <Badge variant="secondary" className="text-[9px]">Disabled</Badge>
          </div>
        )}
      </div>
      
      {/* Connection arrow to next node */}
      {!isLast && (
        <div className="flex items-center mx-2 flex-shrink-0">
          <div className="w-6 h-px bg-border" />
          <ArrowRight className="w-3 h-3 text-muted-foreground/50 -ml-1" />
        </div>
      )}
    </div>
  );
});

FlowNode.displayName = "FlowNode";
