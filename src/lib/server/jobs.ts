import "server-only";
import { prefixedId } from "@/lib/utils/ids";
import { decryptSecret } from "./crypto";
import { db, type Db } from "./db";
import { attemptDelivery, MAX_ATTEMPTS, nextAttemptDelay } from "./deliver";
import { getEnv } from "./env";
import { errorFields, log } from "./log";
import { serverPaymentService } from "./payments";
import { pruneRateLimits } from "./rate-limit";
import { testnetScanner } from "./testnet";
import { runTestnetScan } from "./zcash/scan-job";

/**
 * Background work, run either by an in-process loop (YOLA_JOBS_MODE=inline)
 * or by an external scheduler calling /api/internal/jobs (cron).
 *
 * Deliveries are claimed with FOR UPDATE SKIP LOCKED and a lease, so any
 * number of server instances can run jobs without double-sending; a worker
 * that dies mid-delivery loses its lease and another picks the job up.
 * Delivery is at-least-once: receivers de-duplicate on the event ID.
 */

// Kept on globalThis: instrumentation and route handlers are bundled
// separately, so module-level state would not be shared between them.
type LoopState = {
  lastRunAt: string | null;
  lastScanAt?: number;
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
};
const g = globalThis as unknown as { yolaJobs?: LoopState };
const state: LoopState = (g.yolaJobs ??= { lastRunAt: null, running: false, timer: null });

export function jobLoopState() {
  return { lastRunAt: state.lastRunAt };
}

export interface JobOptions {
  timeoutMs?: number;
  batchSize?: number;
  now?: () => Date;
  /** Run the testnet scan now, ignoring its interval (tests, cron). */
  forceScan?: boolean;
}

export async function webhookSecretFor(endpointId: string, encrypted: string) {
  return decryptSecret(encrypted, `webhook:${endpointId}`);
}

/** Claim up to `batch` due deliveries. */
async function claimDeliveries(prisma: Db, batch: number): Promise<string[]> {
  // Prisma stores DateTime as UTC in "timestamp without time zone" columns, so
  // compare against UTC explicitly. Plain now() would use the server's time zone.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "webhook_delivery" SET "status" = 'delivering', "lockedUntil" = (now() AT TIME ZONE 'UTC') + interval '2 minutes'
    WHERE "id" IN (
      SELECT "id" FROM "webhook_delivery"
      WHERE ("status" = 'pending' AND "nextAttemptAt" <= (now() AT TIME ZONE 'UTC'))
         OR ("status" = 'delivering' AND "lockedUntil" < (now() AT TIME ZONE 'UTC'))
      ORDER BY "nextAttemptAt"
      LIMIT ${batch}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;
  return rows.map((r) => r.id);
}

export async function processDelivery(prisma: Db, deliveryId: string, opts: JobOptions = {}) {
  const env = getEnv();
  const d = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { event: true, endpoint: true } });
  if (!d || d.status !== "delivering") return "skipped" as const;

  if (!d.endpoint.enabled) {
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: { status: "failed", lastError: "Endpoint is disabled.", lockedUntil: null, completedAt: new Date() },
    });
    return "failed" as const;
  }

  const attempt = d.attemptCount + 1;
  const startedAt = new Date();
  const result = await attemptDelivery({
    url: d.endpoint.url,
    secret: await webhookSecretFor(d.endpoint.id, d.endpoint.secretEncrypted),
    body: JSON.stringify(d.event.payload),
    eventId: d.event.id,
    eventType: d.event.type,
    deliveryId: d.id,
    timeoutMs: opts.timeoutMs ?? 10_000,
    policy: { allowPrivate: env.YOLA_WEBHOOK_ALLOW_PRIVATE_NETWORKS },
  });

  const delay = result.ok ? null : nextAttemptDelay(attempt);
  const status = result.ok ? "succeeded" : delay === null || attempt >= MAX_ATTEMPTS ? "failed" : "pending";
  const now = opts.now?.() ?? new Date();
  await prisma.$transaction([
    prisma.webhookAttempt.create({
      data: {
        id: prefixedId("wha"),
        deliveryId: d.id,
        attempt,
        startedAt,
        durationMs: result.durationMs,
        statusCode: result.statusCode,
        error: result.error,
      },
    }),
    prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status,
        attemptCount: attempt,
        lastStatusCode: result.statusCode,
        lastError: result.error,
        lockedUntil: null,
        nextAttemptAt: status === "pending" ? new Date(now.getTime() + (delay ?? 0)) : d.nextAttemptAt,
        completedAt: status === "pending" ? null : now,
      },
    }),
  ]);
  log.info("webhook.attempt", {
    delivery_id: d.id,
    event_id: d.event.id,
    endpoint_id: d.endpoint.id,
    attempt,
    outcome: status,
    status_code: result.statusCode,
    duration_ms: result.durationMs,
  });
  return status;
}

