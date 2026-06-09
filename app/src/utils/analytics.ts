/**
 * PostHog analytics helper.
 * PostHog is loaded via script tag in index.html.
 * This wrapper provides type safety and no-ops gracefully if PostHog isn't loaded.
 */

import { getStoredAttribution } from "./attribution";

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
      identify: (distinctId: string, properties?: Record<string, unknown>) => void;
      alias: (alias: string, distinctId?: string) => void;
    };
    fbq?: (...args: unknown[]) => void;
    lintrk?: (action: string, properties?: Record<string, unknown>) => void;
  }
}

function isLocalHost() {
  if (typeof window === "undefined") return false;
  const { hostname } = window.location;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    // LAN IPs: dev servers bound to 192.168.x.x / 10.x.x.x / 172.16-31.x.x
    // (covers "vite dev --host" + phone testing on the same network)
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)
  );
}

// Short-circuit for Vite dev mode regardless of hostname — covers ngrok,
// cloud-preview URLs, and anything else where the hostname looks "real"
// but we're still running a dev build. `import.meta.env.DEV` is replaced
// at build time, so production bundles get `false` and tree-shake the
// early return away.
const isDevBuild =
  typeof import.meta !== "undefined" && (import.meta as any).env?.DEV === true;

function shouldSuppressCapture(): boolean {
  return isDevBuild || isLocalHost();
}

function capture(event: string, properties?: Record<string, unknown>) {
  if (shouldSuppressCapture()) return;
  window.posthog?.capture(event, properties);
}

function identify(userId: string, properties?: Record<string, unknown>) {
  if (shouldSuppressCapture()) return;
  window.posthog?.identify(userId, properties);
}

// Merges an old PostHog distinct_id into a new one. Used to stitch the
// pre-existing UUID-keyed person rows to the new email-keyed person row so
// historical events for returning users don't orphan when we flip the
// distinct_id. Gated by localStorage so we only alias each user once per
// browser; PostHog handles the cross-device side server-side.
function aliasOnce(newId: string, oldId: string) {
  if (shouldSuppressCapture()) return;
  if (!newId || !oldId || newId === oldId) return;
  if (typeof window === "undefined") return;
  try {
    const key = `nadir_posthog_aliased_${oldId}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
  } catch {
    // localStorage unavailable (private mode). Alias is idempotent on the
    // PostHog side so re-firing on every sign-in is harmless.
  }
  window.posthog?.alias(newId, oldId);
}

// -- Page view (generic) --
export const trackPageView = (page: string, properties?: Record<string, unknown>) =>
  capture("$pageview", { page, ...properties });

// -- Waitlist events --
export const trackWaitlistSignup = (method: "email" | "google" | "github", source: string) =>
  capture("waitlist_signup", { method, source });

// -- Auth events --
// Auth events auto-include first-touch attribution so you can break down
// signups by ref / utm_source in PostHog without extra wiring at call sites.
export const trackAuthAttempt = (method: "email" | "google" | "github", mode: "signin" | "signup") =>
  capture("auth_attempt", { method, mode, ...getStoredAttribution() });

/**
 * Fires the Meta Pixel CompleteRegistration conversion. Deduped per user via
 * localStorage so the email-confirm round trip (signup -> mail link -> new
 * tab) doesn't miss it and a later login doesn't double-count it.
 */
export const trackSignupConversion = (userId: string, method: string) => {
  if (shouldSuppressCapture()) return;
  if (typeof window === "undefined") return;
  try {
    const key = `nadir_fb_registration_${userId}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
  } catch {
    // localStorage unavailable; firing once per page is still better than nothing.
  }
  window.fbq?.("track", "CompleteRegistration", { method });
  // LinkedIn Insight Tag — fire the signup conversion. The ID is the
  // event-specific conversion configured in LinkedIn Campaign Manager
  // for the Nadir signup action.
  window.lintrk?.("track", { conversion_id: 27393514 });
};

