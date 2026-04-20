/**
 * First-touch attribution capture.
 *
 * Reads `ref`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`,
 * `utm_term` from the URL on first page load of a session and stashes them
 * in sessionStorage. First-touch wins: once a session has attribution, a
 * later navigation that arrives without params does not clear it.
 *
 * Call `captureAttributionFromUrl()` once at app boot. Call
 * `getStoredAttribution()` from analytics to merge into events or pass as
 * PostHog person properties on identify.
 */

const STORAGE_KEY = "nadir_attribution_v1";

const ATTRIBUTION_KEYS = [
  "ref",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>> & {
  landing_path?: string;
  landing_referrer?: string;
  captured_at?: string;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function readFromUrl(): Attribution {
  if (!isBrowser()) return {};
  const params = new URLSearchParams(window.location.search);
  const out: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const val = params.get(key);
    if (val) out[key] = val.slice(0, 128);
  }
  return out;
}

export function getStoredAttribution(): Attribution {
  if (!isBrowser()) return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}

export function captureAttributionFromUrl(): Attribution {
  if (!isBrowser()) return {};
  const existing = getStoredAttribution();
  if (Object.keys(existing).length > 0) return existing;

  const fromUrl = readFromUrl();
  if (Object.keys(fromUrl).length === 0) return {};

  const record: Attribution = {
    ...fromUrl,
    landing_path: window.location.pathname,
    landing_referrer: document.referrer || undefined,
    captured_at: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // sessionStorage full or disabled; attribution won't persist but
    // the caller can still use the returned record for this page load.
  }
  return record;
}
