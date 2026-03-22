
import { useState, useEffect } from "react";
import {
  Activity,
  CreditCard,
  Key,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useApiKey } from "@/hooks/useApiKey";
import { useAuth } from "@/hooks/useAuth";
import { SavingsAPI } from "@/services/savingsApi";
import { logger } from "@/utils/logger";

interface Metrics {
  totalRequests: number;
  monthlyCost: number;
  activeApiKeys: number;
  avgResponseTime: number;
}

export const MetricsGrid = () => {
  const [metrics, setMetrics] = useState<Metrics>({
    totalRequests: 0,
    monthlyCost: 0,
    activeApiKeys: 0,
    avgResponseTime: 0,
  });
  const [loading, setLoading] = useState(true);
  const { apiKey } = useApiKey();
  const { user } = useAuth();

  // Fetch savings summary from backend
  const savingsApi = apiKey ? new SavingsAPI(apiKey) : null;
  const { data: savingsSummary } = useQuery({
    queryKey: ["savings", "summary", apiKey],
    queryFn: () => savingsApi!.getSavingsSummary(),
    enabled: !!savingsApi,
    retry: 1,
    staleTime: 60_000,
  });

  const savedThisMonth = savingsSummary?.total_savings_usd ?? 0;

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch usage events for the last 30 days
      const query = supabase
        .from('usage_logs')
        .select('latency_ms, cost, error, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .not('latency_ms', 'is', null);
      if (user) query.eq('user_id', user.id);
      const { data: eventsData } = await query;

      // Fetch active API keys count
      let activeApiKeys = 0;
      if (user) {
        const { count } = await supabase
          .from('api_keys')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_active', true);
        activeApiKeys = count || 0;
      }

      const totalRequests = eventsData?.length || 0;

      const monthlyCost = eventsData?.reduce((sum, ev) => sum + (ev.cost || 0), 0) || 0;

      const avgResponseTime = eventsData?.length
        ? (eventsData.reduce((sum, ev) => sum + (ev.latency_ms || 0), 0) / eventsData.length / 1000)
        : 0;

      setMetrics({
        totalRequests,
        monthlyCost,
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
    { title: "Monthly Cost", value: `$${metrics.monthlyCost.toFixed(2)}`, icon: CreditCard },
    { title: "Savings This Month", value: `$${savedThisMonth.toFixed(2)}`, icon: TrendingDown, highlight: savedThisMonth > 0 },
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

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {metricsConfig.map((metric) => {
        const Icon = metric.icon;
        const isHighlighted = (metric as any).highlight;
        return (
          <div key={metric.title} className={`metric-card group ${isHighlighted ? 'border-emerald-200 bg-emerald-50/30' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">{metric.title}</span>
              <Icon className={`w-4 h-4 ${isHighlighted ? 'text-emerald-500' : 'text-muted-foreground/50'}`} strokeWidth={1.5} />
            </div>
            <div className={`text-2xl font-semibold ${isHighlighted ? 'text-emerald-700' : 'text-foreground'}`}>
              {metric.value}
            </div>
          </div>
        );
      })}
    </div>
  );
};
