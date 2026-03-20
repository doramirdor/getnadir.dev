import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassifierStats {
  totalClassifications: number;
  tierDistribution: { simple: number; medium: number; complex: number };
  avgConfidence: number;
  avgLatencyMs: number;
  accuracyRate: number | null;
}

export interface DailyDistribution {
  date: string;
  simple: number;
  medium: number;
  complex: number;
}

export interface ConfidenceBucket {
  bucket: string;
  count: number;
}

export interface MisclassificationEntry {
  requestId: string;
  date: string;
  prompt: string;
  predictedTier: string;
  confidence: number;
  recommendedModel: string;
  usedModel: string;
}

export interface LatencyPoint {
  date: string;
  avgLatencyMs: number;
}

export interface FeedbackPayload {
  requestId: string;
  isCorrect: boolean;
  correctTier?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDays(range: string): number {
  const map: Record<string, number> = { "1d": 1, "7d": 7, "14d": 14, "30d": 30, "90d": 90 };
  return map[range] ?? 7;
}

type UsageEvent = Record<string, any>;

async function fetchClassifierEvents(range: string): Promise<UsageEvent[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseDays(range));

  try {
    const { data: events, error } = await supabase
      .from("usage_events")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      logger.error("Failed to fetch classifier events:", error.message);
      return [];
    }

    return (events || []).filter(
      (e: UsageEvent) => (e.metadata as any)?.analyzer_type === "binary"
    );
  } catch (err) {
    logger.error("Network error fetching classifier events:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ClassifierAnalyticsService {
  async getStats(range: string = "7d"): Promise<ClassifierStats> {
    const events = await fetchClassifierEvents(range);

    const tierDist = { simple: 0, medium: 0, complex: 0 };
    let confSum = 0, confCount = 0;
    let latSum = 0, latCount = 0;

    for (const e of events) {
      const meta = (e.metadata || {}) as any;
      const tier = meta.classifier_tier || meta.complexity_name || "complex";
      if (tier in tierDist) (tierDist as any)[tier]++;
      if (meta.confidence != null) { confSum += Number(meta.confidence); confCount++; }
      if (meta.analyzer_latency_ms != null) { latSum += Number(meta.analyzer_latency_ms); latCount++; }
    }

    // Try to get accuracy from feedback table
    let accuracyRate: number | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseDays(range));
        const { data: feedback } = await supabase
          .from("classifier_feedback")
          .select("original_tier, correct_tier")
          .eq("user_id", user.id)
          .gte("created_at", startDate.toISOString());
        if (feedback && feedback.length > 0) {
          const correct = feedback.filter((f: any) => f.original_tier === f.correct_tier).length;
          accuracyRate = correct / feedback.length;
        }
      }
    } catch { /* table might not exist yet */ }

    return {
      totalClassifications: events.length,
      tierDistribution: tierDist,
      avgConfidence: confCount > 0 ? confSum / confCount : 0,
      avgLatencyMs: latCount > 0 ? latSum / latCount : 0,
      accuracyRate,
    };
  }

  async getDistribution(range: string = "7d"): Promise<DailyDistribution[]> {
    const events = await fetchClassifierEvents(range);
    const daily = new Map<string, { simple: number; medium: number; complex: number }>();

    for (const e of events) {
      const date = (e.created_at || "").slice(0, 10);
      if (!date) continue;
      if (!daily.has(date)) daily.set(date, { simple: 0, medium: 0, complex: 0 });
      const meta = (e.metadata || {}) as any;
      const tier = meta.classifier_tier || meta.complexity_name || "complex";
      const d = daily.get(date)!;
      if (tier in d) (d as any)[tier]++;
    }

    return Array.from(daily.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));
  }

  async getConfidenceHistogram(range: string = "7d"): Promise<ConfidenceBucket[]> {
    const events = await fetchClassifierEvents(range);
    const buckets: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      buckets[`${(i / 10).toFixed(1)}-${((i + 1) / 10).toFixed(1)}`] = 0;
    }

    for (const e of events) {
      const conf = Number((e.metadata as any)?.confidence ?? -1);
      if (conf < 0) continue;
      const idx = Math.min(Math.floor(conf * 10), 9);
      const key = `${(idx / 10).toFixed(1)}-${((idx + 1) / 10).toFixed(1)}`;
      buckets[key]++;
    }

    return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
  }

  async getMisclassifications(range: string = "7d"): Promise<MisclassificationEntry[]> {
    const events = await fetchClassifierEvents(range);
    const results: MisclassificationEntry[] = [];

    for (const e of events) {
      const meta = (e.metadata || {}) as any;
      const recommended = meta.recommended_model;
      const selected = meta.selected_model || e.model_name;
      if (!meta.model_was_overridden && recommended === selected) continue;

      results.push({
        requestId: e.request_id || "",
        date: (e.created_at || "").slice(0, 19),
        prompt: (e.prompt || "").slice(0, 200),
        predictedTier: meta.classifier_tier || meta.complexity_name || "unknown",
        confidence: Number(meta.confidence || 0),
        recommendedModel: recommended || "",
        usedModel: selected || "",
      });
    }

    return results.slice(0, 100);
  }

  async getLatencyTrend(range: string = "7d"): Promise<LatencyPoint[]> {
    const events = await fetchClassifierEvents(range);
    const daily = new Map<string, number[]>();

    for (const e of events) {
      const date = (e.created_at || "").slice(0, 10);
      const lat = Number((e.metadata as any)?.analyzer_latency_ms);
      if (!date || isNaN(lat)) continue;
      if (!daily.has(date)) daily.set(date, []);
      daily.get(date)!.push(lat);
    }

    return Array.from(daily.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, lats]) => ({
        date,
        avgLatencyMs: lats.reduce((a, b) => a + b, 0) / lats.length,
      }));
  }

  async submitFeedback(payload: FeedbackPayload): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Look up original event
    const { data: eventData } = await supabase
      .from("usage_events")
      .select("metadata, prompt")
      .eq("request_id", payload.requestId)
      .eq("user_id", user.id)
      .limit(1);

    const event = eventData?.[0];
    const meta = (event?.metadata || {}) as any;
    const originalTier = meta.classifier_tier || meta.complexity_name || "unknown";
    const originalConfidence = Number(meta.confidence || 0);
    const correctTier = payload.isCorrect ? originalTier : (payload.correctTier || originalTier);

    const { error } = await supabase.from("classifier_feedback").insert({
      request_id: payload.requestId,
      user_id: user.id,
      original_tier: originalTier,
      correct_tier: correctTier,
      original_confidence: originalConfidence,
      prompt_text: (event?.prompt || "").slice(0, 500),
      notes: payload.notes || null,
    });

    if (error) throw error;
  }
}

export const classifierAnalyticsService = new ClassifierAnalyticsService();
