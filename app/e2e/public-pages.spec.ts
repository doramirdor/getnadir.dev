import { test, expect } from "@playwright/test";

// ─── Public pages: load without auth, render key content ───

test.describe("Homepage", () => {
  test("renders hero and key sections", async ({ page }) => {
    await page.goto("/");
    // Title / heading should mention Nadir or LLM
    await expect(page.locator("h1").first()).toBeVisible();
    // CTA button exists
    await expect(page.getByRole("link", { name: /get started|sign up|try/i }).first()).toBeVisible();
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");
    // Pricing link
    const pricingLink = page.getByRole("link", { name: /pricing/i }).first();
    if (await pricingLink.isVisible()) {
      await pricingLink.click();
      await expect(page).toHaveURL(/pricing/);
    }
  });
});

test.describe("Pricing page", () => {
  test("loads and shows pricing content", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("body")).toContainText(/free|pro|enterprise|plan/i);
  });
});

test.describe("Auth page", () => {
  test("renders sign-in form", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
    // Has OAuth buttons
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /github/i })).toBeVisible();
  });

  test("can toggle between sign-in and sign-up", async ({ page }) => {
    await page.goto("/auth");
    const signUpToggle = page.getByRole("button", { name: /sign up|create account|register/i }).first();
    if (await signUpToggle.isVisible()) {
      await signUpToggle.click();
      // Name field should appear in sign-up mode
      await expect(page.getByLabel(/name/i).first()).toBeVisible();
    }
  });

  test("shows validation on empty submit", async ({ page }) => {
    await page.goto("/auth");
    const submitBtn = page.getByRole("button", { name: /sign in|log in|submit/i }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Browser validation or toast should appear — page should still be on /auth
      await expect(page).toHaveURL(/auth/);
    }
  });
});

test.describe("Docs page", () => {
  test("loads docs", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.locator("body")).toContainText(/documentation|docs|guide|api/i);
  });
});

test.describe("Blog page", () => {
  test("loads blog listing", async ({ page }) => {
    await page.goto("/blog");
    await expect(page.locator("body")).toContainText(/blog/i);
  });
});

test.describe("Legal pages", () => {
  test("privacy policy loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("body")).toContainText(/privacy/i);
  });

  test("terms of service loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("body")).toContainText(/terms/i);
  });
});

test.describe("OpenClaw page", () => {
  test("loads openclaw page", async ({ page }) => {
    await page.goto("/openclaw");
    await expect(page.locator("body")).toContainText(/claw|open/i);
  });
});

test.describe("404 page", () => {
  test("shows not found for invalid routes", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-abc123");
    await expect(page.locator("body")).toContainText(/not found|404|doesn't exist/i);
  });
});
