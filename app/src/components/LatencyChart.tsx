import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

interface LatencyData {
  name: string;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
}

interface ModelLatencyData {
  model: string;
  avgLatency: number;
}

export const LatencyChart = () => {
  const [latencyData, setLatencyData] = useState<LatencyData[]>([]);
  const [modelLatencyData, setModelLatencyData] = useState<ModelLatencyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [avgResponse, setAvgResponse] = useState(0);
  const [fastestModel, setFastestModel] = useState("");

  useEffect(() => {
    fetchLatencyData();
  }, []);

  const fetchLatencyData = async () => {
    try {
      const { data: eventsData } = await supabase
        .from('usage_events')
        .select('created_at, latency_ms, model_name')
        .not('latency_ms', 'is', null)
        .order('created_at', { ascending: true });

      if (eventsData && eventsData.length > 0) {
        const monthlyData = eventsData.reduce((acc, ev) => {
          const month = new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short' });
          if (!acc[month]) {
            acc[month] = { responses: [], month };
          }
          acc[month].responses.push(ev.latency_ms);
          return acc;
        }, {} as Record<string, { responses: number[], month: string }>);

        const chartData = Object.values(monthlyData).map(monthData => {
          const sorted = [...monthData.responses].sort((a, b) => a - b);
          const avgLatency = sorted.reduce((sum, time) => sum + time, 0) / sorted.length;
          const p95Index = Math.floor(sorted.length * 0.95);
          const p99Index = Math.floor(sorted.length * 0.99);
          return {
            name: monthData.month,
            avgLatency: Math.round(avgLatency),
            p95Latency: sorted[p95Index] || Math.floor(avgLatency * 1.8),
            p99Latency: sorted[p99Index] || Math.floor(avgLatency * 2.5)
          };
        }).slice(-6);

        setLatencyData(chartData);
        const avgResponseTime = chartData[chartData.length - 1]?.avgLatency || 0;
        setAvgResponse(avgResponseTime / 1000);

        const modelData = eventsData.reduce((acc, ev) => {
          if (!acc[ev.model_name]) {
            acc[ev.model_name] = { responses: [], model: ev.model_name };
          }
          acc[ev.model_name].responses.push(ev.latency_ms);
          return acc;
        }, {} as Record<string, { responses: number[], model: string }>);

        const modelLatency = Object.values(modelData)
          .map((modelData) => ({
            model: modelData.model,
            avgLatency: Math.round(modelData.responses.reduce((sum, time) => sum + time, 0) / modelData.responses.length),
          }))
          .sort((a, b) => a.avgLatency - b.avgLatency)
          .slice(0, 5);

        setModelLatencyData(modelLatency);
        setFastestModel(modelLatency[0]?.model || "");
      } else {
        setLatencyData([]);
        setModelLatencyData([]);
        setAvgResponse(0);
        setFastestModel("");
      }
    } catch (error) {
      logger.error('Error fetching latency data:', error);
      setLatencyData([]);
      setModelLatencyData([]);
      setAvgResponse(0);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="clean-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Latency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[380px] flex items-center justify-center">
            <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (latencyData.length === 0) {
    return (
      <Card className="clean-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Latency</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[380px] flex items-center justify-center text-sm text-muted-foreground">
            No latency data yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="clean-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Latency</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={latencyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" vertical={false} />
            <XAxis dataKey="name" stroke="hsl(220, 9%, 46%)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(220, 9%, 46%)" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid hsl(220, 13%, 91%)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
                fontSize: '13px',
              }}
              formatter={(value: number) => [`${value}ms`, '']}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey="avgLatency" stroke="hsl(152, 55%, 46%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(152, 55%, 46%)", strokeWidth: 0 }} name="Average" />
            <Line type="monotone" dataKey="p95Latency" stroke="hsl(38, 92%, 50%)" strokeWidth={1.5} dot={{ r: 2.5, fill: "hsl(38, 92%, 50%)", strokeWidth: 0 }} name="P95" />
            <Line type="monotone" dataKey="p99Latency" stroke="hsl(0, 72%, 51%)" strokeWidth={1.5} dot={{ r: 2.5, fill: "hsl(0, 72%, 51%)", strokeWidth: 0 }} name="P99" />
          </LineChart>
        </ResponsiveContainer>

        {/* Model latency list */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-3">Avg by Model</h3>
          <div className="space-y-2">
            {modelLatencyData.map((model, i) => {
              const maxLatency = modelLatencyData[modelLatencyData.length - 1]?.avgLatency || 1;
              const pct = Math.min((model.avgLatency / maxLatency) * 100, 100);
              return (
                <div key={model.model} className="flex items-center gap-3">
                  <span className="text-xs text-foreground w-40 truncate">{model.model}</span>
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-primary/60"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-14 text-right">{model.avgLatency}ms</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 pt-4 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">Avg Response</p>
            <p className="text-sm font-semibold text-foreground">{avgResponse.toFixed(2)}s</p>
          </div>
          {fastestModel && (
            <div>
              <p className="text-xs text-muted-foreground">Fastest Model</p>
              <p className="text-sm font-semibold text-foreground">{fastestModel}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
