/**
 * NadirAPI — Unified service layer for all backend API calls.
 *
 * Wraps all Nadir backend endpoints with the user's X-API-Key header.
 * Used by dashboard pages instead of direct Supabase queries for backend-powered features.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

export type ApiErrorKind = "auth" | "rate_limit" | "server" | "timeout" | "network" | "unknown";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  retryAfterMs?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function classifyError(res: Response): ApiError {
  if (res.status === 401 || res.status === 403) {
    return new ApiError(
      res.status === 401 ? "Authentication required" : "Access denied",
      "auth",
      res.status,
    );
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
    return new ApiError("Rate limit exceeded", "rate_limit", 429, retryMs);
  }
  if (res.status >= 500) {
    return new ApiError(`Server error: ${res.status}`, "server", res.status);
  }
  return new ApiError(`API error: ${res.status}`, "unknown", res.status);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.kind === "server" || error.kind === "timeout";
  }
  // Network errors are retryable
  return error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
}

async function request<T = any>(
  path: string,
  options: RequestInit & { apiKey?: string; timeout?: number } = {}
): Promise<T> {
  const { apiKey, timeout = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
    ...(fetchOptions.headers as Record<string, string> || {}),
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        const apiErr = classifyError(res);
        // Try to get detail message from response body
        try {
          const body = await res.json();
          if (body.detail) apiErr.message = body.detail;
        } catch { /* ignore parse errors */ }

        // Don't retry auth or rate-limit errors
        if (apiErr.kind === "auth" || apiErr.kind === "rate_limit") {
          throw apiErr;
        }
        throw apiErr;
      }

      return await res.json();
    } catch (err) {
      lastError = err;

      // Classify abort/network errors
      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new ApiError("Request timed out", "timeout");
      } else if (err instanceof TypeError) {
        lastError = new ApiError("Network error — check your connection", "network");
      }

      // Don't retry non-retryable or last attempt
      if (!isRetryable(lastError) || attempt >= MAX_RETRIES) {
        break;
      }

      // Exponential backoff
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

export class NadirAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private opts(init?: RequestInit): RequestInit & { apiKey: string } {
    return { ...init, apiKey: this.apiKey };
  }

  // ── Completions ──────────────────────────────────────────────────────

  async chatCompletion(body: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }) {
    return request("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
      ...this.opts(),
    });
  }

  async chatCompletionPlayground(body: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }) {
    return request("/v1/chat/completions/playground", {
      method: "POST",
      body: JSON.stringify(body),
      ...this.opts(),
    });
  }

  async getRecommendation(body: {
    prompt: string;
    system_message?: string;
    providers?: string[];
    models?: string[];
    benchmark_model?: string;
  }) {
    return request("/v1/public/recommendation", {
      method: "POST",
      body: JSON.stringify(body),
      ...this.opts(),
    });
  }

  // ── Models & Presets ─────────────────────────────────────────────────

  async listModels() {
    return request("/v1/models", this.opts());
  }

  async listPresets() {
    return request("/v1/user/presets", this.opts());
  }

  // ── Smart Export ─────────────────────────────────────────────────────

  async getSmartExportStatus() {
    return request("/v1/smart-export/status", this.opts());
  }

  async getClusterSamples(clusterId: string, limit = 50) {
    return request(`/v1/smart-export/clusters/${clusterId}/samples?limit=${limit}`, this.opts());
  }

  async trainCluster(clusterId: string, baseModel = "gpt-4o-mini") {
    return request(`/v1/smart-export/clusters/${clusterId}/train`, {
      method: "POST",
      body: JSON.stringify({ base_model: baseModel }),
      ...this.opts(),
    });
  }

  async exportCluster(clusterId: string, format = "jsonl") {
    return request(`/v1/smart-export/clusters/${clusterId}/export`, {
      method: "POST",
      body: JSON.stringify({ format }),
      ...this.opts(),
    });
  }

  async listJobs() {
    return request("/v1/smart-export/jobs", this.opts());
  }

  async getJob(jobId: string) {
    return request(`/v1/smart-export/jobs/${jobId}`, this.opts());
  }

  async cancelJob(jobId: string) {
    return request(`/v1/smart-export/jobs/${jobId}`, {
      method: "DELETE",
      ...this.opts(),
    });
  }

  async listExpertModels() {
    return request("/v1/smart-export/expert-models", this.opts());
  }

  async toggleExpertModel(modelId: string, isActive: boolean) {
    return request(`/v1/smart-export/expert-models/${modelId}/toggle`, {
      method: "POST",
      body: JSON.stringify({ is_active: isActive }),
      ...this.opts(),
    });
  }

  async evaluateExpertModel(modelId: string) {
    return request(`/v1/smart-export/expert-models/${modelId}/evaluate`, {
      method: "POST",
      ...this.opts(),
    });
  }

  // ── Clustering ───────────────────────────────────────────────────────

  async classifyPrompt(prompt: string) {
    return request("/v1/clustering/classify", {
      method: "POST",
      body: JSON.stringify({ prompt }),
      ...this.opts(),
    });
  }

  async listClusters() {
    return request("/v1/clustering/clusters", this.opts());
  }

  async getClusterPrompts(clusterId: string, limit = 50) {
    return request(`/v1/clustering/clusters/${clusterId}/prompts?limit=${limit}`, this.opts());
  }

  async createCluster(body: {
    name: string;
    description: string;
    examples?: string[];
    classification_criteria?: string[];
  }) {
    return request("/v1/clustering/clusters", {
      method: "POST",
      body: JSON.stringify(body),
      ...this.opts(),
    });
  }

  // ── Organizations ────────────────────────────────────────────────────

  async listOrganizations() {
    return request("/v1/organizations", this.opts());
  }

  async createOrganization(body: { name: string; slug: string; plan_type?: string }) {
    return request("/v1/organizations", {
      method: "POST",
      body: JSON.stringify(body),
      ...this.opts(),
    });
  }

  async getOrganization(orgId: string) {
    return request(`/v1/organizations/${orgId}`, this.opts());
  }

  // ── Health ───────────────────────────────────────────────────────────

  async health() {
    return request("/health");
  }
}
