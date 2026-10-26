import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as collection from "@/app/api/v1/payment-requests/route";
import * as cron from "@/app/api/internal/jobs/route";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { attemptDelivery, MAX_ATTEMPTS } from "@/lib/server/deliver";
import { resetEnvCache } from "@/lib/server/env";
import { runJobsOnce } from "@/lib/server/jobs";
import { verifySignature } from "@/lib/webhooks/signature";
import { call, makeProject, prisma, resetDb } from "./fixtures";

type Received = { headers: IncomingMessage["headers"]; body: string };
let server: Server;
let base = "";
let received: Received[] = [];
let respond: (req: IncomingMessage) => { status: number; delayMs?: number; headers?: Record<string, string> } = () => ({ status: 200 });

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      const r = respond(req);
      setTimeout(() => {
        res.writeHead(r.status, r.headers);
        res.end("ok");
      }, r.delayMs ?? 0);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(async () => {
  await resetDb();
  received = [];
  respond = () => ({ status: 200 });
});

const SECRET = "whsec_0123456789abcdefghjkmnpqrstv";
const body = { amount: "0.1", currency: "ZEC", network: "demo" };

async function endpoint(projectId: string, opts: { id?: string; path?: string; enabled?: boolean } = {}) {
  const id = opts.id ?? "we_endpoint00000001";
  await prisma().webhookEndpoint.create({
    data: { id, projectId, url: `${base}${opts.path ?? "/hook"}`, secretEncrypted: encryptSecret(SECRET, `webhook:${id}`), eventTypes: [], enabled: opts.enabled ?? true },
  });
  return id;
}

