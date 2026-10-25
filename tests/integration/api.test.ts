import { beforeEach, describe, expect, it } from "vitest";
import * as collection from "@/app/api/v1/payment-requests/route";
import * as one from "@/app/api/v1/payment-requests/[id]/route";
import * as status from "@/app/api/v1/payment-requests/[id]/status/route";
import * as cancel from "@/app/api/v1/payment-requests/[id]/cancel/route";
import * as simulate from "@/app/api/v1/payment-requests/[id]/simulate/route";
import * as webhookTest from "@/app/api/v1/webhooks/test/route";
import { call, makeProject, prisma, resetDb } from "./fixtures";

const body = { amount: "0.25", currency: "ZEC", network: "demo", description: "Order 1" };

beforeEach(resetDb);

describe("authentication", () => {
  it("rejects missing, malformed, unknown and revoked keys", async () => {
    const { testKey, testKeyId } = await makeProject();
    const missing = await call(collection.GET, { path: "/payment-requests" });
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("unauthenticated");
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");

    expect((await call(collection.GET, { path: "/payment-requests", key: "ysk_test_short" })).body.error.code).toBe("invalid_api_key");
    expect((await call(collection.GET, { path: "/payment-requests", key: `ysk_test_${"a".repeat(32)}` })).body.error.code).toBe("invalid_api_key");

    expect((await call(collection.GET, { path: "/payment-requests", key: testKey })).status).toBe(200);
    await prisma().apiKey.update({ where: { id: testKeyId }, data: { revokedAt: new Date() } });
    const revoked = await call(collection.GET, { path: "/payment-requests", key: testKey });
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe("api_key_revoked");
  });

  it("stores only a hash of each key", async () => {
    const { testKey } = await makeProject();
    const rows = await prisma().apiKey.findMany();
    for (const r of rows) {
      expect(JSON.stringify(r)).not.toContain(testKey);
      expect(r.secretHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("creating payment requests", () => {
  it("creates, persists and returns the documented shape and headers", async () => {
    const { testKey, project } = await makeProject();
    const res = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body });
    expect(res.status).toBe(201);
    expect(res.headers.get("x-request-id")).toMatch(/^req_/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-ratelimit-limit")).toBe("60");
    expect(res.body).toMatchObject({ amount: "0.25000000", amount_zatoshis: "25000000", network: "demo", trust_level: "simulated", status: "awaiting_payment" });
    const row = await prisma().paymentRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.projectId).toBe(project.id);
    expect(row.amountZatoshis).toBe(25_000_000n);
    const audit = await prisma().auditEvent.findFirst({ where: { action: "payment_request.created" } });
    expect(audit?.targetId).toBe(res.body.id);
  });

  it("validates input with structured errors", async () => {
    const { testKey } = await makeProject();
    const bad = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body: { ...body, amount: 0.25 } });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: "invalid_request", fields: { amount: expect.any(String) } });
    expect(bad.body.error.request_id).toBe(bad.headers.get("x-request-id"));

    const precision = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body: { ...body, amount: "1.000000001" } });
    expect(precision.body.error.code).toBe("amount_precision");

    const json = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, rawBody: "{nope", headers: { "Content-Type": "application/json" } });
    expect(json.status).toBe(400);
    expect(json.body.error.code).toBe("invalid_json");

    const type = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, rawBody: JSON.stringify(body), headers: { "Content-Type": "text/plain" } });
    expect(type.status).toBe(415);

    const big = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body: { ...body, description: "x".repeat(40_000) } });
    expect(big.status).toBe(413);
  });

  it("enforces network rules per key type", async () => {
    const { testKey, liveKey } = await makeProject();
    const live = await call(collection.POST, { method: "POST", path: "/payment-requests", key: liveKey, body });
    expect(live.status).toBe(403);
    expect(live.body.error.code).toBe("network_not_allowed");
    const mainnet = await call(collection.POST, { method: "POST", path: "/payment-requests", key: liveKey, body: { ...body, network: "mainnet" } });
    expect(mainnet.status).toBe(503);
    expect(mainnet.body.error.code).toBe("network_disabled");
    const testnet = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body: { ...body, network: "testnet" } });
    expect(testnet.status).toBe(503);
    expect(testnet.body.error.code).toBe("network_unavailable");
    expect(await prisma().paymentRequest.count()).toBe(0);
  });
});

