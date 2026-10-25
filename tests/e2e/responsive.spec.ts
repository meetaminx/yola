import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/playground", "/docs", "/docs/quickstart", "/examples/store", "/examples/store/cart", "/examples/store/checkout"];

test.describe("responsive layout", () => {
  for (const route of ROUTES) {
    test(`${route} has no horizontal scroll`, async ({ page }) => {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("mobile menu opens, navigates and closes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.locator("#mobile-nav");
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: "Playground" }).click();
    await expect(page).toHaveURL(/\/playground$/);
    await expect(page.locator("#mobile-nav")).toHaveCount(0);
  });
});
