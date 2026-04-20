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
    };
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

export const trackAuthSuccess = (method: string, userId: string) => {
  const attribution = getStoredAttribution();
  // Set person properties with $set_once so first-touch attribution sticks
  // across future sessions (later signups from the same user cannot overwrite).
  const personProps = Object.keys(attribution).length > 0
    ? { $set_once: attribution }
    : undefined;
  identify(userId, personProps);
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
