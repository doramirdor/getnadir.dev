/**
 * PostHog analytics helper.
 * PostHog is loaded via script tag in index.html.
 * This wrapper provides type safety and no-ops gracefully if PostHog isn't loaded.
 */

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
    hostname.endsWith(".local")
  );
}

function capture(event: string, properties?: Record<string, unknown>) {
  if (isLocalHost()) return;
  window.posthog?.capture(event, properties);
}

function identify(userId: string, properties?: Record<string, unknown>) {
  if (isLocalHost()) return;
  window.posthog?.identify(userId, properties);
}

// -- Page view (generic) --
export const trackPageView = (page: string, properties?: Record<string, unknown>) =>
  capture("$pageview", { page, ...properties });

// -- Waitlist events --
export const trackWaitlistSignup = (method: "email" | "google" | "github", source: string) =>
  capture("waitlist_signup", { method, source });

// -- Auth events --
export const trackAuthAttempt = (method: "email" | "google" | "github", mode: "signin" | "signup") =>
  capture("auth_attempt", { method, mode });

export const trackAuthSuccess = (method: string, userId: string) => {
  identify(userId);
  capture("auth_success", { method });
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
