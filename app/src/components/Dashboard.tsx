
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MetricsGrid } from "@/components/MetricsGrid";
import { UsageChart } from "@/components/UsageChart";
import { LatencyChart } from "@/components/LatencyChart";
import { RecentActivity } from "@/components/RecentActivity";
import { TopModels } from "@/components/TopModels";
import { DailyQuotaBar } from "@/components/DailyQuotaBar";

export const Dashboard = () => {
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const channel = supabase
        .channel('usage_logs_realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'usage_logs',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (!cancelled) {
              setLiveEvents((prev) => [payload.new, ...prev].slice(0, 20));
            }
          }
        )
        .subscribe((status) => {
          if (!cancelled) {
            setIsConnected(status === 'SUBSCRIBED');
          }
        });

      channelRef.current = channel;
    };

    setupRealtime();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Page Header — title on the left, live-status pill on the right */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-description">Overview of your LLM routing and usage</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium ${
              isConnected
                ? 'bg-[hsl(var(--ok-bg))] border-[hsl(var(--ok-border))] text-[hsl(var(--ok))]'
                : 'bg-card border-border text-muted-foreground'
            }`}
            aria-live="polite"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected
                  ? 'bg-[hsl(var(--ok-dot))] animate-pulse'
                  : 'bg-muted-foreground/40'
              }`}
            />
            {isConnected ? 'Live' : 'Connecting'}
          </span>
        </div>
      </div>

      {/* Daily free-trial quota */}
      <DailyQuotaBar />

      {/* Metrics Grid */}
      <MetricsGrid />

      {/* Live Feed (inline ticker when events are streaming in) */}
      {liveEvents.length > 0 && (
        <Card className="clean-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="w-3.5 h-3.5 text-[hsl(var(--ok))] animate-pulse" />
              Live Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-48 overflow-auto">
              {liveEvents.map((event, i) => (
                <div
                  key={event.id || i}
                  className="flex items-center justify-between text-sm py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        event.error ? 'bg-[hsl(var(--err-dot))]' : 'bg-[hsl(var(--ok-dot))]'
                      }`}
                    />
                    <span className="font-medium text-foreground text-[13px] truncate">
                      {event.model_name || 'unknown'}
                    </span>
                    <span className="text-muted-foreground text-xs truncate">
                      {event.provider}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mono">
                    {event.latency_ms && <span>{event.latency_ms}ms</span>}
                    {event.cost && <span>${parseFloat(event.cost).toFixed(4)}</span>}
                    <span>{new Date(event.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <UsageChart />
          <LatencyChart />
        </div>
        <TopModels />
      </div>

      {/* Recent Activity */}
      <RecentActivity />
    </div>
  );
};
