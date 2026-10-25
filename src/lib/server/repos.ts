import "server-only";
import type { ListQuery } from "@/lib/api/schemas";
import type { IdempotencyBegin, IdempotencyStore, PaymentRepo, StoredPayment } from "@/lib/payments/store";
import { VersionConflictError } from "@/lib/payments/store";
import type { EvidenceKind, PaymentStatus, StatusEvent } from "@/lib/payments/types";
import { eventTypeFor, paymentEventPayload } from "@/lib/webhooks/events";
import { formatZecFixed } from "@/lib/payments/amount";
import { prefixedId } from "@/lib/utils/ids";
import { Prisma } from "@/generated/prisma/client";
import type { Db, Tx } from "./db";

/**
 * Postgres implementations of the payment service's storage contracts.
 *
 * Writes are transactional and include an outbox: every new status-history
 * entry creates its webhook event and per-endpoint deliveries in the same
 * transaction as the status change. A crash can never record a status
 * change without its event, or an event for a change that rolled back.
 */

const INCLUDE = { events: { orderBy: { seq: "asc" } } } as const;
type Row = Prisma.PaymentRequestGetPayload<{ include: typeof INCLUDE }>;

export function toStored(r: Row): StoredPayment {
  return {
    id: r.id,
    projectId: r.projectId,
    version: r.version,
    diversifierIndex: r.diversifierIndex === null ? null : r.diversifierIndex.toFixed(0),
    amount: formatZecFixed(r.amountZatoshis),
    amount_zatoshis: r.amountZatoshis.toString(),
    currency: "ZEC",
    network: r.network,
    trust_level: r.trustLevel,
    destination: r.destination,
    description: r.description,
    external_reference: r.externalReference,
    metadata: (r.metadata ?? {}) as Record<string, string>,
    status: r.status,
    created_at: r.createdAt.toISOString(),
    expires_at: r.expiresAt.toISOString(),
    payment_uri: r.paymentUri,
    qr_payload: r.qrPayload,
    status_url: `/api/v1/payment-requests/${r.id}/status`,
    confirmations:
      r.confirmationsRequired === null ? null : { observed: r.confirmationsObserved ?? 0, required: r.confirmationsRequired },
    amount_received_zatoshis: r.amountReceivedZatoshis === null ? null : r.amountReceivedZatoshis.toString(),
    transaction_id: r.transactionId,
    updated_at: r.updatedAt.toISOString(),
    history: r.events.map(
      (e): StatusEvent => ({
        status: e.status as PaymentStatus,
        at: e.at.toISOString(),
        evidence: e.evidence as EvidenceKind,
        ...(e.note ? { note: e.note } : {}),
      }),
    ),
  };
}

function mutableColumns(p: StoredPayment) {
  return {
    status: p.status,
    confirmationsObserved: p.confirmations?.observed ?? null,
    confirmationsRequired: p.confirmations?.required ?? null,
    amountReceivedZatoshis: p.amount_received_zatoshis === null ? null : BigInt(p.amount_received_zatoshis),
    transactionId: p.transaction_id,
    updatedAt: new Date(p.updated_at),
  };
}

/** Append history entries from `fromSeq` and their outbox rows. */
async function appendHistory(tx: Tx, p: StoredPayment, fromSeq: number) {
  const entries = p.history.slice(fromSeq);
  if (entries.length === 0) return;
  await tx.paymentEvent.createMany({
    data: entries.map((h, i) => ({
      paymentRequestId: p.id,
      seq: fromSeq + i,
      status: h.status,
      evidence: h.evidence,
      note: h.note ?? null,
      at: new Date(h.at),
    })),
  });

  const endpoints = await tx.webhookEndpoint.findMany({
    where: { projectId: p.projectId, enabled: true },
    select: { id: true, eventTypes: true },
  });
  for (const h of entries) {
    const type = eventTypeFor(h.status);
    const id = prefixedId("evt");
    // The payload snapshots the payment as it is after this whole write.
    const payload = paymentEventPayload(id, type, h.at, p);
    await tx.webhookEvent.create({
      data: { id, projectId: p.projectId, type, paymentRequestId: p.id, payload: payload as unknown as Prisma.InputJsonValue, createdAt: new Date(h.at) },
    });
    const targets = endpoints.filter((e) => e.eventTypes.length === 0 || e.eventTypes.includes(type));
    if (targets.length) {
      await tx.webhookDelivery.createMany({
        data: targets.map((e) => ({ id: prefixedId("whd"), eventId: id, endpointId: e.id, projectId: p.projectId })),
      });
    }
  }
}

