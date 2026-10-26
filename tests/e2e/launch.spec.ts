import { expect, test } from "@playwright/test";

/** Launch requirements: legal pages, icons, 404 and security headers. */

test("privacy and terms pages are reachable from the footer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText(/No analytics, advertising or tracking scripts/)).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
  await expect(page.getByText("Mainnet is disabled.")).toBeVisible();
});

test("sign-up links to the terms and privacy policy", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByRole("link", { name: "terms of service" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "privacy policy" })).toHaveAttribute("href", "/privacy");
});

test("unknown pages show the Yola 404 with a 404 status", async ({ page }) => {
  const res = await page.goto("/definitely-not-a-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "This page does not exist." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Documentation" })).toBeVisible();
});

test("serves the Yola icons and security headers", async ({ request, page }) => {
  for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();
  await page.goto("/");
  await expect(page).toHaveTitle("Yola: Zcash payments. Built for builders.");
});
