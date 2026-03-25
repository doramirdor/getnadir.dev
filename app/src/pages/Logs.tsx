
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Filter, Download, Activity, Clock, DollarSign, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

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

  const getStatusBadge = (error: string | null) => {
    if (!error) {
      return <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Success</Badge>;
    } else {
      return <Badge variant="destructive">Error</Badge>;
    }
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

  const getRouteColor = (route: string) => {
    switch (route?.toLowerCase()) {
      case 'direct': return 'text-blue-600 border-blue-200 bg-blue-50';
      case 'cluster': return 'text-green-600 border-green-200 bg-green-50';
      case 'fallback': return 'text-yellow-600 border-yellow-200 bg-yellow-50';
      case 'load_balance': return 'text-purple-600 border-purple-200 bg-purple-50';
      default: return 'text-muted-foreground border-border bg-muted';
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">System Logs</h1>
        <p className="page-description">Monitor API requests, responses, and system events</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="clean-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Events</p>
                <p className="text-2xl font-bold">{logEntries.length.toLocaleString()}</p>
              </div>
              <Activity className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">
                  {logEntries.length > 0
                    ? ((logEntries.filter(log => !log.error).length / logEntries.length) * 100).toFixed(1)
                    : '0'
                  }%
                </p>
              </div>
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-green-600 rounded-full"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Response Time</p>
                <p className="text-2xl font-bold">
                  {logEntries.length > 0
                    ? Math.round(logEntries.reduce((sum, log) => sum + (log.latency_ms || 0), 0) / logEntries.length)
                    : 0
                  }ms
                </p>
              </div>
              <Clock className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="clean-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cost</p>
                <p className="text-2xl font-bold">
                  ${logEntries.reduce((sum, log) => sum + (log.cost || 0), 0).toFixed(4)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
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
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Request ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Cost</TableHead>
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
                      <TableCell className="font-mono text-sm">{formatTimestamp(log.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getRouteColor(log.route)}>
                          {log.route || 'direct'}
                        </Badge>
                        {log.cluster_id && (
                          <div className="text-xs text-muted-foreground mt-1">Cluster: {log.cluster_id}</div>
                        )}
                      </TableCell>
                      <TableCell>{log.provider || 'N/A'}</TableCell>
                      <TableCell className="font-mono">{log.model_name || 'N/A'}</TableCell>
                      <TableCell className="font-mono text-sm">{log.request_id?.slice(0, 8) || 'N/A'}...</TableCell>
                      <TableCell>{getStatusBadge(log.error)}</TableCell>
                      <TableCell>{formatResponseTime(log.latency_ms)}</TableCell>
                      <TableCell className="text-sm">
                        <div>{(log.tokens_in || 0) + (log.tokens_out || 0)} total</div>
                        <div className="text-muted-foreground">{log.tokens_in || 0}&#8599; {log.tokens_out || 0}&#8600;</div>
                      </TableCell>
                      <TableCell className="font-semibold">{formatCost(log.cost || 0)}</TableCell>
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