export class PrismaPaymentRepo implements PaymentRepo {
  constructor(private readonly prisma: Db) {}

  async insert(p: StoredPayment) {
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentRequest.create({
        data: {
          id: p.id,
          projectId: p.projectId,
          network: p.network,
          trustLevel: p.trust_level,
          amountZatoshis: BigInt(p.amount_zatoshis),
          destination: p.destination,
          description: p.description,
          externalReference: p.external_reference,
          metadata: p.metadata,
          paymentUri: p.payment_uri,
          qrPayload: p.qr_payload,
          diversifierIndex: p.diversifierIndex === null ? null : new Prisma.Decimal(p.diversifierIndex),
          expiresAt: new Date(p.expires_at),
          createdAt: new Date(p.created_at),
          version: 0,
          ...mutableColumns(p),
        },
      });
      await appendHistory(tx, p, 0);
    });
  }

  async get(projectId: string, id: string) {
    const row = await this.prisma.paymentRequest.findFirst({ where: { id, projectId }, include: INCLUDE });
    return row ? toStored(row) : null;
  }

  async save(p: StoredPayment, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentRequest.updateMany({
        where: { id: p.id, projectId: p.projectId, version: expectedVersion },
        data: { ...mutableColumns(p), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new VersionConflictError();
      const stored = await tx.paymentEvent.count({ where: { paymentRequestId: p.id } });
      await appendHistory(tx, p, stored);
      const row = await tx.paymentRequest.findUniqueOrThrow({ where: { id: p.id }, include: INCLUDE });
      return toStored(row);
    });
  }

  async list(projectId: string, q: ListQuery) {
    let cursor: { createdAt: Date; id: string } | null = null;
    if (q.starting_after) {
      const c = await this.prisma.paymentRequest.findFirst({
        where: { id: q.starting_after, projectId },
        select: { createdAt: true, id: true },
      });
      if (!c) return { items: [], hasMore: false };
      cursor = c;
    }
    const rows = await this.prisma.paymentRequest.findMany({
      where: {
        projectId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.network ? { network: q.network } : {}),
        ...(cursor
          ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      include: INCLUDE,
    });
    return { items: rows.slice(0, q.limit).map(toStored), hasMore: rows.length > q.limit };
  }
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: Db) {}

  async begin(projectId: string, key: string, fingerprint: string): Promise<IdempotencyBegin> {
    const now = new Date();
    // Drop an expired record for this key so it can be reused.
    await this.prisma.idempotencyRecord.deleteMany({ where: { projectId, key, expiresAt: { lt: now } } });
    try {
      await this.prisma.idempotencyRecord.create({
        data: { projectId, key, fingerprint, expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS) },
      });
      return { kind: "new" };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
    const row = await this.prisma.idempotencyRecord.findUnique({ where: { projectId_key: { projectId, key } } });
    if (!row) return this.begin(projectId, key, fingerprint); // released concurrently; try again
    if (row.fingerprint !== fingerprint) return { kind: "conflict" };
    if (row.responseCode === null) return { kind: "in_progress" };
    return { kind: "replay", status: row.responseCode, body: row.responseBody };
  }

  async complete(projectId: string, key: string, status: number, body: unknown) {
    await this.prisma.idempotencyRecord.update({
      where: { projectId_key: { projectId, key } },
      data: { responseCode: status, responseBody: body as Prisma.InputJsonValue },
    });
  }

  async release(projectId: string, key: string) {
    await this.prisma.idempotencyRecord.deleteMany({ where: { projectId, key, responseCode: null } });
  }
}
