import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { Brain, Clock, Target, Zap, CheckCircle, XCircle } from "lucide-react";
import {
  classifierAnalyticsService,
  ClassifierStats,
  DailyDistribution,
  ConfidenceBucket,
  MisclassificationEntry,
  LatencyPoint,
} from "@/services/classifierAnalyticsService";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

interface ClassifierAnalyticsProps {
  timeRange: string;
}

const ClassifierAnalytics = ({ timeRange }: ClassifierAnalyticsProps) => {
  const [stats, setStats] = useState<ClassifierStats | null>(null);
  const [distribution, setDistribution] = useState<DailyDistribution[]>([]);
  const [histogram, setHistogram] = useState<ConfidenceBucket[]>([]);
  const [misclassifications, setMisclassifications] = useState<MisclassificationEntry[]>([]);
  const [latencyTrend, setLatencyTrend] = useState<LatencyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Feedback dialog state
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackEntry, setFeedbackEntry] = useState<MisclassificationEntry | null>(null);
  const [feedbackTier, setFeedbackTier] = useState<string>("complex");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, d, h, m, l] = await Promise.allSettled([
        classifierAnalyticsService.getStats(timeRange),
        classifierAnalyticsService.getDistribution(timeRange),
        classifierAnalyticsService.getConfidenceHistogram(timeRange),
        classifierAnalyticsService.getMisclassifications(timeRange),
        classifierAnalyticsService.getLatencyTrend(timeRange),
      ]);
      if (s.status === "fulfilled") setStats(s.value);
      if (d.status === "fulfilled") setDistribution(d.value);
      if (h.status === "fulfilled") setHistogram(h.value);
      if (m.status === "fulfilled") setMisclassifications(m.value);
      if (l.status === "fulfilled") setLatencyTrend(l.value);
    } catch (err) {
      logger.error("Failed to load classifier analytics:", err);
    }
    setLoading(false);
  };

  const handleMarkCorrect = async (entry: MisclassificationEntry) => {
    try {
      await classifierAnalyticsService.submitFeedback({
        requestId: entry.requestId,
        isCorrect: true,
      });
      toast({ title: "Feedback recorded", description: "Marked as correctly classified" });
      loadData();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to submit feedback" });
    }
  };

  const handleMarkIncorrect = (entry: MisclassificationEntry) => {
    setFeedbackEntry(entry);
    setFeedbackTier(entry.predictedTier === "simple" ? "complex" : "simple");
    setFeedbackNotes("");
    setFeedbackOpen(true);
  };

  const submitIncorrectFeedback = async () => {
    if (!feedbackEntry) return;
    setSubmittingFeedback(true);
    try {
      await classifierAnalyticsService.submitFeedback({
        requestId: feedbackEntry.requestId,
        isCorrect: false,
        correctTier: feedbackTier,
        notes: feedbackNotes || undefined,
      });
      toast({ title: "Feedback recorded", description: "Misclassification recorded" });
      setFeedbackOpen(false);
      loadData();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to submit feedback" });
    }
    setSubmittingFeedback(false);
  };

  const formatNumber = (n: number) => n.toLocaleString();
  const formatPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!stats || stats.totalClassifications === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Classifier Data Yet</h3>
          <p className="text-gray-600">
            Classifier analytics will appear once requests are processed through the binary/ternary classifier.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Classifications</p>
                <p className="text-2xl font-bold">{formatNumber(stats.totalClassifications)}</p>
              </div>
              <Zap className="w-8 h-8" style={{ color: "hsl(150, 40%, 60%)" }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Accuracy Rate</p>
                <p className="text-2xl font-bold">
                  {stats.accuracyRate != null ? formatPct(stats.accuracyRate) : "N/A"}
                </p>
              </div>
              <Target className="w-8 h-8" style={{ color: "hsl(150, 40%, 60%)" }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Confidence</p>
                <p className="text-2xl font-bold">{stats.avgConfidence.toFixed(3)}</p>
              </div>
              <Brain className="w-8 h-8" style={{ color: "hsl(150, 40%, 60%)" }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Latency</p>
                <p className="text-2xl font-bold">{Math.round(stats.avgLatencyMs)}ms</p>
              </div>
              <Clock className="w-8 h-8" style={{ color: "hsl(150, 40%, 60%)" }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classification Distribution (Stacked Bar) */}
        <Card>
          <CardHeader>
            <CardTitle>Classification Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip />
                  <Bar dataKey="simple" stackId="tier" fill="hsl(150, 40%, 60%)" name="Simple" />
                  <Bar dataKey="medium" stackId="tier" fill="hsl(45, 80%, 55%)" name="Medium" />
                  <Bar dataKey="complex" stackId="tier" fill="hsl(270, 50%, 55%)" name="Complex" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-gray-500 py-12">No distribution data</p>
            )}
          </CardContent>
        </Card>

        {/* Confidence Histogram */}
        <Card>
          <CardHeader>
            <CardTitle>Confidence Histogram</CardTitle>
          </CardHeader>
          <CardContent>
            {histogram.some((b) => b.count > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={histogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="bucket" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="hsl(150, 40%, 60%)"
                    // Low-confidence buckets highlighted
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    shape={(props: any) => {
                      const bucketStart = parseFloat(props.bucket?.split("-")[0] ?? "0.5");
                      const color = bucketStart < 0.1 ? "#ef4444" : "hsl(150, 40%, 60%)";
                      return <rect {...props} fill={color} />;
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-gray-500 py-12">No confidence data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Latency Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Classifier Latency Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {latencyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={latencyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" />
                <YAxis stroke="#6b7280" unit="ms" />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}ms`, "Avg Latency"]} />
                <Line
                  type="monotone"
                  dataKey="avgLatencyMs"
                  stroke="hsl(150, 40%, 60%)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-500 py-12">No latency data</p>
          )}
        </CardContent>
      </Card>

      {/* Misclassification Table */}
      {misclassifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Potential Misclassifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 pr-4 font-medium text-gray-600">Date</th>
                    <th className="pb-3 pr-4 font-medium text-gray-600">Prompt</th>
                    <th className="pb-3 pr-4 font-medium text-gray-600">Predicted</th>
                    <th className="pb-3 pr-4 font-medium text-gray-600">Recommended</th>
                    <th className="pb-3 pr-4 font-medium text-gray-600">Used</th>
                    <th className="pb-3 pr-4 font-medium text-gray-600">Confidence</th>
                    <th className="pb-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {misclassifications.slice(0, 20).map((entry) => (
                    <tr key={entry.requestId} className="border-b last:border-0">
                      <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">
                        {entry.date.slice(0, 10)}
                      </td>
                      <td className="py-3 pr-4 max-w-[200px] truncate" title={entry.prompt}>
                        {entry.prompt}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            entry.predictedTier === "simple"
                              ? "secondary"
                              : entry.predictedTier === "complex"
                              ? "default"
                              : "outline"
                          }
                        >
                          {entry.predictedTier}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-xs font-mono">{entry.recommendedModel}</td>
                      <td className="py-3 pr-4 text-xs font-mono">{entry.usedModel}</td>
                      <td className="py-3 pr-4">{entry.confidence.toFixed(3)}</td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => handleMarkCorrect(entry)}
                          >
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => handleMarkIncorrect(entry)}
                          >
                            <XCircle className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback Dialog */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Misclassification</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm text-gray-600 mb-1">Prompt:</p>
              <p className="text-sm bg-gray-50 rounded p-2">{feedbackEntry?.prompt}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">
                Predicted: <Badge variant="outline">{feedbackEntry?.predictedTier}</Badge>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Correct Tier</label>
              <Select value={feedbackTier} onValueChange={setFeedbackTier}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="complex">Complex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
              <Textarea
                className="mt-1"
                placeholder="Why is this a misclassification?"
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitIncorrectFeedback} disabled={submittingFeedback}>
              {submittingFeedback ? "Submitting..." : "Submit Feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassifierAnalytics;
