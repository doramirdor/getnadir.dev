
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Filter, Download, Activity, Clock, DollarSign, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { trackPageView } from "@/utils/analytics";
import { SummaryCard } from "@/components/admin/SummaryCard";

interface LogEntry {
  id: string;
  created_at: string;
  model_name: string;
  provider: string;
  request_id: string;
  tokens_in: number;
  tokens_out: number;
  cost: number;
  route: string;
  prompt: string;
  response: string;
  latency_ms: number | null;
  cluster_id: string | null;
  metadata: any;
  error: string | null;
}


const Logs = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);

  useEffect(() => { trackPageView("logs"); }, []);

  useEffect(() => {
    if (user?.id) {
      fetchLogs();
    }
  }, [user]);

  const fetchLogs = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data: logs, error } = await supabase
        .from('usage_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        logger.error('Error fetching logs:', error);
        throw error;
      }

      setLogEntries(logs || []);

      // Extract unique providers for filter dropdown
      const providers = [...new Set((logs || []).map(log => log.provider).filter(Boolean))];
      setAvailableProviders(providers);

      logger.log('Logs loaded successfully:', logs?.length || 0);
    } catch (error: any) {
      logger.error('Error fetching logs:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load system logs. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Status pill — tokenised so it flips themes correctly.
  const getStatusBadge = (error: string | null) => {
    return error
      ? <span className="chip chip-err">Error</span>
      : <span className="chip chip-ok">Success</span>;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatResponseTime = (responseTimeMs: number | null) => {
    if (!responseTimeMs) return 'N/A';
    if (responseTimeMs < 1000) return `${responseTimeMs}ms`;
    return `${(responseTimeMs / 1000).toFixed(1)}s`;
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(6)}`;
  };

  // Route chip palette: direct=blue, cluster=green, fallback=warn/yellow,
  // load_balance=violet, unknown=neutral — lifted from AdminPrimitives.jsx.
  const getRouteChipClass = (route: string) => {
    switch (route?.toLowerCase()) {
      case 'direct':       return 'chip chip-direct';
      case 'cluster':      return 'chip chip-cluster';
      case 'fallback':     return 'chip chip-fallback';
      case 'load_balance': return 'chip chip-load-balance';
      default:             return 'chip chip-neutral';
    }
  };

  const filteredLogs = logEntries.filter(log => {
    const matchesSearch = searchQuery === '' ||
      log.model_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.provider?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.request_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.route?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesProvider = providerFilter === 'all' || log.provider === providerFilter;

    // For level filter, we'll use error status as a proxy
    let matchesLevel = true;
    if (levelFilter !== 'all') {
      if (levelFilter === 'INFO') {
        matchesLevel = !log.error;
      } else if (levelFilter === 'WARN' || levelFilter === 'ERROR') {
        matchesLevel = !!log.error;
      }
    }

    return matchesSearch && matchesProvider && matchesLevel;
  });

  const totalEvents = logEntries.length;
  const successRate =
    totalEvents > 0
      ? ((logEntries.filter(l => !l.error).length / totalEvents) * 100).toFixed(1)
      : "0";
  const avgLatency =
    totalEvents > 0
      ? Math.round(logEntries.reduce((s, l) => s + (l.latency_ms || 0), 0) / totalEvents)
      : 0;
  const totalCost = logEntries.reduce((s, l) => s + (l.cost || 0), 0);

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="page-title">System Logs</h1>
        <p className="page-description">Monitor API requests, responses, and system events</p>
      </div>

      {/* Summary Cards — tinted-icon stat tiles, per design kit LogsScreen.jsx */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Events"      value={totalEvents.toLocaleString()} icon={Activity}    tint="blue"   />
        <SummaryCard label="Success Rate"      value={`${successRate}%`}            icon={TrendingUp}  tint="ok"     />
        <SummaryCard label="Avg Response Time" value={`${avgLatency}ms`}            icon={Clock}       tint="violet" />
        <SummaryCard label="Total Cost"        value={`$${totalCost.toFixed(4)}`}   icon={DollarSign}  tint="ok"     />
      </div>

      {/* Filters */}
      <Card className="clean-card">
        <CardHeader>
          <CardTitle className="text-foreground">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Log Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="INFO">INFO</SelectItem>
                <SelectItem value="WARN">WARN</SelectItem>
                <SelectItem value="ERROR">ERROR</SelectItem>
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Providers</SelectItem>
                {availableProviders.map(provider => (
                  <SelectItem key={provider} value={provider}>{provider}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              More Filters
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="clean-card">
        <CardHeader>
          <CardTitle className="text-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-1 w-16 bg-muted rounded-full overflow-hidden"><div className="h-full w-1/2 bg-primary/40 rounded-full animate-pulse" /></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {['Timestamp','Route','Provider','Model','Request ID','Status','Latency','Tokens','Cost'].map(h => (
                    <TableHead
                      key={h}
                      className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground"
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {logEntries.length === 0 ? 'No usage events found. Make some API requests to see activity here.' : 'No events match your current filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="mono text-xs text-muted-foreground">{formatTimestamp(log.created_at)}</TableCell>
                      <TableCell>
                        <span className={getRouteChipClass(log.route)}>{log.route || 'direct'}</span>
                        {log.cluster_id && (
                          <div className="text-[10px] text-muted-foreground/70 mt-1">
                            Cluster: <span className="mono">{log.cluster_id}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{log.provider || 'N/A'}</TableCell>
                      <TableCell className="mono text-xs">{log.model_name || 'N/A'}</TableCell>
                      <TableCell className="mono text-xs text-muted-foreground">{log.request_id?.slice(0, 8) || 'N/A'}...</TableCell>
                      <TableCell>{getStatusBadge(log.error)}</TableCell>
                      <TableCell className="mono text-xs">{formatResponseTime(log.latency_ms)}</TableCell>
                      <TableCell className="text-sm">
                        <div className="mono">{(log.tokens_in || 0) + (log.tokens_out || 0)}</div>
                        <div className="text-[11px] text-muted-foreground mono">
                          {log.tokens_in || 0}&#8599; {log.tokens_out || 0}&#8600;
                        </div>
                      </TableCell>
                      <TableCell className="mono text-xs font-semibold">{formatCost(log.cost || 0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Logs;
