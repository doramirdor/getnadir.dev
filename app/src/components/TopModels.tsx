
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

interface ModelData {
  name: string;
  usage: number;
  requests: string;
  cost: string;
  avgComplexity: number;
  dominantTier: string;
  provider: string;
}

export const TopModels = () => {
  const [models, setModels] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModelData();
  }, []);

  const fetchModelData = async () => {
    try {
      const { data: eventsData } = await supabase
        .from('usage_logs')
        .select('model_name, cost, provider, metadata')
        .order('created_at', { ascending: false });

      if (eventsData && eventsData.length > 0) {
        const modelStats = eventsData.reduce((acc, ev) => {
          if (!acc[ev.model_name]) {
            acc[ev.model_name] = {
              requests: 0,
              cost: 0,
              provider: ev.provider || 'Unknown',
              complexityScores: [],
              tiers: []
            };
          }
          acc[ev.model_name].requests += 1;
          acc[ev.model_name].cost += ev.cost || 0;

          const meta = ev.metadata as any;
          if (meta?.complexity_score != null) {
            acc[ev.model_name].complexityScores.push(meta.complexity_score);
          }
          if (meta?.classifier_tier) {
            acc[ev.model_name].tiers.push(meta.classifier_tier);
          }
          return acc;
        }, {} as Record<string, { requests: number, cost: number, provider: string, complexityScores: number[], tiers: string[] }>);

        const modelArray = Object.entries(modelStats)
          .map(([name, stats]) => ({ name, ...stats }))
          .sort((a, b) => b.requests - a.requests)
          .slice(0, 5);

        const maxRequests = Math.max(...modelArray.map(m => m.requests));

        const modelData = modelArray.map(model => {
          const avgComplexity = model.complexityScores.length > 0
            ? model.complexityScores.reduce((s, v) => s + v, 0) / model.complexityScores.length
            : 0;

          const tierCounts = model.tiers.reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {} as Record<string, number>);
          const dominantTier = Object.entries(tierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

          return {
            name: model.name,
            usage: Math.round((model.requests / maxRequests) * 100),
            requests: model.requests.toLocaleString(),
            cost: `$${model.cost.toFixed(2)}`,
            avgComplexity,
            dominantTier,
            provider: model.provider
          };
        });

        setModels(modelData);
      } else {
        setModels([]);
      }
    } catch (error) {
      logger.error('Error fetching model data:', error);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="clean-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Models</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center">
            <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (models.length === 0) {
    return (
      <Card className="clean-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Models</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center text-sm text-muted-foreground">
            No model data yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="clean-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Top Models</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {models.map((model) => (
            <div key={model.name}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">{model.name}</span>
                  <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground border-border px-1.5 py-0">
                    {model.provider}
                  </Badge>
                </div>
                <div className="text-right">
                  <span className="text-[13px] font-semibold text-foreground">{model.cost}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-1.5">
                <div className="flex-1 bg-muted rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-primary/70 transition-all duration-500"
                    style={{ width: `${model.usage}%` }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground w-20 text-right">{model.requests} req</span>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{(model.avgComplexity * 100).toFixed(0)}% complexity</span>
                <span>{model.dominantTier} tier</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
