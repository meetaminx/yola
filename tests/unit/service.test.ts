import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { createLocalGateway } from "@/lib/api/local-gateway";
import { dispatchPaymentRoute } from "@/lib/api/router";
import { demoProvider, fingerprint, PaymentService, type RequestContext } from "@/lib/payments/service";
import { MemoryIdempotencyStore, MemoryPaymentRepo, type StoredPayment } from "@/lib/payments/store";
import type { PaymentRequest } from "@/lib/payments/types";
import { parseCreateInput } from "@/lib/api/schemas";

const A: RequestContext = { projectId: "proj_a", allowedNetworks: ["demo", "testnet"] };
const B: RequestContext = { projectId: "proj_b", allowedNetworks: ["demo", "testnet"] };
const body = { amount: "0.25", currency: "ZEC", network: "demo", description: "Order 1" };

function setup(start = new Date("2026-10-25T10:00:00Z")) {
  let now = start;
  const events: string[] = [];
  const service = new PaymentService({
    repo: new MemoryPaymentRepo(),
    idempotency: new MemoryIdempotencyStore(),
    providers: { demo: demoProvider },
    now: () => now,
    events: {
      async statusChanged(p: StoredPayment, prev: number) {
        for (const h of p.history.slice(prev)) events.push(`${p.id}:${h.status}`);
      },
    },
  });
  return { service, events, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

async function expectApiError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({ status, code });
  await promise.catch((e) => expect(e).toBeInstanceOf(ApiError));
}

describe("PaymentService.create", () => {
  it("creates a simulated request with exact amounts", async () => {
    const { service, events } = setup();
    const r = await service.create(A, body, null);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      amount: "0.25000000",
      amount_zatoshis: "25000000",
      network: "demo",
      trust_level: "simulated",
      status: "awaiting_payment",
      payment_uri: null,
      expires_at: "2026-10-25T10:15:00.000Z",
    });
    expect(r.body.id).toMatch(/^pay_demo_[0-9a-z]{20}$/);
    expect(r.body).not.toHaveProperty("projectId");
    expect(events).toEqual([`${r.body.id}:created`, `${r.body.id}:awaiting_payment`]);
  });

  it.each([
    [{ ...body, amount: 0.25 }, "invalid_request", "amount"],
    [{ ...body, amount: "0.123456789" }, "amount_precision", "amount"],
    [{ ...body, currency: "BTC" }, "invalid_request", "currency"],
    [{ ...body, network: "regtest" }, "invalid_request", "network"],
    [{ ...body, extra: 1 }, "invalid_request", "_"],
    [{ ...body, expires_in: 10 }, "invalid_request", "expires_in"],
    [{ ...body, metadata: { "bad key": "x" } }, "invalid_request", "metadata.bad key"],
    [{ ...body, destination: "utest1abc" }, "destination_not_accepted", "destination"],
  ])("rejects %j", async (input, code, field) => {
    const { service } = setup();
    const err = await service.create(A, input, null).catch((e: ApiError) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(code);
    expect((err as ApiError).fields).toHaveProperty([field]);
  });

  it("refuses networks the credential may not use, and unavailable networks", async () => {
    const { service } = setup();
    await expectApiError(service.create(A, { ...body, network: "mainnet" }, null), 403, "network_not_allowed");
    await expectApiError(service.create(A, { ...body, network: "testnet" }, null), 503, "network_unavailable");
    const live: RequestContext = { projectId: "p", allowedNetworks: ["mainnet"] };
    await expectApiError(service.create(live, { ...body, network: "mainnet" }, null), 503, "network_disabled");
  });
});

describe("idempotency", () => {
  it("replays the original response for the same key and equivalent body", async () => {
    const { service } = setup();
    const first = await service.create(A, body, "order-1");
    const again = await service.create(A, { ...body, amount: "0.250" }, "order-1");
    expect(again.replayed).toBe(true);
    expect(again.body).toEqual(first.body);
    const list = await service.list(A, { limit: 10 });
    expect(list.body.data).toHaveLength(1);
  });

  it("returns a conflict when the key is reused with different parameters", async () => {
    const { service } = setup();
    await service.create(A, body, "order-1");
    await expectApiError(service.create(A, { ...body, amount: "0.5" }, "order-1"), 409, "idempotency_conflict");
  });

  it("scopes keys per project", async () => {
    const { service } = setup();
    const a = await service.create(A, body, "same-key");
    const b = await service.create(B, body, "same-key");
    expect(a.body.id).not.toBe(b.body.id);
  });

  it("releases the key when creation fails, so a retry can succeed", async () => {
    const { service } = setup();
    await expectApiError(service.create(A, { ...body, network: "testnet" }, "k"), 503, "network_unavailable");
    const ok = await service.create(A, body, "k");
    expect(ok.status).toBe(201);
  });

  it("rejects malformed keys", async () => {
    const { service } = setup();
    await expectApiError(service.create(A, body, "has space"), 400, "invalid_idempotency_key");
  });

  it("fingerprints meaning, not formatting", async () => {
    const a = await fingerprint(parseCreateInput({ ...body, amount: "0.1" }));
    const b = await fingerprint(parseCreateInput({ description: "Order 1", amount: "0.10", network: "demo", currency: "ZEC" }));
    expect(a).toBe(b);
  });
});

