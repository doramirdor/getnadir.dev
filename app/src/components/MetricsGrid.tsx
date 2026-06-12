
import { useState, useEffect } from "react";
import {
  Activity,
  CreditCard,
  Key,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { formatUSD } from "@/utils/format";

interface Metrics {
  totalRequests: number;
  monthlyCost: number;
  savedThisMonth: number;
  activeApiKeys: number;
  avgResponseTime: number;
}

export const MetricsGrid = () => {
  const [metrics, setMetrics] = useState<Metrics>({
    totalRequests: 0,
    monthlyCost: 0,
    savedThisMonth: 0,
    activeApiKeys: 0,
    avgResponseTime: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      // getSession() reads the locally cached session (no network round-trip),
      // unlike getUser() which revalidates against the auth server.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      // Fire the three queries in parallel instead of sequentially — they have
      // no data dependency, so a waterfall just stacked their latencies.
      let usageQuery = supabase
        .from('usage_logs')
        .select('latency_ms, cost, error, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .not('latency_ms', 'is', null);
      if (user) {
        usageQuery = usageQuery.eq('user_id', user.id);
      }

      const apiKeysQuery = user
        ? supabase
            .from('api_keys')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_active', true)
        : null;

      const savingsQuery = user
        ? supabase
            .from('savings_tracking')
            .select('savings_usd')
            .eq('user_id', user.id)
            .gte('created_at', monthStart.toISOString())
        : null;

      const [usageRes, apiKeysRes, savingsRes] = await Promise.all([
        usageQuery,
        apiKeysQuery,
        savingsQuery,
      ]);

      const eventsData = usageRes.data;
      const activeApiKeys = apiKeysRes?.count || 0;
      const savedThisMonth =
        savingsRes?.data?.reduce((s, r: any) => s + Number(r.savings_usd || 0), 0) || 0;

      const totalRequests = eventsData?.length || 0;

      const monthlyCost = eventsData?.reduce((sum, ev) => sum + (ev.cost || 0), 0) || 0;

      const avgResponseTime = eventsData?.length
        ? (eventsData.reduce((sum, ev) => sum + (ev.latency_ms || 0), 0) / eventsData.length / 1000)
        : 0;

      setMetrics({
        totalRequests,
        monthlyCost,
        savedThisMonth,
        activeApiKeys,
        avgResponseTime,
      });
    } catch (error) {
      logger.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const metricsConfig = [
    { title: "Total Requests", value: formatNumber(metrics.totalRequests), icon: Activity },
    { title: "Monthly Cost", value: `$${formatUSD(metrics.monthlyCost)}`, icon: CreditCard },
    { title: "Savings This Month", value: `$${formatUSD(metrics.savedThisMonth)}`, icon: TrendingDown, highlight: metrics.savedThisMonth > 0 },
    { title: "Active API Keys", value: metrics.activeApiKeys.toString(), icon: Key },
    { title: "Avg Response", value: `${metrics.avgResponseTime.toFixed(1)}s`, icon: TrendingUp },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="metric-card">
            <div className="w-20 h-3 bg-muted rounded animate-pulse mb-3" />
            <div className="w-16 h-7 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  // Fade-up stagger caps at 3 per the design system ("up to 3 children").
  const delayClass = (i: number) => {
    if (i === 0) return 'animate-fade-up';
    if (i === 1) return 'animate-fade-up-delay-1';
    if (i === 2) return 'animate-fade-up-delay-2';
    return 'animate-fade-up-delay-3';
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {metricsConfig.map((metric, i) => {
        const Icon = metric.icon;
        const isHighlighted = (metric as any).highlight;
        return (
          <div
            key={metric.title}
            className={`metric-card group ${delayClass(i)} ${
              isHighlighted
                ? 'border-[hsl(var(--ok-border))] bg-[hsl(var(--ok-bg))]'
                : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-medium text-muted-foreground">{metric.title}</span>
              <Icon
                className={`w-[14px] h-[14px] ${
                  isHighlighted ? 'text-[hsl(var(--ok))]' : 'text-muted-foreground/50'
                }`}
                strokeWidth={1.5}
              />
            </div>
            <div
              className={`mono text-[26px] font-semibold leading-none tracking-tight ${
                isHighlighted ? 'text-[hsl(var(--ok-strong))]' : 'text-foreground'
              }`}
            >
              {metric.value}
            </div>
          </div>
        );
      })}
    </div>
  );
};
