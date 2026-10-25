import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Dashboard flows against a real server and PostgreSQL database.
 * Each test signs up a fresh user, so tests are independent.
 */

const PASSWORD = "correct-horse-battery-staple";

function email(tag: string) {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

let clientCounter = 0;
/** A distinct client address per test user (the server trusts X-Forwarded-For in e2e). */
async function asNewClient(page: Page) {
  clientCounter += 1;
  await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": `203.0.113.${(process.pid + clientCounter) % 250}` });
}

async function signUp(page: Page, tag = "dev") {
  await asNewClient(page);
  const address = email(tag);
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Ada Developer");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return address;
}

async function createProject(page: Page, name = "Fernhill checkout") {
  await expect(page.getByRole("heading", { name: "Create your first project" })).toBeVisible();
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function createKey(page: Page, name = "Checkout server") {
  await page.goto("/dashboard/developers/api-keys");
  await page.getByRole("button", { name: "Create key" }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Create key" }).click();
  const secretEl = page.getByTestId("new-secret");
  await expect(secretEl).toHaveText(/^ysk_test_[0-9a-z]{32}$/);
  const secret = (await secretEl.textContent())!;
  const done = page.getByRole("button", { name: "Done" });
  await expect(done).toBeDisabled();
  await page.getByLabel("I have stored this key somewhere safe").check();
  await done.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return secret;
}

async function api(request: APIRequestContext, secret: string, method: "GET" | "POST", path: string, data?: unknown, headers: Record<string, string> = {}) {
  const res = await request.fetch(`/api/v1${path}`, { method, headers: { Authorization: `Bearer ${secret}`, ...headers }, data });
  return { status: res.status(), body: await res.json(), headers: res.headers() };
}

test.describe("dashboard", () => {
  test("redirects signed-out visitors to sign in and back", async ({ page }) => {
    await page.goto("/dashboard/payments");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard%2Fpayments$/);
  });

  test("rejects a wrong password without revealing which part was wrong", async ({ page, browser }) => {
    const address = await signUp(page, "pw");
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await asNewClient(other);
    await other.goto("/sign-in");
    await other.getByLabel("Email").fill(address);
    await other.getByLabel("Password").fill("not-the-password-123");
    await other.getByRole("button", { name: "Sign in" }).click();
    await expect(other.getByRole("alert").filter({ hasText: "do not match" })).toBeVisible();
    await other.getByLabel("Password").fill(PASSWORD);
    await other.getByRole("button", { name: "Sign in" }).click();
    await expect(other).toHaveURL(/\/dashboard$/);
    await ctx.close();
  });

  test("onboarding, API key, API call, payment lifecycle, revocation", async ({ page, request }) => {
    await signUp(page);
    await createProject(page);
    await expect(page.getByText("All counts are simulated payments")).toBeVisible();

    const secret = await createKey(page);
    await expect(page.getByRole("cell", { name: new RegExp(`ysk_test_\\.\\.\\.${secret.slice(-4)}`) })).toBeVisible();
    // The full secret is not on the page once the dialog is closed.
    expect(await page.content()).not.toContain(secret);

    const created = await api(request, secret, "POST", "/payment-requests", { amount: "0.25", currency: "ZEC", network: "demo", external_reference: "order-9" }, { "Idempotency-Key": "e2e-1" });
    expect(created.status).toBe(201);
    expect(created.headers["x-request-id"]).toMatch(/^req_/);
    const id = created.body.id as string;

    await page.goto("/dashboard/payments");
    await expect(page.getByRole("link", { name: id })).toBeVisible();
    await page.getByLabel("Search").fill("order-9");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("link", { name: id })).toBeVisible();
    await page.getByRole("link", { name: id }).click();

    await expect(page.getByText("SIMULATED — NO BLOCKCHAIN TRANSACTION")).toBeVisible();
    await page.getByRole("button", { name: "Send the exact amount" }).click();
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Mine a block" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("0.25 ZEC");
    await expect(page.getByText("The payment met the amount and confirmation policy.").first()).toBeVisible();

    const status = await api(request, secret, "GET", `/payment-requests/${id}/status`);
    expect(status.body).toMatchObject({ status: "confirmed", trust_level: "simulated", final: true });

    await page.goto("/dashboard/developers/api-keys");
    await page.getByRole("button", { name: "Revoke Checkout server" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Revoke key" }).click();
    await expect(page.getByText('Key "Checkout server" revoked')).toBeVisible();
    const revoked = await api(request, secret, "GET", "/payment-requests");
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe("api_key_revoked");
  });

  test("dashboard playground stores payments in the project", async ({ page }) => {
    await signUp(page, "pg");
    await createProject(page, "Playground project");
    await page.goto("/dashboard/playground");
    await page.getByRole("button", { name: "Send request" }).click();
    const response = page.getByRole("region", { name: "Response" });
    await expect(response).toContainText("HTTP 201");
    const id = (await response.textContent())!.match(/pay_demo_[0-9a-z]{20}/)![0];
    await page.getByRole("link", { name: "Payments" }).first().click();
    await expect(page.getByRole("link", { name: id })).toBeVisible();
  });

  test("users cannot see each other's projects or payments", async ({ page, browser, request }) => {
    await signUp(page, "owner");
    await createProject(page, "Private project");
    const secret = await createKey(page);
    const { body } = await api(request, secret, "POST", "/payment-requests", { amount: "1", currency: "ZEC", network: "demo" });

    const ctx = await browser.newContext();
    const intruder = await ctx.newPage();
    await signUp(intruder, "intruder");
    await expect(intruder.getByRole("heading", { name: "Create your first project" })).toBeVisible();
    await intruder.goto(`/dashboard/payments/${body.id}`);
    await expect(intruder.getByRole("heading", { name: /not found|could not be found/i })).toBeVisible();
    await intruder.goto("/dashboard");
    await createProject(intruder, "Intruder project");
    await intruder.goto("/dashboard/payments");
    await expect(intruder.getByText(body.id)).toHaveCount(0);
    await ctx.close();
  });

  test("webhook endpoints reject internal destinations and log failed deliveries", async ({ page }) => {
    await signUp(page, "hooks");
    await createProject(page, "Hooks project");
    await page.goto("/dashboard/developers/webhooks");
    await page.getByRole("button", { name: "Add endpoint" }).first().click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Endpoint URL").fill("http://example.com/hook");
    await dialog.getByRole("button", { name: "Add endpoint" }).click();
    await expect(dialog.getByRole("alert").first()).toContainText("must use https://");

    await dialog.getByLabel("Endpoint URL").fill("https://169.254.169.254/latest/meta-data");
    await dialog.getByRole("button", { name: "Add endpoint" }).click();
    await expect(dialog.getByRole("alert").first()).toContainText("Private, loopback and link-local addresses are not allowed.");

    // A public address literal (no DNS needed). Nothing listens there from this environment.
    await dialog.getByLabel("Endpoint URL").fill("https://192.0.43.10/yola-hook");
    await dialog.getByRole("button", { name: "Add endpoint" }).click();
    await expect(page.getByTestId("new-signing-secret")).toHaveText(/^whsec_[0-9a-z]{32}$/);
    await page.getByRole("button", { name: "I have saved it" }).click();

    await page.getByRole("button", { name: "Send test event" }).click();
    await expect(page.getByText("Test event queued.")).toBeVisible();
    // The job loop attempts it within a few seconds; the outcome is shown only after the attempt.
    await expect(async () => {
      await page.getByRole("button", { name: "Refresh" }).click();
      await expect(page.getByText("webhook.test")).toBeVisible();
      await expect(page.locator("summary").filter({ hasText: "webhook.test" })).not.toContainText("not sent yet", { timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.locator("summary").filter({ hasText: "webhook.test" })).not.toContainText("succeeded");
  });

  test("settings save and update the project name", async ({ page }) => {
    await signUp(page, "settings");
    await createProject(page, "Old name");
    await page.goto("/dashboard/settings");
    await page.getByLabel("Project name").fill("New name");
    await page.getByLabel("Testnet confirmations required").fill("0");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("At least 1.")).toBeVisible();
    await page.getByLabel("Testnet confirmations required").fill("12");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved")).toBeVisible();
    await expect(page.getByRole("button", { name: /New name/ })).toBeVisible();
  });

  test("signing out ends the session", async ({ page }) => {
    await signUp(page, "out");
    await page.getByRole("button", { name: /^Account:/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
