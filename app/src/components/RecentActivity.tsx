
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

interface Activity {
  id: string;
  request_id: string;
  prompt: string;
  model_name: string;
  provider: string;
  cost: number;
  error: string | null;
  created_at: string;
  latency_ms: number | null;
  metadata: any;
}

export const RecentActivity = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('usage_logs')
        .select('id, request_id, prompt, model_name, provider, cost, error, created_at, latency_ms, metadata')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      logger.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - past.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return "just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  if (loading) {
    return (
      <Card className="clean-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-16 h-3 bg-muted rounded animate-pulse" />
                  <div className="w-12 h-4 bg-muted rounded animate-pulse" />
                </div>
                <div className="w-full h-3 bg-muted rounded animate-pulse mb-1" />
                <div className="w-32 h-3 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="clean-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No recent activity
            </div>
          ) : (
            activities.map((activity) => {
              const status = activity.error ? "error" : "ok";
              const meta = activity.metadata as any;
              const complexityScore = meta?.complexity_score;
              const selectionMethod = meta?.analyzer_type;

              return (
                <div key={activity.id} className="p-3 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${status === "ok" ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="text-[13px] font-medium text-foreground">{activity.model_name}</span>
                      <span className="text-xs text-muted-foreground">{activity.provider}</span>
                      {selectionMethod && (
                        <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0 text-muted-foreground border-border">
                          {selectionMethod}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">${activity.cost.toFixed(4)}</span>
                      {activity.latency_ms && <span>{activity.latency_ms}ms</span>}
                      <span>{formatTimeAgo(activity.created_at)}</span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground truncate max-w-2xl pl-3.5">
                    {activity.prompt}
                  </p>

                  {complexityScore != null && (
                    <div className="flex items-center gap-1.5 mt-1 pl-3.5">
                      <span className="text-[11px] text-muted-foreground">
                        Complexity: {(complexityScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};
