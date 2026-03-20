/**
 * SavingsAPI — Service layer for savings-related backend endpoints.
 *
 * Uses the same request infrastructure as NadirAPI (X-API-Key header,
 * retry logic, timeout, error classification).
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

// ── Types ────────────────────────────────────────────────────────────────

export interface SavingsSummary {
  totalSaved: number;
  totalSpent: number;
  savingsRate: number;
  requestsRouted: number;
  nadisFee: number;
  netSavings: number;
}

export interface DailySaving {
  date: string;
  saved: number;
  spent: number;
  benchmarkCost: number;
}

export interface TierBreakdown {
  tier: string;
  requests: number;
  saved: number;
}

export interface SavingsHistoryMonth {
  month: string;
  totalSaved: number;
  totalSpent: number;
  savingsRate: number;
  requestsRouted: number;
  nadisFee: number;
  netSavings: number;
}

export interface SavingsBreakdownResponse {
  tiers: TierBreakdown[];
  daily: DailySaving[];
}

// ── Internal request helper (mirrors api.ts pattern) ─────────────────────

async function request<T = any>(
  path: string,
  apiKey: string,
  timeout = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body.detail) detail = body.detail;
        } catch { /* ignore */ }

        const err = new Error(detail);
        (err as any).status = res.status;

        if (res.status === 401 || res.status === 403 || res.status === 429) {
          throw err;
        }
        throw err;
      }

      return await res.json();
    } catch (err) {
      lastError = err;

      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new Error("Request timed out");
      }

      const status = (err as any)?.status;
      const isRetryable = !status || status >= 500;
      if (!isRetryable || attempt >= MAX_RETRIES) break;

      await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

// ── SavingsAPI class ────────────────────────────────────────────────────

export class SavingsAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Savings summary for a given period.
   * @param period — "month" (default), "week", "all", or "YYYY-MM"
   */
  async getSavingsSummary(period?: string): Promise<SavingsSummary> {
    const qs = period ? `?period=${encodeURIComponent(period)}` : "";
    return request<SavingsSummary>(`/v1/savings/summary${qs}`, this.apiKey);
  }

  /**
   * Monthly savings history.
   * @param months — number of past months to include (default: 6)
   */
  async getSavingsHistory(months?: number): Promise<SavingsHistoryMonth[]> {
    const qs = months ? `?months=${months}` : "";
    return request<SavingsHistoryMonth[]>(`/v1/savings/history${qs}`, this.apiKey);
  }

  /**
   * Savings breakdown by tier and by day for the current month.
   */
  async getSavingsBreakdown(): Promise<SavingsBreakdownResponse> {
    return request<SavingsBreakdownResponse>(`/v1/savings/breakdown`, this.apiKey);
  }
}
