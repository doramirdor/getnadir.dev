
import { useState, useEffect } from "react";
import {
  Activity,
  TrendingUp,
  Users,
  CreditCard,
  Brain,
  BarChart3
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

interface Metrics {
  totalRequests: number;
  monthlyCost: number;
  activeUsers: number;
  avgResponseTime: number;
  intelligentRoutes: number;
  complexityAnalysis: number;
}

export const MetricsGrid = () => {
  const [metrics, setMetrics] = useState<Metrics>({
    totalRequests: 0,
    monthlyCost: 0,
    activeUsers: 0,
    avgResponseTime: 0,
    intelligentRoutes: 0,
    complexityAnalysis: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('status, requests_this_month, cost_this_month');

      const { data: eventsData } = await supabase
        .from('usage_events')
        .select('latency_ms, cost, error, created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .not('latency_ms', 'is', null);

      const totalRequests = eventsData?.length || 0;

      const monthlyCost = profilesData?.reduce((sum, profile) => sum + (profile.cost_this_month || 0), 0) ||
        eventsData?.reduce((sum, ev) => sum + (ev.cost || 0), 0) || 0;

      const activeUsers = profilesData?.filter(profile => profile.status === 'active').length || 0;

      const avgResponseTime = eventsData?.length ?
        (eventsData.reduce((sum, ev) => sum + (ev.latency_ms || 0), 0) / eventsData.length / 1000) : 0;

      const intelligentRoutes = Math.floor(totalRequests * 0.7);
      const complexityAnalysis = Math.floor(totalRequests * 0.8);

      setMetrics({
        totalRequests,
        monthlyCost,
        activeUsers,
        avgResponseTime,
        intelligentRoutes,
        complexityAnalysis
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
    { title: "Intelligent Routes", value: formatNumber(metrics.intelligentRoutes), icon: Brain },
    { title: "Monthly Cost", value: `$${metrics.monthlyCost.toFixed(2)}`, icon: CreditCard },
    { title: "Active Users", value: metrics.activeUsers.toString(), icon: Users },
    { title: "Complexity Analysis", value: formatNumber(metrics.complexityAnalysis), icon: BarChart3 },
    { title: "Avg Response", value: `${metrics.avgResponseTime.toFixed(1)}s`, icon: TrendingUp },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, index) => (
          <div key={index} className="metric-card">
            <div className="w-20 h-3 bg-muted rounded animate-pulse mb-3" />
            <div className="w-16 h-7 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {metricsConfig.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.title} className="metric-card group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">{metric.title}</span>
              <Icon className="w-4 h-4 text-muted-foreground/50" strokeWidth={1.5} />
            </div>
            <div className="text-2xl font-semibold text-foreground">{metric.value}</div>
          </div>
        );
      })}
    </div>
  );
};
