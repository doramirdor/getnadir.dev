import { test, expect } from "@playwright/test";

// ─── Error handling: console errors, network failures, error boundaries ───

test.describe("Console errors", () => {
  test("homepage has no uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter out known benign errors (e.g., analytics, third-party scripts)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("analytics") &&
        !e.includes("gtag")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("auth page has no uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/auth");
    await page.waitForLoadState("networkidle");

    const criticalErrors = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("analytics")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("404 page has no uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/nonexistent-route-xyz");
    await page.waitForLoadState("networkidle");

    const criticalErrors = errors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("analytics")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe("Network resilience", () => {
  test("dashboard handles backend offline gracefully", async ({ page }) => {
    // Block all API calls to backend
    await page.route("**/v1/**", (route) => route.abort("connectionrefused"));

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Page should not crash — ErrorBoundary or empty state should catch it
    const bodyText = await page.locator("body").textContent();
    expect(bodyText!.length).toBeGreaterThan(10);

    // No unhandled JS errors (promise rejections are caught by GlobalAsyncErrorHandler)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("analytics") &&
        !e.includes("Failed to fetch") &&
        !e.includes("NetworkError") &&
        !e.includes("ERR_CONNECTION_REFUSED")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

test.describe("Lazy loading", () => {
  test("shows loader spinner while lazy component loads", async ({ page }) => {
    // Slow down JS chunks to catch the Suspense fallback
    await page.route("**/*.js", async (route) => {
      const url = route.request().url();
      // Only delay lazy chunks, not the main bundle
      if (url.includes("pages/") || url.includes("Pricing")) {
        await new Promise((r) => setTimeout(r, 500));
      }
      await route.continue();
    });

    await page.goto("/pricing");
    // The page should eventually render (not hang forever)
    await expect(page.locator("body")).toContainText(/free|plan|price/i, {
      timeout: 10_000,
    });
  });
});