describe("idempotency", () => {
  it("replays the same response and creates one record", async () => {
    const { testKey } = await makeProject();
    const headers = { "Idempotency-Key": "order-77" };
    const a = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body, headers });
    const b = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body: { ...body, amount: "0.2500" }, headers });
    expect(b.status).toBe(201);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(b.body).toEqual(a.body);
    expect(await prisma().paymentRequest.count()).toBe(1);

    const c = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body: { ...body, amount: "1" }, headers });
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe("idempotency_conflict");
  });

  it("creates exactly one record under concurrent retries", async () => {
    const { testKey } = await makeProject();
    const headers = { "Idempotency-Key": "race-1" };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body, headers })),
    );
    expect(await prisma().paymentRequest.count()).toBe(1);
    for (const r of results) {
      expect([201, 409]).toContain(r.status);
      if (r.status === 409) expect(r.body.error.code).toBe("idempotency_in_progress");
    }
    expect(results.some((r) => r.status === 201)).toBe(true);
  });
});

describe("project isolation", () => {
  it("never exposes another project's payments", async () => {
    const a = await makeProject();
    const b = await makeProject();
    const created = await call(collection.POST, { method: "POST", path: "/payment-requests", key: a.testKey, body });
    const id = created.body.id;
    expect((await call(one.GET, { path: `/payment-requests/${id}`, key: b.testKey })).status).toBe(404);
    expect((await call(status.GET, { path: `/payment-requests/${id}/status`, key: b.testKey })).status).toBe(404);
    expect((await call(cancel.POST, { method: "POST", path: `/payment-requests/${id}/cancel`, key: b.testKey })).status).toBe(404);
    expect((await call(simulate.POST, { method: "POST", path: `/payment-requests/${id}/simulate`, key: b.testKey, body: { action: "pay" } })).status).toBe(404);
    expect((await call(collection.GET, { path: "/payment-requests", key: b.testKey })).body.data).toHaveLength(0);
    // Same idempotency key in another project is independent.
    const h = { "Idempotency-Key": "shared" };
    const x = await call(collection.POST, { method: "POST", path: "/payment-requests", key: a.testKey, body, headers: h });
    const y = await call(collection.POST, { method: "POST", path: "/payment-requests", key: b.testKey, body: { ...body, amount: "9" }, headers: h });
    expect(x.status).toBe(201);
    expect(y.status).toBe(201);
  });
});

describe("lifecycle, history and outbox", () => {
  it("simulates to confirmation, persists history and queues webhook deliveries", async () => {
    const { testKey, project } = await makeProject();
    await prisma().webhookEndpoint.create({
      data: { id: "we_aaaaaaaaaaaaaaaa", projectId: project.id, url: "https://example.com/hook", secretEncrypted: "x", eventTypes: [] },
    });
    await prisma().webhookEndpoint.create({
      data: { id: "we_bbbbbbbbbbbbbbbb", projectId: project.id, url: "https://example.com/confirmed-only", secretEncrypted: "x", eventTypes: ["payment_request.confirmed"] },
    });
    await prisma().webhookEndpoint.create({
      data: { id: "we_cccccccccccccccc", projectId: project.id, url: "https://example.com/off", secretEncrypted: "x", eventTypes: [], enabled: false },
    });

    const { body: p } = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body });
    const sim = (action: string) => call(simulate.POST, { method: "POST", path: `/payment-requests/${p.id}/simulate`, key: testKey, body: { action } });
    expect((await sim("pay")).body.status).toBe("payment_detected");
    expect((await sim("mine_block")).body.confirmations).toEqual({ observed: 1, required: 3 });
    await sim("mine_block");
    const done = await sim("mine_block");
    expect(done.body.status).toBe("confirmed");

    const s = await call(status.GET, { path: `/payment-requests/${p.id}/status`, key: testKey });
    expect(s.body).toMatchObject({ status: "confirmed", final: true, trust_level: "simulated", amount_received: "0.25000000" });

    const full = await call(one.GET, { path: `/payment-requests/${p.id}`, key: testKey });
    expect(full.body.history.map((h: { status: string }) => h.status)).toEqual(["created", "awaiting_payment", "payment_detected", "confirming", "confirmed"]);

    const events = await prisma().webhookEvent.findMany({ where: { paymentRequestId: p.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual([
      "payment_request.created",
      "payment_request.awaiting_payment",
      "payment_request.payment_detected",
      "payment_request.confirming",
      "payment_request.confirmed",
    ]);
    const deliveries = await prisma().webhookDelivery.findMany({ include: { event: true } });
    expect(deliveries.filter((d) => d.endpointId === "we_aaaaaaaaaaaaaaaa")).toHaveLength(5);
    expect(deliveries.filter((d) => d.endpointId === "we_bbbbbbbbbbbbbbbb").map((d) => d.event.type)).toEqual(["payment_request.confirmed"]);
    expect(deliveries.filter((d) => d.endpointId === "we_cccccccccccccccc")).toHaveLength(0);
    const confirmedPayload = events.at(-1)!.payload as { livemode: boolean; data: { payment_request: { trust_level: string } } };
    expect(confirmedPayload.livemode).toBe(false);
    expect(confirmedPayload.data.payment_request.trust_level).toBe("simulated");
  });

  it("expires overdue requests on read and refuses late simulated payments", async () => {
    const { testKey } = await makeProject();
    const { body: p } = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body: { ...body, expires_in: 60 } });
    await prisma().paymentRequest.update({ where: { id: p.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const s = await call(status.GET, { path: `/payment-requests/${p.id}/status`, key: testKey });
    expect(s.body.status).toBe("expired");
    const late = await call(simulate.POST, { method: "POST", path: `/payment-requests/${p.id}/simulate`, key: testKey, body: { action: "pay" } });
    expect(late.status).toBe(409);
    expect(await prisma().webhookEvent.count({ where: { paymentRequestId: p.id, type: "payment_request.expired" } })).toBe(1);
  });

  it("serialises concurrent transitions without losing any", async () => {
    const { testKey } = await makeProject();
    const { body: p } = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body });
    await call(simulate.POST, { method: "POST", path: `/payment-requests/${p.id}/simulate`, key: testKey, body: { action: "pay" } });
    const results = await Promise.all(
      [1, 2, 3].map(() => call(simulate.POST, { method: "POST", path: `/payment-requests/${p.id}/simulate`, key: testKey, body: { action: "mine_block" } })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const final = await call(one.GET, { path: `/payment-requests/${p.id}`, key: testKey });
    expect(final.body.status).toBe("confirmed");
    const row = await prisma().paymentRequest.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.version).toBe(4);
    expect(await prisma().paymentEvent.count({ where: { paymentRequestId: p.id } })).toBe(5);
  });

  it("cancels only open requests", async () => {
    const { testKey } = await makeProject();
    const { body: p } = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body });
    expect((await call(cancel.POST, { method: "POST", path: `/payment-requests/${p.id}/cancel`, key: testKey })).body.status).toBe("cancelled");
    const again = await call(cancel.POST, { method: "POST", path: `/payment-requests/${p.id}/cancel`, key: testKey });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("invalid_state");
  });
});