/** Expire open requests whose deadline passed, so their events go out without waiting for a read. */
async function sweepExpired(prisma: Db, limit = 100) {
  // Chain requests only expire once a complete scan pass began after their deadline.
  const cursor = await prisma.chainCursor.findUnique({ where: { network: "testnet" }, select: { observedThrough: true } });
  const now = new Date();
  const due = await prisma.paymentRequest.findMany({
    where: {
      status: { in: ["awaiting_payment", "underpaid"] },
      expiresAt: { lt: now },
      OR: [
        { network: "demo" },
        ...(cursor?.observedThrough ? [{ network: "testnet" as const, expiresAt: { lte: cursor.observedThrough } }] : []),
      ],
    },
    select: { id: true, projectId: true },
    take: limit,
  });
  const service = serverPaymentService();
  for (const p of due) {
    await service.status({ projectId: p.projectId, allowedNetworks: ["demo", "testnet", "mainnet"] }, p.id).catch((err) =>
      log.warn("jobs.expire_failed", { payment_request_id: p.id, ...errorFields(err) }),
    );
  }
  return due.length;
}

let runs = 0;

const SCAN_INTERVAL_MS = 10_000;

/** Testnet blocks arrive about every 75 s; scanning every 10 s keeps mempool detection prompt. */
async function maybeScanTestnet(prisma: Db, opts: JobOptions) {
  const scanner = testnetScanner();
  if (!scanner) return null;
  const now = Date.now();
  if (!opts.forceScan && state.lastScanAt && now - state.lastScanAt < SCAN_INTERVAL_MS) return null;
  state.lastScanAt = now;
  return runTestnetScan(prisma, scanner).catch((err) => {
    log.error("scan.failed", errorFields(err));
    return null;
  });
}

export async function runJobsOnce(opts: JobOptions = {}) {
  const prisma = db();
  const ids = await claimDeliveries(prisma, opts.batchSize ?? 20);
  const outcomes = await Promise.all(ids.map((id) => processDelivery(prisma, id, opts).catch((err) => {
    log.error("webhook.process_failed", { delivery_id: id, ...errorFields(err) });
    return "error" as const;
  })));
  const scan = await maybeScanTestnet(prisma, opts);
  const expired = await sweepExpired(prisma);
  if (runs++ % 30 === 0) {
    await pruneRateLimits(prisma);
    await prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
  state.lastRunAt = new Date().toISOString();
  return {
    deliveries: ids.length,
    succeeded: outcomes.filter((o) => o === "succeeded").length,
    retrying: outcomes.filter((o) => o === "pending").length,
    failed: outcomes.filter((o) => o === "failed").length,
    expired,
    scan,
  };
}

/** Start the in-process loop (idempotent). Called from instrumentation on server start. */
export function startInlineJobLoop(intervalMs = 2000) {
  if (state.timer) return;
  state.timer = setInterval(async () => {
    if (state.running) return;
    state.running = true;
    try {
      await runJobsOnce();
    } catch (err) {
      log.error("jobs.run_failed", errorFields(err));
    } finally {
      state.running = false;
    }
  }, intervalMs);
  state.timer.unref?.();
  log.info("jobs.inline_loop_started", { interval_ms: intervalMs });
}