export const trackAuthSuccess = (method: string, userId: string, email?: string) => {
  // Idempotent per (userId, tab session). The central AuthProvider listener
  // fires this on every SIGNED_IN / INITIAL_SESSION as a safety net for OAuth
  // signups where the per-page caller races the Supabase hash exchange; the
  // guard ensures returning-user page loads and per-page callers don't
  // double-capture auth_success for the same identity in one tab.
  if (typeof window !== "undefined") {
    try {
      const key = `nadir_auth_tracked_${userId}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage disabled (private mode, corporate policy). Fall
      // through and fire anyway, a duplicate capture is cheaper than a
      // silent drop.
    }
  }
  const attribution = getStoredAttribution();
  // Key PostHog persons by email so the user is recognizable in the
  // dashboard instead of being a Supabase UUID. Fall back to userId when
  // email is missing (rare with Supabase but possible for some OAuth
  // providers). Keep the Supabase UUID as a person property for back-ref.
  const distinctId = email && email.length > 0 ? email : userId;
  const personProps: Record<string, unknown> = { user_id: userId };
  if (email) {
    personProps.email = email;
    personProps.$email = email;
  }
  if (Object.keys(attribution).length > 0) {
    // $set_once so first-touch attribution sticks across future sessions
    // (later signins from the same user cannot overwrite).
    personProps.$set_once = attribution;
  }
  if (email && email !== userId) {
    aliasOnce(email, userId);
  }
  identify(distinctId, personProps);
  capture("auth_success", { method, ...attribution });
};

// -- Onboarding events --
export const trackOnboardingStep = (step: number, stepName: string) =>
  capture("onboarding_step", { step, step_name: stepName });

export const trackOnboardingComplete = (mode: string) =>
  capture("onboarding_complete", { mode });

export const trackApiKeyCreated = (source: "onboarding" | "dashboard") =>
  capture("api_key_created", { source });

export const trackApiKeyDeleted = () =>
  capture("api_key_deleted");

// -- Pricing / contact events --
export const trackPricingView = (tier?: string) =>
  capture("pricing_view", { tier });

export const trackContactSubmit = () =>
  capture("contact_submit");

// -- Billing events --
export const trackBillingView = () =>
  capture("billing_view");

/**
 * Fires the moment we redirect the user to Stripe Checkout.
 * Pair with the server-side `checkout_abandon` event (emitted from the
 * `checkout.session.expired` Stripe webhook) to measure the client->paid
 * drop-off. Stripe Checkout runs on checkout.stripe.com so the PostHog
 * snippet can't see anything that happens after this point.
 */
export const trackCheckoutStart = (plan: string, source: string) =>
  capture("checkout_start", { plan, source });

/**
 * Fires when the user returns to our site from Stripe Checkout with a
 * cancel status. Server-side `checkout_abandon` covers the case where
 * they close the tab entirely (via `checkout.session.expired`).
 */
export const trackCheckoutCancel = (plan: string) =>
  capture("checkout_cancel", { plan });

// -- Playground events --
export const trackPlaygroundSend = (mode: string) =>
  capture("playground_send", { mode });

export const trackPlaygroundResult = (
  mode: string,
  outcome: "success" | "error" | "abort",
  details?: { status?: number; latency_ms?: number; error?: string; model_used?: string },
) => capture("playground_result", { mode, outcome, ...details });

// -- GitHub events --
export const trackGitHubClick = (location: string) =>
  capture("github_click", { location });

// -- Blog events --
export const trackBlogRead = (postId: string, title: string) =>
  capture("blog_read", { post_id: postId, title });

// -- Docs events --
export const trackDocsView = (section: string) =>
  capture("docs_view", { section });

// -- CTA events --
export const trackCtaClick = (cta: string, location: string) =>
  capture("cta_click", { cta, location });

// -- FAQ events --
export const trackFaqOpen = (question: string, location: string) =>
  capture("faq_open", { question, location });
