import { supabase } from "@/integrations/supabase/client";

/** Maximum rows fetched per analytics query to prevent browser crashes at scale. */
const ANALYTICS_ROW_LIMIT = 5000;

export interface AnalyticsOverview {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  totalCost: number;
  totalTokens: number;
  avgResponseTime: number;
  requestsChange: number;
  costChange: number;
  topModels: Array<{ model: string; usage: number; cost: number }>;
  topProviders: Array<{ provider: string; usage: number; percentage: number }>;
  dailyUsage: Array<{ date: string; requests: number; cost: number; tokens: number }>;
  errorBreakdown: Array<{ type: string; count: number; percentage: number }>;
  /** True when the query hit the row limit — results may be incomplete. */
  truncated?: boolean;
}

export interface CostAnalysis {
  totalCost: number;
  monthlyTrend: Array<{ date: string; cost: number }>;
  costByModel: Array<{ model: string; cost: number; requests: number; avgCost: number }>;
  costByProvider: Array<{ provider: string; cost: number; percentage: number }>;
  optimizationSuggestions: Array<{
    id: string;
    type: string;
    priority: string;
    title: string;
    description: string;
    potentialSavings: number;
    confidenceScore: number;
  }>;
  costEfficiencyScore: number;
  projectedMonthlyCost: number;
}

export interface PerformanceMetrics {
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  responseTimeChange: number;
  uptime: number;
  throughput: number;
  latencyByModel: Array<{ model: string; avgLatency: number; p95Latency: number }>;
  latencyByProvider: Array<{ provider: string; avgLatency: number; reliability: number }>;
  performanceTrend: Array<{ date: string; avgLatency: number; p95Latency: number }>;
  errorRate: number;
  slowRequestsCount: number;
}

export interface ComplexityInsights {
  avgComplexityScore: number;
  complexityDistribution: Array<{ range: string; count: number; percentage: number }>;
  taskCategories: Array<{ category: string; count: number; avgComplexity: number; avgCost: number }>;
  complexityTrend: Array<{ date: string; avgComplexity: number }>;
  modelPerformanceByComplexity: Array<{
    model: string;
    simpleTasksScore: number;
    complexTasksScore: number;
    costEfficiency: number;
  }>;
  optimizationOpportunities: Array<{
    opportunity: string;
    impact: string;
    description: string;
  }>;
}