describe("webhook delivery", () => {
  it("delivers signed events that verify with the endpoint secret", async () => {
    const { project, testKey } = await makeProject();
    await endpoint(project.id);
    const { body: p } = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body });
    const r = await runJobsOnce();
    expect(r).toMatchObject({ deliveries: 2, succeeded: 2 });
    expect(received).toHaveLength(2);
    for (const msg of received) {
      const verified = verifySignature({ secret: SECRET, rawBody: msg.body, header: msg.headers["yola-signature"] as string });
      expect(verified.valid).toBe(true);
      const event = JSON.parse(msg.body);
      expect(msg.headers["yola-event-id"]).toBe(event.id);
      expect(event.data.payment_request.id).toBe(p.id);
      expect(event.data.payment_request.trust_level).toBe("simulated");
      expect(event.livemode).toBe(false);
    }
    expect(received.map((m) => JSON.parse(m.body).type).sort()).toEqual(["payment_request.awaiting_payment", "payment_request.created"]);
    const deliveries = await prisma().webhookDelivery.findMany({ include: { attempts: true } });
    expect(deliveries.every((d) => d.status === "succeeded" && d.attemptCount === 1 && d.attempts[0].statusCode === 200)).toBe(true);
    // Nothing is left to deliver.
    expect((await runJobsOnce()).deliveries).toBe(0);
  });

  it("retries failures with backoff, then succeeds", async () => {
    const { project } = await makeProject();
    await endpoint(project.id);
    await prisma().webhookEvent.create({ data: { id: "evt_x", projectId: project.id, type: "webhook.test", payload: { id: "evt_x" } } });
    await prisma().webhookDelivery.create({ data: { id: "whd_x", eventId: "evt_x", endpointId: "we_endpoint00000001", projectId: project.id } });

    respond = () => ({ status: 500 });
    const before = Date.now();
    await runJobsOnce();
    let d = await prisma().webhookDelivery.findUniqueOrThrow({ where: { id: "whd_x" } });
    expect(d).toMatchObject({ status: "pending", attemptCount: 1, lastStatusCode: 500 });
    const wait = d.nextAttemptAt.getTime() - before;
    expect(wait).toBeGreaterThan(50_000);
    expect(wait).toBeLessThan(70_000);
    expect((await runJobsOnce()).deliveries).toBe(0); // not due yet

    await prisma().webhookDelivery.update({ where: { id: "whd_x" }, data: { nextAttemptAt: new Date(Date.now() - 1) } });
    respond = () => ({ status: 204 });
    await runJobsOnce();
    d = await prisma().webhookDelivery.findUniqueOrThrow({ where: { id: "whd_x" } });
    expect(d).toMatchObject({ status: "succeeded", attemptCount: 2, lastStatusCode: 204 });
    expect(await prisma().webhookAttempt.count({ where: { deliveryId: "whd_x" } })).toBe(2);
  });

  it("gives up after the last attempt", async () => {
    const { project } = await makeProject();
    await endpoint(project.id);
    await prisma().webhookEvent.create({ data: { id: "evt_y", projectId: project.id, type: "webhook.test", payload: {} } });
    await prisma().webhookDelivery.create({ data: { id: "whd_y", eventId: "evt_y", endpointId: "we_endpoint00000001", projectId: project.id, attemptCount: MAX_ATTEMPTS - 1 } });
    respond = () => ({ status: 503 });
    await runJobsOnce();
    const d = await prisma().webhookDelivery.findUniqueOrThrow({ where: { id: "whd_y" } });
    expect(d).toMatchObject({ status: "failed", attemptCount: MAX_ATTEMPTS });
    expect(d.completedAt).not.toBeNull();
  });

  it("does not follow redirects", async () => {
    respond = () => ({ status: 302, headers: { Location: "http://169.254.169.254/" } });
    const r = await attemptDelivery({ url: `${base}/r`, secret: SECRET, body: "{}", eventId: "e", eventType: "t", deliveryId: "d", timeoutMs: 2000, policy: { allowPrivate: true } });
    expect(r).toMatchObject({ ok: false, statusCode: 302 });
    expect(r.error).toMatch(/Redirects are not followed/);
    expect(received).toHaveLength(1);
  });

  it("times out slow endpoints", async () => {
    respond = () => ({ status: 200, delayMs: 1500 });
    const r = await attemptDelivery({ url: `${base}/slow`, secret: SECRET, body: "{}", eventId: "e", eventType: "t", deliveryId: "d", timeoutMs: 300, policy: { allowPrivate: true } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No response within/);
  });

  it("blocks internal destinations unless private networks are allowed", async () => {
    const r = await attemptDelivery({ url: `${base}/hook`, secret: SECRET, body: "{}", eventId: "e", eventType: "t", deliveryId: "d", timeoutMs: 1000, policy: { allowPrivate: false } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^Blocked:/);
    expect(received).toHaveLength(0);
  });

  it("marks deliveries to disabled endpoints as failed without sending", async () => {
    const { project, testKey } = await makeProject();
    await endpoint(project.id, { enabled: true });
    await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body });
    await prisma().webhookEndpoint.updateMany({ data: { enabled: false } });
    await runJobsOnce();
    expect(received).toHaveLength(0);
    const ds = await prisma().webhookDelivery.findMany();
    expect(ds.every((d) => d.status === "failed" && d.lastError === "Endpoint is disabled.")).toBe(true);
  });

  it("never double-sends when two workers run at once", async () => {
    const { project, testKey } = await makeProject();
    await endpoint(project.id);
    for (let i = 0; i < 4; i++) await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body });
    const [a, b] = await Promise.all([runJobsOnce(), runJobsOnce()]);
    expect(a.deliveries + b.deliveries).toBe(8);
    expect(received).toHaveLength(8);
    expect(new Set(received.map((m) => m.headers["yola-delivery-id"])).size).toBe(8);
  });

  it("expires overdue payments in the sweep and delivers the event", async () => {
    const { project, testKey } = await makeProject();
    await endpoint(project.id);
    const { body: p } = await call(collection.POST, { method: "POST", path: "/payment-requests", key: testKey, body: { ...body, expires_in: 60 } });
    await runJobsOnce();
    received = [];
    await prisma().paymentRequest.update({ where: { id: p.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await runJobsOnce();
    expect(r.expired).toBe(1);
    await runJobsOnce();
    expect(received.map((m) => JSON.parse(m.body).type)).toEqual(["payment_request.expired"]);
  });

  it("stores signing secrets encrypted and bound to their endpoint", async () => {
    const { project } = await makeProject();
    const id = await endpoint(project.id);
    const row = await prisma().webhookEndpoint.findUniqueOrThrow({ where: { id } });
    expect(row.secretEncrypted).not.toContain(SECRET);
    expect(decryptSecret(row.secretEncrypted, `webhook:${id}`)).toBe(SECRET);
    expect(() => decryptSecret(row.secretEncrypted, "webhook:we_other")).toThrow();
  });
});

describe("cron endpoint", () => {
  it("requires the cron secret", async () => {
    process.env.YOLA_CRON_SECRET = "c".repeat(40);
    process.env.YOLA_JOBS_MODE = "cron";
    resetEnvCache();
    try {
      const no = await cron.POST(new Request("http://localhost/api/internal/jobs", { method: "POST" }));
      expect(no.status).toBe(401);
      const bad = await cron.POST(new Request("http://localhost/api/internal/jobs", { method: "POST", headers: { Authorization: `Bearer ${"d".repeat(40)}` } }));
      expect(bad.status).toBe(401);
      const ok = await cron.POST(new Request("http://localhost/api/internal/jobs", { method: "POST", headers: { Authorization: `Bearer ${"c".repeat(40)}` } }));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ deliveries: 0 });
    } finally {
      delete process.env.YOLA_CRON_SECRET;
      process.env.YOLA_JOBS_MODE = "off";
      resetEnvCache();
    }
  });

  it("accepts Vercel Cron's GET with CRON_SECRET", async () => {
    process.env.CRON_SECRET = "v".repeat(40);
    process.env.YOLA_JOBS_MODE = "cron";
    resetEnvCache();
    try {
      const no = await cron.GET(new Request("http://localhost/api/internal/jobs"));
      expect(no.status).toBe(401);
      const ok = await cron.GET(new Request("http://localhost/api/internal/jobs", { headers: { Authorization: `Bearer ${"v".repeat(40)}` } }));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ deliveries: 0, expired: 0 });
    } finally {
      delete process.env.CRON_SECRET;
      process.env.YOLA_JOBS_MODE = "off";
      resetEnvCache();
    }
  });
});
