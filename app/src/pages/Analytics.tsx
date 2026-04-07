
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Area, AreaChart } from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, Download } from "lucide-react";
import { analyticsService, AnalyticsOverview, CostAnalysis, PerformanceMetrics, ComplexityInsights } from "@/services/analyticsService";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import FetchError from "@/components/FetchError";
import ClassifierAnalytics from "@/components/ClassifierAnalytics";
import { trackPageView } from "@/utils/analytics";

const CHART_GRID_STROKE = "hsl(220, 13%, 91%)";
const CHART_AXIS_STROKE = "hsl(220, 9%, 46%)";
const CHART_AXIS_PROPS = { stroke: CHART_AXIS_STROKE, fontSize: 12, tickLine: false, axisLine: false } as const;
const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid hsl(220, 13%, 91%)',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
  fontSize: '13px',
};
const PRIMARY_GREEN = "hsl(152, 55%, 46%)";

/** Convert an array of objects to a CSV string and trigger a browser download. */
const downloadCSV = (rows: Record<string, unknown>[], filename: string) => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => {
        const v = row[h];
        const cell = v === null || v === undefined ? "" : String(v);
        return cell.includes(",") || cell.includes('"') || cell.includes("\n")
          ? `"${cell.replace(/"/g, '""')}"`
          : cell;
      }).join(",")
    ),
  ];
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const Analytics = () => {
  const [timeRange, setTimeRange] = useState('30d');
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [costAnalysis, setCostAnalysis] = useState<CostAnalysis | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [complexity, setComplexity] = useState<ComplexityInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<{ overview?: string; cost?: string; performance?: string; complexity?: string }>({});
  const { toast } = useToast();

  useEffect(() => { trackPageView("analytics"); }, []);

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    setErrors({});

    const [overviewResult, costResult, performanceResult, complexityResult] = await Promise.allSettled([
      analyticsService.getOverview(timeRange),
      analyticsService.getCostAnalysis(timeRange),
      analyticsService.getPerformanceMetrics(timeRange),
      analyticsService.getComplexityInsights(timeRange)
    ]);

    const newErrors: typeof errors = {};

    if (overviewResult.status === "fulfilled") {
      setOverview(overviewResult.value);
    } else {
      newErrors.overview = "Failed to load overview data";
      logger.error("Overview fetch failed:", overviewResult.reason);
    }

    if (costResult.status === "fulfilled") {
      setCostAnalysis(costResult.value);
    } else {
      newErrors.cost = "Failed to load cost data";
      logger.error("Cost fetch failed:", costResult.reason);
    }

    if (performanceResult.status === "fulfilled") {
      setPerformance(performanceResult.value);
    } else {
      newErrors.performance = "Failed to load performance data";
      logger.error("Performance fetch failed:", performanceResult.reason);
    }

    if (complexityResult.status === "fulfilled") {
      setComplexity(complexityResult.value);
    } else {
      newErrors.complexity = "Failed to load complexity data";
      logger.error("Complexity fetch failed:", complexityResult.reason);
    }

    setErrors(newErrors);

    const failCount = Object.keys(newErrors).length;
    if (failCount === 4) {
      toast({ variant: "destructive", title: "Error", description: "Failed to load analytics data" });
    } else if (failCount > 0) {
      toast({ variant: "destructive", title: "Partial failure", description: `${failCount} section(s) failed to load` });
    }

    setLoading(false);
  };

  const retrySection = async (section: "overview" | "cost" | "performance" | "complexity") => {
    setErrors((prev) => ({ ...prev, [section]: undefined }));
    try {
      switch (section) {
        case "overview": setOverview(await analyticsService.getOverview(timeRange)); break;
        case "cost": setCostAnalysis(await analyticsService.getCostAnalysis(timeRange)); break;
        case "performance": setPerformance(await analyticsService.getPerformanceMetrics(timeRange)); break;
        case "complexity": setComplexity(await analyticsService.getComplexityInsights(timeRange)); break;
      }
    } catch (err) {
      logger.error(`Retry ${section} failed:`, err);
      setErrors((prev) => ({ ...prev, [section]: `Failed to load ${section} data` }));
    }
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatNumber = (num: number) => num.toLocaleString();
  const formatPercentage = (num: number) => `${num.toFixed(1)}%`;

  const handleExportCSV = () => {
    const ts = new Date().toISOString().slice(0, 10);
    switch (activeTab) {
      case "overview":
        if (overview?.dailyUsage?.length) {
          downloadCSV(overview.dailyUsage as Record<string, unknown>[], `analytics-overview-${ts}.csv`);
        }
        break;
      case "costs":
        if (costAnalysis?.costByModel?.length) {
          downloadCSV(costAnalysis.costByModel as Record<string, unknown>[], `analytics-costs-${ts}.csv`);
        }
        break;
      case "performance":
        if (performance?.performanceTrend?.length) {
          downloadCSV(performance.performanceTrend as Record<string, unknown>[], `analytics-performance-${ts}.csv`);
        }
        break;
      case "complexity":
        if (complexity?.complexityTrend?.length) {
          downloadCSV(complexity.complexityTrend as Record<string, unknown>[], `analytics-complexity-${ts}.csv`);
        }
        break;
      default:
        break;
    }
    toast({ title: "Exported", description: `CSV downloaded for ${activeTab} data` });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-description">Deep insights into your LLM usage patterns and performance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="complexity">Complexity</TabsTrigger>
          <TabsTrigger value="classifier">Classifier</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {errors.overview && <FetchError message={errors.overview} onRetry={() => retrySection("overview")} />}
          {overview?.truncated && (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Showing the latest 5,000 events. Results may be incomplete for this time range.
            </div>
          )}
          {!errors.overview && overview && overview.totalRequests === 0 ? (
            <Card className="clean-card">
              <CardContent className="p-8 text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">No Usage Data Available</h3>
                <p className="text-muted-foreground">
                  Start making API requests to see your analytics dashboard populate with insights and metrics.
                </p>
              </CardContent>
            </Card>
          ) : !errors.overview && overview && (
            <>
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Total Requests</p>
                    <p className="text-2xl font-semibold mt-1">{formatNumber(overview.totalRequests)}</p>
                    <div className="flex items-center mt-1">
                      {overview.requestsChange >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
                      )}
                      <span className={`text-sm ${overview.requestsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercentage(Math.abs(overview.requestsChange))}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Success Rate</p>
                    <p className="text-2xl font-semibold mt-1">{formatPercentage(overview.successRate)}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatNumber(overview.successfulRequests)} / {formatNumber(overview.totalRequests)}
                    </p>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="text-2xl font-semibold mt-1">{formatCurrency(overview.totalCost)}</p>
                    <div className="flex items-center mt-1">
                      {overview.costChange >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-red-600 mr-1" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-green-600 mr-1" />
                      )}
                      <span className={`text-sm ${overview.costChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatPercentage(Math.abs(overview.costChange))}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Avg Response Time</p>
                    <p className="text-2xl font-semibold mt-1">{Math.round(overview.avgResponseTime)}ms</p>
                    <p className="text-sm text-muted-foreground mt-1">{formatNumber(overview.totalTokens)} tokens</p>
                  </CardContent>
                </Card>
              </div>

              {/* Usage Trends */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Request Volume Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={overview.dailyUsage}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="date" {...CHART_AXIS_PROPS} />
                        <YAxis {...CHART_AXIS_PROPS} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Area type="monotone" dataKey="requests" stroke={PRIMARY_GREEN} fill={PRIMARY_GREEN} fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Cost Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={overview.dailyUsage}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="date" {...CHART_AXIS_PROPS} />
                        <YAxis {...CHART_AXIS_PROPS} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => [formatCurrency(value as number), 'Cost']} />
                        <Line type="monotone" dataKey="cost" stroke="#f59e0b" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Model and Provider Usage */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Top Models</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {overview.topModels.map((model, index) => (
                        <div key={model.model} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                            <span className="font-medium text-foreground">{model.model}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-foreground">{formatNumber(model.usage)} requests</div>
                            <div className="text-sm text-muted-foreground">{formatCurrency(model.cost)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Provider Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={overview.topProviders}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="usage"
                          nameKey="provider"
                        >
                          {overview.topProviders.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={`hsl(${index * 120}, 70%, 50%)`} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Error Breakdown */}
              {overview.errorBreakdown.length > 0 && (
                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                      Error Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={overview.errorBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="type" {...CHART_AXIS_PROPS} />
                        <YAxis {...CHART_AXIS_PROPS} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Bar dataKey="count" fill="#ef4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Costs Tab */}
        <TabsContent value="costs" className="space-y-6">
          {errors.cost && <FetchError message={errors.cost} onRetry={() => retrySection("cost")} />}
          {!errors.cost && costAnalysis && costAnalysis.totalCost === 0 ? (
            <Card className="clean-card">
              <CardContent className="p-8 text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">No Cost Data Available</h3>
                <p className="text-muted-foreground">
                  Start making API requests to see cost analysis and optimization suggestions.
                </p>
              </CardContent>
            </Card>
          ) : !errors.cost && costAnalysis && (
            <>
              {/* Cost Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="text-2xl font-semibold mt-1">{formatCurrency(costAnalysis.totalCost)}</p>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Projected Monthly</p>
                    <p className="text-2xl font-semibold mt-1">{formatCurrency(costAnalysis.projectedMonthlyCost)}</p>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Efficiency Score</p>
                    <p className="text-2xl font-semibold mt-1">{costAnalysis.costEfficiencyScore}/100</p>
                  </CardContent>
                </Card>
              </div>

              {/* Cost Analysis Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Cost by Model</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={costAnalysis.costByModel}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="model" {...CHART_AXIS_PROPS} />
                        <YAxis {...CHART_AXIS_PROPS} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => [formatCurrency(value as number), 'Cost']} />
                        <Bar dataKey="cost" fill={PRIMARY_GREEN} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Monthly Cost Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={costAnalysis.monthlyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="date" {...CHART_AXIS_PROPS} />
                        <YAxis {...CHART_AXIS_PROPS} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => [formatCurrency(value as number), 'Cost']} />
                        <Line type="monotone" dataKey="cost" stroke="#f59e0b" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Optimization Suggestions */}
              {costAnalysis.optimizationSuggestions.length > 0 && (
                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Cost Optimization Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {costAnalysis.optimizationSuggestions.map((suggestion) => (
                        <div key={suggestion.id} className="border border-border rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-semibold text-foreground">{suggestion.title}</h4>
                                <Badge variant={suggestion.priority === 'high' ? 'destructive' : 'outline'} className="text-xs font-normal">
                                  {suggestion.priority}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground text-sm">{suggestion.description}</p>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-green-600">
                                {formatCurrency(suggestion.potentialSavings)}/mo
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {formatPercentage(suggestion.confidenceScore * 100)} confidence
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          {errors.performance && <FetchError message={errors.performance} onRetry={() => retrySection("performance")} />}
          {!errors.performance && performance && performance.throughput === 0 ? (
            <Card className="clean-card">
              <CardContent className="p-8 text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">No Performance Data Available</h3>
                <p className="text-muted-foreground">
                  Start making API requests to see performance metrics and latency analysis.
                </p>
              </CardContent>
            </Card>
          ) : !errors.performance && performance && (
            <>
              {/* Performance Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Avg Response Time</p>
                    <p className="text-2xl font-semibold mt-1">{Math.round(performance.avgResponseTime)}ms</p>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">P95 Latency</p>
                    <p className="text-2xl font-semibold mt-1">{performance.p95ResponseTime}ms</p>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Uptime</p>
                    <p className="text-2xl font-semibold mt-1">{formatPercentage(performance.uptime)}</p>
                  </CardContent>
                </Card>

                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Error Rate</p>
                    <p className="text-2xl font-semibold mt-1">{formatPercentage(performance.errorRate)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Trends */}
              <Card className="clean-card">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Performance Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={performance.performanceTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                      <XAxis dataKey="date" {...CHART_AXIS_PROPS} />
                      <YAxis {...CHART_AXIS_PROPS} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="avgLatency" stroke="#8b5cf6" name="Avg Latency" />
                      <Line type="monotone" dataKey="p95Latency" stroke="#f59e0b" name="P95 Latency" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Complexity Tab */}
        <TabsContent value="complexity" className="space-y-6">
          {errors.complexity && <FetchError message={errors.complexity} onRetry={() => retrySection("complexity")} />}
          {!errors.complexity && (!complexity || complexity.complexityDistribution.length === 0) ? (
            <Card className="clean-card">
              <CardContent className="p-8 text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">No Complexity Data Yet</h3>
                <p className="text-muted-foreground">
                  Complexity insights appear once your API requests include routing metadata with complexity scores.
                </p>
              </CardContent>
            </Card>
          ) : !errors.complexity && complexity ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Avg Complexity</p>
                    <p className="text-2xl font-semibold mt-1">{(complexity.avgComplexityScore * 100).toFixed(0)}%</p>
                  </CardContent>
                </Card>
                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Clusters Analyzed</p>
                    <p className="text-2xl font-semibold mt-1">{complexity.taskCategories.length}</p>
                  </CardContent>
                </Card>
                <Card className="clean-card">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Optimization Ops</p>
                    <p className="text-2xl font-semibold mt-1">{complexity.optimizationOpportunities.length}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Complexity Distribution */}
                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Complexity Score Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={complexity.complexityDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="range" {...CHART_AXIS_PROPS} />
                        <YAxis {...CHART_AXIS_PROPS} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Bar dataKey="count" fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Complexity Trend */}
                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Complexity Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={complexity.complexityTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                        <XAxis dataKey="date" {...CHART_AXIS_PROPS} />
                        <YAxis {...CHART_AXIS_PROPS} domain={[0, 1]} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => [(value as number).toFixed(3), 'Avg Complexity']} />
                        <Line type="monotone" dataKey="avgComplexity" stroke="#8b5cf6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Cluster Distribution */}
                {complexity.taskCategories.length > 0 && (
                  <Card className="clean-card">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Cluster Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={complexity.taskCategories}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="count"
                            nameKey="category"
                            label={({ category, count }) => `${category}: ${count}`}
                          >
                            {complexity.taskCategories.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={`hsl(${index * 60 + 200}, 70%, 55%)`} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Model Performance by Complexity */}
                {complexity.modelPerformanceByComplexity.length > 0 && (
                  <Card className="clean-card">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Model Usage by Complexity Tier</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {complexity.modelPerformanceByComplexity.map((m) => (
                          <div key={m.model} className="flex items-center justify-between p-3 border border-border rounded-lg">
                            <div>
                              <p className="font-medium text-sm text-foreground">{m.model}</p>
                              <p className="text-xs text-muted-foreground">
                                Avg cost: ${m.costEfficiency.toFixed(4)}/req
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs font-normal">
                                Simple: {(m.simpleTasksScore * 100).toFixed(0)}%
                              </Badge>
                              <Badge variant="outline" className="text-xs font-normal">
                                Complex: {(m.complexTasksScore * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Optimization Opportunities */}
              {complexity.optimizationOpportunities.length > 0 && (
                <Card className="clean-card">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Optimization Opportunities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {complexity.optimizationOpportunities.map((opp, i) => (
                        <div key={i} className="flex items-start gap-3 p-4 border border-border rounded-lg">
                          <AlertTriangle className={`w-5 h-5 mt-0.5 ${opp.impact === 'high' ? 'text-red-500' : 'text-amber-500'}`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm text-foreground">{opp.opportunity}</p>
                              <Badge variant={opp.impact === 'high' ? 'destructive' : 'outline'} className="text-xs font-normal">{opp.impact}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{opp.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </TabsContent>

        {/* Classifier Tab */}
        <TabsContent value="classifier" className="space-y-6">
          <ClassifierAnalytics timeRange={timeRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analytics;