class AnalyticsService {
  // Overview analytics - comprehensive dashboard
  async getOverview(timeRange: string = '30d'): Promise<AnalyticsOverview> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const days = this.parseDaysFromRange(timeRange);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch only the columns needed for overview calculations (not full prompt/response text).
    // Capped at ANALYTICS_ROW_LIMIT to prevent browser crashes with large datasets.
    const { data: events, error: eventsError } = await supabase
      .from('usage_events')
      .select('created_at, model_name, provider, cost, tokens_in, tokens_out, latency_ms, error')
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })
      .limit(ANALYTICS_ROW_LIMIT);

    if (eventsError) throw eventsError;

    if (!events || events.length === 0) {
      return this.getEmptyOverview();
    }

    const truncated = events.length >= ANALYTICS_ROW_LIMIT;

    // Calculate totals
    const totalRequests = events.length;
    const successfulRequests = events.filter(e => !e.error).length;
    const failedRequests = events.filter(e => !!e.error).length;
    const totalCost = events.reduce((sum, e) => sum + (parseFloat(e.cost?.toString() || '0')), 0);
    const totalTokens = events.reduce((sum, e) => sum + (e.tokens_in || 0) + (e.tokens_out || 0), 0);

    // Calculate averages
    const avgResponseTime = events.reduce((sum, e) => sum + (e.latency_ms || 0), 0) / events.length;

    // Get model usage
    const modelUsage = new Map<string, { usage: number; cost: number }>();
    events.forEach(event => {
      if (event.model_name) {
        const current = modelUsage.get(event.model_name) || { usage: 0, cost: 0 };
        modelUsage.set(event.model_name, {
          usage: current.usage + 1,
          cost: current.cost + (parseFloat(event.cost?.toString() || '0'))
        });
      }
    });

    // Get provider usage
    const providerUsage = new Map<string, number>();
    events.forEach(event => {
      if (event.provider) {
        providerUsage.set(event.provider, (providerUsage.get(event.provider) || 0) + 1);
      }
    });

    // Calculate daily usage
    const dailyUsageMap = new Map<string, { requests: number; cost: number; tokens: number }>();
    events.forEach(event => {
      const date = event.created_at.split('T')[0];
      const current = dailyUsageMap.get(date) || { requests: 0, cost: 0, tokens: 0 };
      dailyUsageMap.set(date, {
        requests: current.requests + 1,
        cost: current.cost + (parseFloat(event.cost?.toString() || '0')),
        tokens: current.tokens + (event.tokens_in || 0) + (event.tokens_out || 0)
      });
    });

    // Calculate changes (compare first half vs second half)
    const midPoint = Math.floor(events.length / 2);
    const firstHalf = events.slice(0, midPoint);
    const secondHalf = events.slice(midPoint);

    const requestsChange = firstHalf.length > 0 ? ((secondHalf.length - firstHalf.length) / firstHalf.length) * 100 : 0;
    
    const firstHalfCost = firstHalf.reduce((sum, e) => sum + (parseFloat(e.cost?.toString() || '0')), 0);
    const secondHalfCost = secondHalf.reduce((sum, e) => sum + (parseFloat(e.cost?.toString() || '0')), 0);
    const costChange = firstHalfCost > 0 ? ((secondHalfCost - firstHalfCost) / firstHalfCost) * 100 : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      totalCost,
      totalTokens,
      avgResponseTime,
      requestsChange,
      costChange,
      topModels: Array.from(modelUsage.entries())
        .map(([model, data]) => ({ model, usage: data.usage, cost: data.cost }))
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 5),
      topProviders: Array.from(providerUsage.entries())
        .map(([provider, usage]) => ({ 
          provider, 
          usage, 
          percentage: totalRequests > 0 ? (usage / totalRequests) * 100 : 0 
        }))
        .sort((a, b) => b.usage - a.usage),
      dailyUsage: Array.from(dailyUsageMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      errorBreakdown: this.calculateErrorBreakdown(events),
      truncated,
    };
  }

  // Cost analysis with optimization suggestions
  async getCostAnalysis(timeRange: string = '30d'): Promise<CostAnalysis> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const days = this.parseDaysFromRange(timeRange);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: events, error: eventsError } = await supabase
      .from('usage_events')
      .select('created_at, model_name, provider, cost, error')
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })
      .limit(ANALYTICS_ROW_LIMIT);

    if (eventsError) throw eventsError;

    if (!events || events.length === 0) {
      return this.getEmptyCostAnalysis();
    }

    const totalCost = events.reduce((sum, e) => sum + (parseFloat(e.cost?.toString() || '0')), 0);
    const avgDailyCost = totalCost / days;
    const projectedMonthlyCost = avgDailyCost * 30;

    // Calculate cost by model
    const modelCosts = new Map<string, { cost: number; requests: number }>();
    events.forEach(event => {
      if (event.model_name) {
        const current = modelCosts.get(event.model_name) || { cost: 0, requests: 0 };
        modelCosts.set(event.model_name, {
          cost: current.cost + (parseFloat(event.cost?.toString() || '0')),
          requests: current.requests + 1
        });
      }
    });

    // Calculate cost by provider
    const providerCosts = new Map<string, number>();
    events.forEach(event => {
      if (event.provider) {
        providerCosts.set(event.provider, (providerCosts.get(event.provider) || 0) + (parseFloat(event.cost?.toString() || '0')));
      }
    });

    // Generate monthly trend
    const monthlyTrendMap = new Map<string, number>();
    events.forEach(event => {
      const date = event.created_at.split('T')[0];
      monthlyTrendMap.set(date, (monthlyTrendMap.get(date) || 0) + (parseFloat(event.cost?.toString() || '0')));
    });

    return {
      totalCost,
      monthlyTrend: Array.from(monthlyTrendMap.entries())
        .map(([date, cost]) => ({ date, cost }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      costByModel: Array.from(modelCosts.entries())
        .map(([model, data]) => ({
          model,
          cost: data.cost,
          requests: data.requests,
          avgCost: data.requests > 0 ? data.cost / data.requests : 0
        }))
        .sort((a, b) => b.cost - a.cost),
      costByProvider: Array.from(providerCosts.entries())
        .map(([provider, cost]) => ({
          provider,
          cost,
          percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0
        }))
        .sort((a, b) => b.cost - a.cost),
      optimizationSuggestions: this.generateOptimizationSuggestions(events),
      costEfficiencyScore: this.calculateCostEfficiencyScore(events),
      projectedMonthlyCost
    };
  }

  // Performance metrics and latency analysis
  async getPerformanceMetrics(timeRange: string = '30d'): Promise<PerformanceMetrics> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const days = this.parseDaysFromRange(timeRange);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: events, error } = await supabase
      .from('usage_events')
      .select('created_at, model_name, provider, latency_ms, error')
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })
      .limit(ANALYTICS_ROW_LIMIT);

    if (error) throw error;

    if (!events || events.length === 0) {
      return this.getEmptyPerformanceMetrics();
    }

    const latencies = events.map(e => e.latency_ms || 0).filter(l => l > 0).sort((a, b) => a - b);
    const avgResponseTime = latencies.reduce((sum, l) => sum + l, 0) / latencies.length || 0;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);
    const p95ResponseTime = latencies[p95Index] || 0;
    const p99ResponseTime = latencies[p99Index] || 0;

    const totalRequests = events.length;
    const successfulRequests = events.filter(e => !e.error).length;

    // Calculate performance trend
    const performanceTrendMap = new Map<string, { latencies: number[]; count: number }>();
    events.forEach(event => {
      const date = event.created_at.split('T')[0];
      const current = performanceTrendMap.get(date) || { latencies: [], count: 0 };
      if (event.latency_ms) {
        current.latencies.push(event.latency_ms);
      }
      current.count++;
      performanceTrendMap.set(date, current);
    });

    const performanceTrend = Array.from(performanceTrendMap.entries())
      .map(([date, data]) => {
        const sortedLatencies = data.latencies.sort((a, b) => a - b);
        const avgLatency = sortedLatencies.reduce((sum, l) => sum + l, 0) / sortedLatencies.length || 0;
        const p95Index = Math.floor(sortedLatencies.length * 0.95);
        const p95Latency = sortedLatencies[p95Index] || 0;
        return { date, avgLatency, p95Latency };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      avgResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      responseTimeChange: this.calculateResponseTimeChange(events),
      uptime: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 100,
      throughput: totalRequests / days,
      latencyByModel: this.calculateLatencyByModel(events),
      latencyByProvider: this.calculateLatencyByProvider(events),
      performanceTrend,
      errorRate: totalRequests > 0 ? ((totalRequests - successfulRequests) / totalRequests) * 100 : 0,
      slowRequestsCount: events.filter(e => (e.latency_ms || 0) > 2000).length
    };
  }

  // Task complexity insights — reads metadata from usage_events
  async getComplexityInsights(timeRange: string = '30d'): Promise<ComplexityInsights> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const days = this.parseDaysFromRange(timeRange);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: events, error } = await supabase
      .from('usage_events')
      .select('created_at, model_name, cost, metadata')
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })
      .limit(ANALYTICS_ROW_LIMIT);

    if (error) throw error;
    if (!events || events.length === 0) return this.getEmptyComplexityInsights();

    // Extract complexity scores from metadata
    const withComplexity = events.filter(e => {
      const meta = e.metadata;
      return meta?.complexity_analysis?.complexity_score != null;
    });

    if (withComplexity.length === 0) return this.getEmptyComplexityInsights();

    const scores = withComplexity.map(e => e.metadata.complexity_analysis.complexity_score as number);
    const avgComplexityScore = scores.reduce((s, v) => s + v, 0) / scores.length;

    // Distribution: 0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0
    const ranges = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'];
    const buckets = [0, 0, 0, 0, 0];
    scores.forEach(s => {
      const idx = Math.min(Math.floor(s * 5), 4);
      buckets[idx]++;
    });
    const complexityDistribution = ranges.map((range, i) => ({
      range,
      count: buckets[i],
      percentage: withComplexity.length > 0 ? (buckets[i] / withComplexity.length) * 100 : 0,
    }));

    // Task categories from cluster_id
    const categoryMap = new Map<string, { count: number; totalComplexity: number; totalCost: number }>();
    withComplexity.forEach(e => {
      const cat = e.metadata?.cluster_id || 'uncategorized';
      const cur = categoryMap.get(cat) || { count: 0, totalComplexity: 0, totalCost: 0 };
      cur.count++;
      cur.totalComplexity += e.metadata.complexity_analysis.complexity_score;
      cur.totalCost += parseFloat(e.cost?.toString() || '0');
      categoryMap.set(cat, cur);
    });
    const taskCategories = Array.from(categoryMap.entries()).map(([category, d]) => ({
      category,
      count: d.count,
      avgComplexity: d.totalComplexity / d.count,
      avgCost: d.totalCost / d.count,
    })).sort((a, b) => b.count - a.count).slice(0, 10);

    // Complexity trend by date
    const trendMap = new Map<string, { total: number; count: number }>();
    withComplexity.forEach(e => {
      const date = e.created_at.split('T')[0];
      const cur = trendMap.get(date) || { total: 0, count: 0 };
      cur.total += e.metadata.complexity_analysis.complexity_score;
      cur.count++;
      trendMap.set(date, cur);
    });
    const complexityTrend = Array.from(trendMap.entries())
      .map(([date, d]) => ({ date, avgComplexity: d.total / d.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Model performance by complexity tier
    const modelTiers = new Map<string, { simple: number[]; complex: number[]; cost: number }>();
    withComplexity.forEach(e => {
      const model = e.model_name || 'unknown';
      const cur = modelTiers.get(model) || { simple: [], complex: [], cost: 0 };
      const score = e.metadata.complexity_analysis.complexity_score;
      if (score < 0.5) {
        cur.simple.push(score);
      } else {
        cur.complex.push(score);
      }
      cur.cost += parseFloat(e.cost?.toString() || '0');
      modelTiers.set(model, cur);
    });
    const modelPerformanceByComplexity = Array.from(modelTiers.entries())
      .filter(([, d]) => d.simple.length + d.complex.length >= 3)
      .map(([model, d]) => ({
        model,
        simpleTasksScore: d.simple.length > 0 ? d.simple.reduce((s, v) => s + v, 0) / d.simple.length : 0,
        complexTasksScore: d.complex.length > 0 ? d.complex.reduce((s, v) => s + v, 0) / d.complex.length : 0,
        costEfficiency: (d.simple.length + d.complex.length) > 0 ? d.cost / (d.simple.length + d.complex.length) : 0,
      }));

    // Optimization opportunities
    const optimizationOpportunities: Array<{ opportunity: string; impact: string; description: string }> = [];
    const simpleWithExpensive = withComplexity.filter(e => {
      const score = e.metadata.complexity_analysis.complexity_score;
      const cost = parseFloat(e.cost?.toString() || '0');
      return score < 0.3 && cost > 0.01;
    });
    if (simpleWithExpensive.length > 5) {
      optimizationOpportunities.push({
        opportunity: "Route simple tasks to cheaper models",
        impact: "high",
        description: `${simpleWithExpensive.length} simple tasks were routed to expensive models. Using Smart Export or lower-tier models could save costs.`,
      });
    }
    const expertCandidates = Array.from(categoryMap.entries()).filter(([, d]) => d.count >= 50);
    if (expertCandidates.length > 0) {
      optimizationOpportunities.push({
        opportunity: "Fine-tune expert models for top clusters",
        impact: "medium",
        description: `${expertCandidates.length} clusters have 50+ samples — ideal candidates for Smart Export fine-tuning.`,
      });
    }

    return {
      avgComplexityScore,
      complexityDistribution,
      taskCategories,
      complexityTrend,
      modelPerformanceByComplexity,
      optimizationOpportunities,
    };
  }

  // Helper methods
  private parseDaysFromRange(timeRange: string): number {
    const match = timeRange.match(/(\d+)([dwmy])/);
    if (!match) return 30;
    
    const [, num, unit] = match;
    const value = parseInt(num);
    
    switch (unit) {
      case 'd': return value;
      case 'w': return value * 7;
      case 'm': return value * 30;
      case 'y': return value * 365;
      default: return 30;
    }
  }

  private getEmptyOverview(): AnalyticsOverview {
    return {
      totalRequests: 0, successfulRequests: 0, failedRequests: 0, successRate: 0,
      totalCost: 0, totalTokens: 0, avgResponseTime: 0, requestsChange: 0, costChange: 0,
      topModels: [], topProviders: [], dailyUsage: [], errorBreakdown: []
    };
  }

  private getEmptyCostAnalysis(): CostAnalysis {
    return {
      totalCost: 0, monthlyTrend: [], costByModel: [], costByProvider: [],
      optimizationSuggestions: [], costEfficiencyScore: 0, projectedMonthlyCost: 0
    };
  }

  private getEmptyPerformanceMetrics(): PerformanceMetrics {
    return {
      avgResponseTime: 0, p95ResponseTime: 0, p99ResponseTime: 0, responseTimeChange: 0,
      uptime: 100, throughput: 0, latencyByModel: [], latencyByProvider: [],
      performanceTrend: [], errorRate: 0, slowRequestsCount: 0
    };
  }

  private getEmptyComplexityInsights(): ComplexityInsights {
    return {
      avgComplexityScore: 0, complexityDistribution: [], taskCategories: [],
      complexityTrend: [], modelPerformanceByComplexity: [], optimizationOpportunities: []
    };
  }

  private calculateErrorBreakdown(events: any[]): Array<{ type: string; count: number; percentage: number }> {
    const errorMap = new Map<string, number>();
    let totalErrors = 0;

    events.forEach(event => {
      if (event.error) {
        const errorType = event.error.includes('rate') ? 'Rate Limit' :
                         event.error.includes('timeout') ? 'Timeout' :
                         event.error.includes('auth') ? 'Authentication' : 'Other';
        errorMap.set(errorType, (errorMap.get(errorType) || 0) + 1);
        totalErrors++;
      }
    });

    return Array.from(errorMap.entries()).map(([type, count]) => ({
      type,
      count,
      percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0
    }));
  }

  private generateOptimizationSuggestions(events: any[]): Array<{
    id: string; type: string; priority: string; title: string; description: string; potentialSavings: number; confidenceScore: number;
  }> {
    const suggestions = [];
    
    // Analyze model usage for potential savings
    const modelCosts = new Map<string, { cost: number; count: number }>();
    events.forEach(event => {
      if (event.model_name) {
        const current = modelCosts.get(event.model_name) || { cost: 0, count: 0 };
        modelCosts.set(event.model_name, {
          cost: current.cost + (parseFloat(event.cost?.toString() || '0')),
          count: current.count + 1
        });
      }
    });

    // Check if expensive models are being overused
    const expensiveModels = Array.from(modelCosts.entries())
      .filter(([model, data]) => data.cost / data.count > 0.01 && data.count > 10);

    if (expensiveModels.length > 0) {
      suggestions.push({
        id: 'model-optimization-1',
        type: 'model_alternative',
        priority: 'high',
        title: 'Switch to More Cost-Effective Models',
        description: `Consider using cheaper alternatives for simple tasks. You could save up to 30% on costs.`,
        potentialSavings: modelCosts.get(expensiveModels[0][0])?.cost * 0.3 || 0,
        confidenceScore: 0.8
      });
    }

    return suggestions;
  }

  private calculateCostEfficiencyScore(events: any[]): number {
    // Simple efficiency calculation based on cost per successful request
    const successfulEvents = events.filter(e => !e.error);
    if (successfulEvents.length === 0) return 0;
    
    const avgCostPerSuccess = successfulEvents.reduce((sum, e) => sum + (parseFloat(e.cost?.toString() || '0')), 0) / successfulEvents.length;
    
    // Score out of 100 (lower cost = higher score)
    return Math.max(0, Math.min(100, 100 - (avgCostPerSuccess * 1000)));
  }

  private calculateResponseTimeChange(events: any[]): number {
    if (events.length < 2) return 0;
    const midPoint = Math.floor(events.length / 2);
    const firstHalf = events.slice(0, midPoint).filter(e => e.latency_ms);
    const secondHalf = events.slice(midPoint).filter(e => e.latency_ms);
    
    if (firstHalf.length === 0 || secondHalf.length === 0) return 0;
    
    const firstAvg = firstHalf.reduce((sum, e) => sum + e.latency_ms, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, e) => sum + e.latency_ms, 0) / secondHalf.length;
    
    return firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
  }

  private calculateLatencyByModel(events: any[]): Array<{ model: string; avgLatency: number; p95Latency: number }> {
    const modelLatencies = new Map<string, number[]>();
    
    events.forEach(event => {
      if (event.model_name && event.latency_ms) {
        if (!modelLatencies.has(event.model_name)) {
          modelLatencies.set(event.model_name, []);
        }
        modelLatencies.get(event.model_name)!.push(event.latency_ms);
      }
    });
    
    return Array.from(modelLatencies.entries()).map(([model, latencies]) => {
      const sortedLatencies = latencies.sort((a, b) => a - b);
      const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
      const p95Index = Math.floor(latencies.length * 0.95);
      const p95Latency = sortedLatencies[p95Index] || 0;
      
      return { model, avgLatency, p95Latency };
    });
  }

  private calculateLatencyByProvider(events: any[]): Array<{ provider: string; avgLatency: number; reliability: number }> {
    const providerStats = new Map<string, { latencies: number[]; total: number; successful: number }>();
    
    events.forEach(event => {
      if (event.provider) {
        const current = providerStats.get(event.provider) || { latencies: [], total: 0, successful: 0 };
        if (event.latency_ms) {
          current.latencies.push(event.latency_ms);
        }
        current.total++;
        if (!event.error) {
          current.successful++;
        }
        providerStats.set(event.provider, current);
      }
    });
    
    return Array.from(providerStats.entries()).map(([provider, stats]) => ({
      provider,
      avgLatency: stats.latencies.length > 0 ? stats.latencies.reduce((sum, l) => sum + l, 0) / stats.latencies.length : 0,
      reliability: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0
    }));
  }
}

export const analyticsService = new AnalyticsService();