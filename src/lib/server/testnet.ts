import "server-only";
import { ApiError } from "@/lib/api/errors";
import { EXPIRES_IN_DEFAULT } from "@/lib/api/schemas";
import { formatZecFixed } from "@/lib/payments/amount";
import { applyTransition } from "@/lib/payments/lifecycle";
import type { NetworkProvider } from "@/lib/payments/service";
import type { StoredPayment } from "@/lib/payments/store";
import { prefixedId } from "@/lib/utils/ids";
import { buildZip321Uri } from "@/lib/zcash/zip321";
import { Prisma } from "@/generated/prisma/client";
import { decryptSecret, encryptSecret } from "./crypto";
import type { Db } from "./db";
import { getEnv } from "./env";
import { errorFields, log } from "./log";
import { createScannerClient, ScannerError, ScannerUnavailableError, type ScannerApi } from "./zcash/scanner-client";

/**
 * Zcash testnet adapter.
 *
 * - The merchant gives Yola a unified viewing key. Only its incoming part
 *   (UIVK) is kept, encrypted at rest. It can find payments to the merchant
 *   but cannot spend, so Yola never has custody of funds.
 * - Each request gets its own shielded address, derived from the UIVK at a
 *   fresh diversifier index. Funds go straight to the merchant's wallet;
 *   the index identifies which request a decrypted output pays.
 * - The scanner (scanner/) does the cryptography with the official Zcash
 *   crates; this module never sees a spending key or seed.
 */

const g = globalThis as unknown as { yolaScannerOverride?: ScannerApi | null };

/** Tests substitute a fake scanner here. Pass undefined to restore the environment's. */
export function setScannerForTesting(scanner: ScannerApi | null | undefined) {
  g.yolaScannerOverride = scanner;
}

export function testnetScanner(): ScannerApi | null {
  if (g.yolaScannerOverride !== undefined) return g.yolaScannerOverride;
  const env = getEnv();
  if (!env.YOLA_TESTNET_ENABLED || !env.ZCASH_BACKEND_URL) return null;
  return createScannerClient({ baseUrl: env.ZCASH_BACKEND_URL, token: env.ZCASH_BACKEND_AUTH_TOKEN ?? "" });
}

export function viewingKeyAad(projectId: string) {
  return `viewing-key:${projectId}:testnet`;
}

/**
 * Yola's diversifier indices start at a random point between 2^40 and 2^48
 * per key, far from the low indices wallets hand out themselves. A payment to
 * the merchant's ordinary wallet address therefore never matches a request.
 */
export function initialDiversifierIndex(random: () => bigint = randomU64): bigint {
  return (1n << 40n) + (random() % ((1n << 48n) - (1n << 40n)));
}

function randomU64(): bigint {
  const b = new BigUint64Array(1);
  globalThis.crypto.getRandomValues(b);
  return b[0]!;
}

export async function testnetHealth(): Promise<"available" | "unreachable" | "not_configured"> {
  const scanner = testnetScanner();
  if (!scanner) return "not_configured";
  const h = await scanner.health();
  if (h.status !== "ok") {
    log.warn("testnet.health_failed", { status: h.status });
    return "unreachable";
  }
  return "available";
}

function unavailable(err: unknown): never {
  if (err instanceof ScannerUnavailableError) {
    log.error("testnet.scanner_unavailable", errorFields(err));
    throw new ApiError(503, "network_unavailable", "The testnet backend is not reachable right now. Retry shortly.", undefined, {
      "Retry-After": "30",
    });
  }
  throw err;
}

