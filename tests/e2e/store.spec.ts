import { expect, test, type Page } from "@playwright/test";

async function fillCart(page: Page) {
  await page.goto("/examples/store");
  await page.getByRole("button", { name: "Add Enamel camp mug to cart" }).click();
  await page.getByRole("button", { name: "Add Field notebook to cart" }).click();
  await page.getByRole("button", { name: "Add Field notebook to cart" }).click();
  await expect(page.getByRole("link", { name: "Cart, 3 items" })).toBeVisible();
}

async function checkout(page: Page) {
  await page.getByRole("link", { name: /^Cart,/ }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByRole("button", { name: "Place order and pay" }).click();
  await expect(page.locator("#method-error")).toHaveText("Choose a payment method to continue.");
  await page.getByLabel(/Zcash \(ZEC\)/).check();
  await page.getByRole("button", { name: "Place order and pay" }).click();
  await expect(page).toHaveURL(/\/examples\/store\/orders\/ord_/);
}

const wallet = (page: Page) => page.getByRole("complementary", { name: "Simulated wallet" });

test.describe("sample store", () => {
  test("full checkout: cart, underpayment, top-up, confirmations, cleared cart", async ({ page }) => {
    await fillCart(page);
    await page.getByRole("link", { name: /^Cart,/ }).click();
    // 0.065 + 2 x 0.042 = 0.149, computed with exact integers
    await expect(page.getByText("0.149 ZEC").first()).toBeVisible();
    await page.getByRole("button", { name: "Increase quantity of Enamel camp mug" }).click();
    await expect(page.getByText("0.214 ZEC").first()).toBeVisible();
    await page.getByRole("button", { name: "Decrease quantity of Enamel camp mug" }).click();

    await page.getByRole("link", { name: "Continue to checkout" }).click();
    await page.getByLabel(/Zcash \(ZEC\)/).check();
    await page.getByRole("button", { name: "Place order and pay" }).click();
    await expect(page).toHaveURL(/\/orders\/ord_/);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Awaiting payment");
    await expect(page.getByText("SIMULATED — NO BLOCKCHAIN TRANSACTION").first()).toBeVisible();
    await expect(page.getByRole("img", { name: /QR code for payment/ })).toBeVisible();
    await expect(page.getByText(/yola-demo:pay_demo_\w+\?amount=0\.149&simulated=true/)).toBeVisible();

    await wallet(page).getByRole("button", { name: "Send half" }).click();
    await expect(page.getByRole("region", { name: "Payment status" }).getByRole("status")).toHaveText("Partly paid");
    await wallet(page).getByRole("button", { name: "Send the difference" }).click();
    for (let i = 0; i < 3; i++) await wallet(page).getByRole("button", { name: "Mine a block" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Order confirmed");
    await expect(page.getByRole("region", { name: "Payment status" }).getByRole("status")).toHaveText("Payment confirmed");
    await expect(page.getByRole("link", { name: "Cart, 0 items" })).toBeVisible();
  });

  test("expired order offers a new checkout and keeps the cart", async ({ page }) => {
    await fillCart(page);
    await checkout(page);
    await wallet(page).getByRole("button", { name: "Let it expire" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Payment window closed");
    await expect(page.getByRole("region", { name: "Payment status" })).toContainText("Do not send funds to this request.");
    await page.getByRole("link", { name: "Start a new checkout" }).click();
    await expect(page).toHaveURL(/\/examples\/store\/checkout$/);
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    // Earlier pages stay in the DOM (hidden) for back/forward, so match visible text only.
    await expect(page.getByText("0.149 ZEC").filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Place order and pay" })).toBeEnabled();
  });

  test("an order can be cancelled before payment", async ({ page }) => {
    await fillCart(page);
    await checkout(page);
    await wallet(page).getByRole("button", { name: "Cancel request" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Order cancelled");
  });

  test("QR code downloads as PNG and SVG", async ({ page }) => {
    await fillCart(page);
    await checkout(page);
    const png = page.waitForEvent("download");
    await page.getByRole("button", { name: "PNG" }).click();
    expect((await png).suggestedFilename()).toMatch(/^pay_demo_\w+\.png$/);
    const svg = page.waitForEvent("download");
    await page.getByRole("button", { name: "SVG" }).click();
    expect((await svg).suggestedFilename()).toMatch(/^pay_demo_\w+\.svg$/);
  });

  test("reloading an order explains that local orders are not kept", async ({ page }) => {
    await fillCart(page);
    await checkout(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Order not found" })).toBeVisible();
    await page.getByRole("link", { name: "Back to checkout" }).click();
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await expect(page.getByText("0.149 ZEC").filter({ visible: true })).toBeVisible();
  });
});
