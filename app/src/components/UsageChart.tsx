
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

interface UsageData {
  name: string;
  requests: number;
  cost: number;
}

export const UsageChart = () => {
  const [data, setData] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsageData();
  }, []);

  const fetchUsageData = async () => {
    try {
      // Last 30 days, daily buckets, zero-padded.
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - 29);
      since.setUTCHours(0, 0, 0, 0);

      const { data: eventsData } = await supabase
        .from('usage_logs')
        .select('created_at, cost')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true });

      const perDay = new Map<string, { requests: number; cost: number }>();
      (eventsData ?? []).forEach((ev) => {
        const key = new Date(ev.created_at).toISOString().slice(0, 10);
        const cur = perDay.get(key) ?? { requests: 0, cost: 0 };
        cur.requests += 1;
        cur.cost += ev.cost || 0;
        perDay.set(key, cur);
      });

      const chartData: UsageData[] = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date(since);
        d.setUTCDate(d.getUTCDate() + i);
        const isoKey = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const v = perDay.get(isoKey) ?? { requests: 0, cost: 0 };
        chartData.push({
          name: label,
          requests: v.requests,
          cost: parseFloat(v.cost.toFixed(2)),
        });
      }
      setData(chartData);
    } catch (error) {
      logger.error('Error fetching usage data:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="clean-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Usage Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center">
            <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="clean-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Usage Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            No usage data yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="clean-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Usage Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
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
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line
              type="monotone"
              dataKey="requests"
              stroke="hsl(152, 55%, 46%)"
              strokeWidth={2}
              dot={{ fill: "hsl(152, 55%, 46%)", strokeWidth: 0, r: 3 }}
              name="Requests"
            />
            <Line
              type="monotone"
              dataKey="cost"
              stroke="hsl(220, 9%, 46%)"
              strokeWidth={1.5}
              dot={{ fill: "hsl(220, 9%, 46%)", strokeWidth: 0, r: 2.5 }}
              name="Cost ($)"
              strokeDasharray="4 4"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
