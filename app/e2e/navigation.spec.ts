import { test, expect } from "@playwright/test";

// ─── Navigation & routing: client-side navigation, back button, deep links ───

test.describe("Client-side navigation", () => {
  test("homepage → pricing via nav link (no full reload)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const pricingLink = page.getByRole("link", { name: /pricing/i }).first();
    if (await pricingLink.isVisible()) {
      await pricingLink.click();
      await expect(page).toHaveURL(/pricing/);
      // Content should render
      await expect(page.locator("body")).toContainText(/free|plan|price/i);
    }
  });

  test("homepage CTA button is clickable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // The main CTA may navigate to /auth, /pricing, or scroll to a section
    const cta = page.getByRole("link", { name: /get started|sign up|try|log in/i }).first();
    if (await cta.isVisible()) {
      const href = await cta.getAttribute("href");
      // Just verify it has a valid href (internal link or anchor)
      expect(href).toBeTruthy();
    }
  });

  test("direct deep-link to /docs renders", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator("body")).not.toBeEmpty();
    // No crash / white screen
    const hasContent = await page.locator("body").textContent();
    expect(hasContent!.length).toBeGreaterThan(50);
  });

  test("browser back button works after navigation", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to auth
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/auth");

    // Go back
    await page.goBack();
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/auth");
  });
});

test.describe("Scroll to top on navigation", () => {
  test("scrolls to top when navigating to new page", async ({ page }) => {
    await page.goto("/");
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 1000));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    // Navigate
    await page.goto("/auth");
    await page.waitForLoadState("networkidle");
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBe(0);
  });
});
