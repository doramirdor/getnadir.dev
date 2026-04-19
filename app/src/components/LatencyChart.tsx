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
      // Last 30 days, daily buckets, zero-padded.
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - 29);
      since.setUTCHours(0, 0, 0, 0);

      const { data: eventsData } = await supabase
        .from('usage_logs')
        .select('created_at, latency_ms, model_name')
        .gte('created_at', since.toISOString())
        .not('latency_ms', 'is', null)
        .order('created_at', { ascending: true });

      if (!eventsData || eventsData.length === 0) {
        setLatencyData([]);
        setModelLatencyData([]);
        setAvgResponse(0);
        setFastestModel("");
        return;
      }

      // Group latencies by day
      const perDay = new Map<string, number[]>();
      for (const ev of eventsData) {
        const key = new Date(ev.created_at).toISOString().slice(0, 10);
        const arr = perDay.get(key) ?? [];
        arr.push(ev.latency_ms);
        perDay.set(key, arr);
      }

      const chartData: LatencyData[] = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(since);
        d.setUTCDate(d.getUTCDate() + i);
        const isoKey = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const responses = perDay.get(isoKey) ?? [];
        if (responses.length === 0) {
          // Zero-pad to keep the x-axis continuous; the chart reads NaN as a gap.
          chartData.push({ name: label, avgLatency: NaN as any, p95Latency: NaN as any, p99Latency: NaN as any });
          continue;
        }
        const sorted = [...responses].sort((a, b) => a - b);
        const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
        const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
        const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
        chartData.push({
          name: label,
          avgLatency: Math.round(avg),
          p95Latency: p95,
          p99Latency: p99,
        });
      }

      setLatencyData(chartData);
      const overallAvg = eventsData.reduce((s, ev) => s + (ev.latency_ms || 0), 0) / eventsData.length;
      setAvgResponse(overallAvg / 1000);

      // Per-model averages
      const perModel = new Map<string, number[]>();
      for (const ev of eventsData) {
        const arr = perModel.get(ev.model_name) ?? [];
        arr.push(ev.latency_ms);
        perModel.set(ev.model_name, arr);
      }
      const modelLatency: ModelLatencyData[] = Array.from(perModel.entries())
        .map(([model, xs]) => ({
          model,
          avgLatency: Math.round(xs.reduce((s, v) => s + v, 0) / xs.length),
        }))
        .sort((a, b) => a.avgLatency - b.avgLatency)
        .slice(0, 5);

      setModelLatencyData(modelLatency);
      setFastestModel(modelLatency[0]?.model || "");
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
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
                fontSize: '13px',
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value: number) => [`${value}ms`, '']}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {/*
              p50/p95/p99 colour mapping from the Nadir Design System
              (LatencyChart in DashboardScreen.jsx): accent (brand-blue) /
              warn-chart / err-chart. Primary-green is reserved for savings.
            */}
            <Line type="monotone" dataKey="avgLatency" stroke="hsl(var(--brand-blue))"  strokeWidth={1.5} dot={{ r: 2.5, fill: "hsl(var(--brand-blue))",  strokeWidth: 0 }} name="p50" />
            <Line type="monotone" dataKey="p95Latency" stroke="hsl(var(--warn-chart))"  strokeWidth={1.5} dot={{ r: 2.5, fill: "hsl(var(--warn-chart))",  strokeWidth: 0 }} name="p95" />
            <Line type="monotone" dataKey="p99Latency" stroke="hsl(var(--err-chart))"   strokeWidth={1.5} dot={{ r: 2.5, fill: "hsl(var(--err-chart))",   strokeWidth: 0 }} name="p99" />
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
                  <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${pct}%`, background: "hsl(var(--brand-blue) / 0.7)" }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-14 text-right mono">{model.avgLatency}ms</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 pt-4 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground">Avg Response</p>
            <p className="text-sm font-semibold text-foreground mono">{avgResponse.toFixed(2)}s</p>
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
