import { expect, test, type Page } from "@playwright/test";

async function send(page: Page) {
  await page.getByRole("button", { name: "Send request" }).click();
}

const response = (page: Page) => page.getByRole("region", { name: "Response" });

test.describe("playground", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
  });

  test("creates a payment and drives it to confirmation through the status component", async ({ page }) => {
    await send(page);
    await expect(response(page)).toContainText("HTTP 201");
    await expect(response(page)).toContainText('"trust_level": "simulated"');

    const inspector = page.getByRole("region", { name: "Payment inspector" });
    await expect(inspector.getByRole("img", { name: /QR code for payment/ })).toBeVisible();
    const status = inspector.getByRole("region", { name: "Payment status" });
    await expect(status.getByRole("status")).toHaveText("Waiting for payment");

    await inspector.getByRole("button", { name: "Send the exact amount" }).click();
    await expect(response(page)).toContainText('"status": "payment_detected"');
    for (let i = 0; i < 3; i++) await inspector.getByRole("button", { name: "Mine a block" }).click();
    await expect(response(page)).toContainText('"status": "confirmed"');
    await expect(status.getByRole("status")).toHaveText("Payment confirmed");
  });

  test("replays an idempotent request and rejects a reused key with new parameters", async ({ page }) => {
    await send(page);
    await expect(response(page)).toContainText("HTTP 201");
    await send(page);
    await expect(response(page)).toContainText("idempotent replay");
    await page.getByRole("button", { name: "Reused idempotency key" }).click();
    await send(page);
    await expect(response(page)).toContainText("HTTP 409");
    await expect(response(page)).toContainText('"code": "idempotency_conflict"');
  });

  for (const [preset, status, code] of [
    ["Amount sent as a number", 422, "invalid_request"],
    ["Nine decimal places", 422, "amount_precision"],
    ["Unknown field", 422, "invalid_request"],
    ["Supplying a destination", 422, "destination_not_accepted"],
    ["Testnet without a backend", 503, "network_unavailable"],
    ["Malformed JSON", 400, "invalid_json"],
    ["Unknown payment ID", 404, "not_found"],
  ] as const) {
    test(`error preset: ${preset}`, async ({ page }) => {
      await page.getByRole("button", { name: preset }).click();
      await send(page);
      await expect(response(page)).toContainText(`HTTP ${status}`);
      await expect(response(page)).toContainText(`"code": "${code}"`);
      await expect(response(page)).toContainText('"request_id": "req_');
    });
  }

  test("switching to testnet explains what is missing", async ({ page }) => {
    await page.getByText("Zcash testnet", { exact: true }).click();
    await expect(page.getByText("Testnet is not available in this playground.")).toBeVisible();
    await expect(page.getByText("ZCASH TESTNET — TEST FUNDS HAVE NO MONETARY VALUE")).toBeVisible();
    await page.getByRole("button", { name: "Continue with the simulator" }).click();
    await expect(page.getByText("SIMULATED — NO BLOCKCHAIN TRANSACTION")).toBeVisible();
  });

  test("code examples follow the request and copy", async ({ page }) => {
    const code = page.getByRole("region", { name: "Code for this request" });
    await expect(code).toContainText("yola.paymentRequests.create(");
    await code.getByRole("tab", { name: "cURL" }).click();
    await expect(code).toContainText("curl -X POST");
    await expect(code).toContainText("Idempotency-Key: order-1042");
    await code.getByRole("tab", { name: "Python" }).click();
    await expect(code).toContainText("requests.post(");
    await code.getByRole("button", { name: "Copy code example" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("import requests");
  });

  test("history restores an earlier request", async ({ page }) => {
    await send(page);
    await page.getByLabel("Endpoint").selectOption("list");
    await send(page);
    const history = page.getByRole("region", { name: "Request history" });
    await expect(history.getByRole("button")).toHaveCount(3); // two entries + Clear
    await history.getByRole("button", { name: /POST/ }).click();
    await expect(page.getByLabel("Endpoint")).toHaveValue("create");
    await history.getByRole("button", { name: "Clear" }).click();
    await expect(history).toContainText("Requests you send appear here");
  });
});