describe("project isolation", () => {
  it("never returns another project's payment", async () => {
    const { service } = setup();
    const { body: p } = await service.create(A, body, null);
    await expectApiError(service.retrieve(B, p.id), 404, "not_found");
    await expectApiError(service.status(B, p.id), 404, "not_found");
    await expectApiError(service.cancel(B, p.id), 404, "not_found");
    await expectApiError(service.simulate(B, p.id, { action: "pay" }), 404, "not_found");
    expect((await service.list(B, { limit: 10 })).body.data).toHaveLength(0);
  });
});

describe("lifecycle through the service", () => {
  it("cancels open requests only", async () => {
    const { service } = setup();
    const { body: p } = await service.create(A, body, null);
    const c = await service.cancel(A, p.id);
    expect(c.body.status).toBe("cancelled");
    await expectApiError(service.cancel(A, p.id), 409, "invalid_state");
  });

  it("expires on read once the deadline passes", async () => {
    const { service, advance, events } = setup();
    const { body: p } = await service.create(A, { ...body, expires_in: 60 }, null);
    advance(59_000);
    expect((await service.status(A, p.id)).body.status).toBe("awaiting_payment");
    advance(1_000);
    const s = await service.status(A, p.id);
    expect(s.body).toMatchObject({ status: "expired", final: true });
    expect(events.at(-1)).toBe(`${p.id}:expired`);
    await expectApiError(service.simulate(A, p.id, { action: "pay" }), 409, "invalid_state");
  });

  it("simulates to confirmation and reports status", async () => {
    const { service } = setup();
    const { body: p } = await service.create(A, body, null);
    await service.simulate(A, p.id, { action: "pay" });
    for (let i = 0; i < 3; i++) await service.simulate(A, p.id, { action: "mine_block" });
    const s = await service.status(A, p.id);
    expect(s.body).toMatchObject({ status: "confirmed", trust_level: "simulated", amount_received: "0.25000000", final: true });
    expect(s.body.transaction_id).toMatch(/^sim_tx_/);
  });

  it("rejects invalid simulator actions", async () => {
    const { service } = setup();
    const { body: p } = await service.create(A, body, null);
    await expectApiError(service.simulate(A, p.id, { action: "mine_block" }), 409, "invalid_state");
    await expectApiError(service.simulate(A, p.id, { action: "teleport" }), 422, "invalid_request");
  });

  it("refuses to simulate non-demo payments even if one is stored", async () => {
    const repo = new MemoryPaymentRepo();
    const service = new PaymentService({ repo, idempotency: new MemoryIdempotencyStore(), providers: {} });
    const p = await demoProvider.create(A, parseCreateInput(body), "pay_testnet_aaaaaaaaaaaaaaaaaaaa", new Date());
    await repo.insert({ ...p, network: "testnet", trust_level: "verified_testnet" });
    await expectApiError(service.simulate(A, p.id, { action: "pay" }), 403, "simulation_not_allowed");
  });
});

describe("listing", () => {
  it("paginates newest first with a cursor", async () => {
    const { service, advance } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await service.create(A, body, null)).body.id);
      advance(1000);
    }
    const page1 = await service.list(A, { limit: 2 });
    expect(page1.body.data.map((p: PaymentRequest) => p.id)).toEqual([ids[4], ids[3]]);
    expect(page1.body.has_more).toBe(true);
    const page2 = await service.list(A, { limit: 2, starting_after: page1.body.next_cursor! });
    expect(page2.body.data.map((p: PaymentRequest) => p.id)).toEqual([ids[2], ids[1]]);
    const page3 = await service.list(A, { limit: 2, starting_after: page2.body.next_cursor! });
    expect(page3.body.data.map((p: PaymentRequest) => p.id)).toEqual([ids[0]]);
    expect(page3.body.has_more).toBe(false);
  });
});

describe("router and local gateway", () => {
  it("routes, returns request IDs and structured errors", async () => {
    const recorded: string[] = [];
    const gw = createLocalGateway({ onEvent: (e) => recorded.push(e.type) });
    const created = await gw.call({ method: "POST", path: "/payment-requests", body, idempotencyKey: "x" });
    expect(created.status).toBe(201);
    expect(created.headers["x-request-id"]).toMatch(/^req_/);
    const replay = await gw.call({ method: "POST", path: "/payment-requests", body, idempotencyKey: "x" });
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    const id = (created.body as PaymentRequest).id;
    const status = await gw.call({ method: "GET", path: `/payment-requests/${id}/status` });
    expect(status.status).toBe(200);
    const missing = await gw.call({ method: "GET", path: "/payment-requests/pay_demo_doesnotexist0000" });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: { code: "not_found", request_id: missing.headers["x-request-id"] } });
    const wrong = await gw.call({ method: "DELETE", path: `/payment-requests/${id}` });
    expect(wrong.status).toBe(405);
    expect(recorded).toEqual(["payment_request.created", "payment_request.awaiting_payment"]);
  });

  it("validates list queries", async () => {
    const { service } = setup();
    await expect(dispatchPaymentRoute(service, A, { method: "GET", path: "/payment-requests?limit=500" })).rejects.toMatchObject({
      code: "invalid_request",
    });
  });
});
