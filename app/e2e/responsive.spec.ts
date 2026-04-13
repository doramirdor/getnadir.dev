import { test, expect } from "@playwright/test";

// ─── Responsive: key pages render at mobile viewport ───

const mobileViewport = { width: 375, height: 812 }; // iPhone X

test.describe("Mobile responsiveness", () => {
  test("homepage renders on mobile without horizontal scroll", async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // No horizontal overflow
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(docWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px tolerance

    // Hero should still be visible
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("auth page renders on mobile", async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });

  test("pricing page renders on mobile", async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toContainText(/free|plan|price/i);
  });

  test("dashboard redirects on mobile same as desktop", async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Should either redirect or show content (not crash)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText!.length).toBeGreaterThan(10);
  });
});