describe("listing", () => {
  it("paginates with a stable cursor and filters", async () => {
    const { testKey } = await makeProject();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body })).body.id);
    await call(cancel.POST, { method: "POST", path: `/payment-requests/${ids[0]}/cancel`, key: testKey });

    const p1 = await call(collection.GET, { path: "/payment-requests?limit=2", key: testKey });
    expect(p1.body.data.map((p: { id: string }) => p.id)).toEqual([ids[4], ids[3]]);
    const p2 = await call(collection.GET, { path: `/payment-requests?limit=2&starting_after=${p1.body.next_cursor}`, key: testKey });
    expect(p2.body.data.map((p: { id: string }) => p.id)).toEqual([ids[2], ids[1]]);
    const p3 = await call(collection.GET, { path: `/payment-requests?limit=2&starting_after=${p2.body.next_cursor}`, key: testKey });
    expect(p3.body).toMatchObject({ has_more: false, next_cursor: null });

    const cancelled = await call(collection.GET, { path: "/payment-requests?status=cancelled", key: testKey });
    expect(cancelled.body.data.map((p: { id: string }) => p.id)).toEqual([ids[0]]);
    expect((await call(collection.GET, { path: "/payment-requests?limit=0", key: testKey })).status).toBe(422);
  });
});

describe("rate limits", () => {
  it("limits unauthenticated attempts per client", async () => {
    let last;
    for (let i = 0; i < 31; i++) last = await call(collection.GET, { path: "/payment-requests", key: `ysk_test_${"b".repeat(32)}` });
    expect(last!.status).toBe(429);
    expect(last!.body.error.code).toBe("rate_limited");
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("limits creation per key", async () => {
    const { testKey } = await makeProject();
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body })).status);
    expect(statuses.slice(0, 60).every((s) => s === 201)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});

describe("webhook test endpoint", () => {
  it("requires an endpoint, then queues pending deliveries without claiming success", async () => {
    const { testKey, project } = await makeProject();
    const none = await call(webhookTest.POST, { method: "POST", path: "/webhooks/test", key: testKey });
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe("webhook_endpoint_missing");
    await prisma().webhookEndpoint.create({ data: { id: "we_dddddddddddddddd", projectId: project.id, url: "https://example.com/h", secretEncrypted: "x", eventTypes: [] } });
    const ok = await call(webhookTest.POST, { method: "POST", path: "/webhooks/test", key: testKey });
    expect(ok.status).toBe(202);
    expect(ok.body.deliveries).toEqual([{ id: expect.stringMatching(/^whd_/), endpoint_id: "we_dddddddddddddddd", status: "pending" }]);
  });
});
