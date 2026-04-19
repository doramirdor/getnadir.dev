
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

/**
 * Bar shape replicating the design-system accent bar:
 * tinted rectangle + a crisp 2px top border (the "accent-chart / accent"
 * pair in theme.css). Recharts doesn't expose top-border natively, so we
 * render it ourselves.
 */
type UsageBarProps = { x?: number; y?: number; width?: number; height?: number };
const UsageBar = ({ x = 0, y = 0, width = 0, height = 0 }: UsageBarProps) => {
  // Clamp so empty buckets still paint a 2px accent line at baseline.
  const safeHeight = Math.max(height, 2);
  const topY = height > 0 ? y : y + height - 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={safeHeight}
        fill="hsl(var(--brand-blue) / 0.18)"
        rx={3}
        ry={3}
      />
      <rect
        x={x}
        y={topY}
        width={width}
        height={2}
        fill="hsl(var(--brand-blue))"
        rx={1}
        ry={1}
      />
    </g>
  );
};

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
        <CardTitle className="text-sm font-medium">Requests over time</CardTitle>
      </CardHeader>
      <CardContent>
        {/*
          Bar chart per the Nadir Design System (ui_kits/admin/DashboardScreen.jsx
          UsageChart): soft brand-blue fill with a brighter 2px top border, 3px
          top-rounded corners. No axes or grid — just labels under the trough.
        */}
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="transparent" />
            <XAxis dataKey="name" hide />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
                fontSize: '13px',
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value: number, name: string) =>
                name === 'Cost ($)' ? [`$${value.toFixed(2)}`, name] : [value, name]
              }
            />
            <Bar
              dataKey="requests"
              name="Requests"
              shape={<UsageBar />}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-between mt-3 text-[11px] text-muted-foreground">
          <span>30d ago</span>
          <span>20d</span>
          <span>10d</span>
          <span>today</span>
        </div>
      </CardContent>
    </Card>
  );
};
