
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
      const { data: eventsData } = await supabase
        .from('usage_logs')
        .select('created_at, cost')
        .order('created_at', { ascending: true });

      if (eventsData && eventsData.length > 0) {
        const monthlyData = eventsData.reduce((acc, ev) => {
          const month = new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short' });
          if (!acc[month]) {
            acc[month] = { requests: 0, cost: 0, month };
          }
          acc[month].requests += 1;
          acc[month].cost += ev.cost || 0;
          return acc;
        }, {} as Record<string, { requests: number, cost: number, month: string }>);

        const chartData = Object.values(monthlyData).map(data => ({
          name: data.month,
          requests: data.requests,
          cost: parseFloat(data.cost.toFixed(2))
        })).slice(-6);
        setData(chartData);
      } else {
        setData([]);
      }
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