export function testnetProvider(prisma: Db, scanner: ScannerApi): NetworkProvider {
  return {
    network: "testnet",
    async create(ctx, input, id, now) {
      let key = await prisma.viewingKey.findUnique({ where: { projectId_network: { projectId: ctx.projectId, network: "testnet" } } });
      if (!key) {
        throw new ApiError(
          409,
          "viewing_key_required",
          "This project has no testnet viewing key. Add one under Dashboard, Settings before creating testnet requests.",
        );
      }
      const uivk = decryptSecret(key.encryptedKey, viewingKeyAad(ctx.projectId));

      // Reserve an index: derive at the cursor, then advance it only if nobody else did meanwhile.
      let derived: { address: string; index: string } | null = null;
      for (let attempt = 0; attempt < 5 && !derived; attempt++) {
        const start = key.nextDiversifierIndex.toFixed(0);
        const candidate = await scanner.deriveAddress(uivk, start).catch(unavailable);
        const claimed = await prisma.viewingKey.updateMany({
          where: { id: key.id, nextDiversifierIndex: key.nextDiversifierIndex },
          data: { nextDiversifierIndex: new Prisma.Decimal(candidate.index).plus(1) },
        });
        if (claimed.count === 1) derived = candidate;
        else key = await prisma.viewingKey.findUniqueOrThrow({ where: { id: key.id } });
      }
      if (!derived) throw new ApiError(409, "invalid_state", "Too many requests were created at once. Retry.", undefined, { "Retry-After": "1" });

      const uri = buildZip321Uri({
        address: derived.address,
        network: "testnet",
        amountZatoshis: input.amountZatoshis,
        ...(input.description ? { message: input.description } : {}),
      });
      if (!uri.ok) {
        log.error("testnet.zip321_failed", { code: uri.code });
        throw new ApiError(500, "internal_error", "Could not build a payment URI for the derived address.");
      }

      const created: StoredPayment = {
        id,
        projectId: ctx.projectId,
        version: 0,
        diversifierIndex: derived.index,
        amount: formatZecFixed(input.amountZatoshis),
        amount_zatoshis: input.amountZatoshis.toString(),
        currency: "ZEC",
        network: "testnet",
        trust_level: "verified_testnet",
        destination: derived.address,
        description: input.description?.trim() || null,
        external_reference: input.external_reference ?? null,
        metadata: input.metadata ?? {},
        status: "created",
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + (input.expires_in ?? EXPIRES_IN_DEFAULT) * 1000).toISOString(),
        payment_uri: uri.uri,
        qr_payload: uri.uri,
        status_url: `/api/v1/payment-requests/${id}/status`,
        confirmations: null,
        amount_received_zatoshis: null,
        transaction_id: null,
        updated_at: now.toISOString(),
        history: [{ status: "created", at: now.toISOString(), evidence: "request_created" }],
      };
      return applyTransition(created, "awaiting_payment", "request_created", now, "Watching testnet for payments");
    },
  };
}

export type ViewingKeySaveResult =
  | { ok: true; fingerprint: string; firstAddress: string; wasFullViewingKey: boolean }
  | { ok: false; code: string; message: string };

/** Validate a pasted viewing key with the scanner and store only its encrypted UIVK. */
export async function saveViewingKey(prisma: Db, scanner: ScannerApi, projectId: string, pasted: string): Promise<ViewingKeySaveResult> {
  let inspected;
  try {
    inspected = await scanner.inspectKey(pasted);
  } catch (err) {
    if (err instanceof ScannerError) return { ok: false, code: err.code, message: err.message };
    if (err instanceof ScannerUnavailableError) {
      return { ok: false, code: "network_unavailable", message: "The testnet scanner is not reachable. Try again shortly." };
    }
    throw err;
  }
  const existing = await prisma.viewingKey.findUnique({ where: { projectId_network: { projectId, network: "testnet" } } });
  if (existing) {
    return { ok: false, code: "already_configured", message: "This project already has a testnet viewing key. Remove it first." };
  }
  const tip = await scanner.health();
  await prisma.viewingKey.create({
    data: {
      id: prefixedId("vk"),
      projectId,
      network: "testnet",
      encryptedKey: encryptSecret(inspected.uivk, viewingKeyAad(projectId)),
      fingerprint: inspected.fingerprint,
      nextDiversifierIndex: new Prisma.Decimal(initialDiversifierIndex().toString()),
      birthdayHeight: tip.tip_height ?? null,
    },
  });
  return { ok: true, fingerprint: inspected.fingerprint, firstAddress: inspected.first_address, wasFullViewingKey: inspected.was_full_viewing_key };
}
