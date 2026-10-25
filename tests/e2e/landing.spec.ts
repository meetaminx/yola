import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the hero and navigates to the playground", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Zcash payments.");
    await page.getByRole("link", { name: "Explore the playground" }).click();
    await expect(page).toHaveURL(/\/playground$/);
    await expect(page.getByRole("heading", { name: "API playground" })).toBeVisible();
  });

  test("live demo: create, copy payload, and simulate to confirmation", async ({ page }) => {
    await page.goto("/#demo");
    const demo = page.locator("#demo");
    await demo.getByRole("button", { name: "Create payment request" }).click();
    await expect(demo.getByText("SIMULATED — NO BLOCKCHAIN TRANSACTION")).toBeVisible();
    await expect(demo.getByRole("img", { name: /QR code for payment pay_demo_/ })).toBeVisible();

    await demo.getByRole("button", { name: "Copy payment payload" }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(/^yola-demo:pay_demo_[0-9a-z]{20}\?amount=0\.25&simulated=true$/);
    expect(clip).not.toContain("zcash:");

    await demo.getByRole("button", { name: "Send the exact amount" }).click();
    for (let i = 0; i < 3; i++) await demo.getByRole("button", { name: "Mine a block" }).click();
    await expect(demo.getByText("Confirmed", { exact: true }).first()).toBeVisible();
    await expect(demo.getByText("Not a blockchain transaction hash.")).toBeVisible();
  });

  test("live demo rejects an amount with too many decimals", async ({ page }) => {
    await page.goto("/#demo");
    const demo = page.locator("#demo");
    await demo.getByLabel("Amount").fill("0.123456789");
    await demo.getByRole("button", { name: "Create payment request" }).click();
    await expect(demo.getByRole("alert")).toContainText("at most 8 decimal places");
  });

  test("hero rail does not autoplay with reduced motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForTimeout(2500);
    await expect(page.getByRole("tab", { selected: true }).first()).toContainText("Your app");
    await ctx.close();
  });
});
