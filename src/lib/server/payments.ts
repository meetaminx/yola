import "server-only";
import { demoProvider, PaymentService } from "@/lib/payments/service";
import { db } from "./db";
import { getEnv } from "./env";
import { PrismaIdempotencyStore, PrismaPaymentRepo } from "./repos";
import { testnetProvider, testnetScanner } from "./testnet";

/**
 * The server's PaymentService: the same class the browser simulator runs,
 * with Postgres storage. Webhook events are written by the repository's
 * outbox, so no separate event sink is needed here.
 */

export function testnetUnavailableReason(): string {
  const env = getEnv();
  if (!env.YOLA_TESTNET_ENABLED) {
    return "Testnet is disabled on this server. The operator must run the Yola scanner against a testnet lightwalletd or Zaino server, then set YOLA_TESTNET_ENABLED=true.";
  }
  return "The testnet backend is configured but not available. Check the health endpoint.";
}

export function serverPaymentService(): PaymentService {
  const prisma = db();
  const scanner = testnetScanner();
  return new PaymentService({
    repo: new PrismaPaymentRepo(prisma),
    idempotency: new PrismaIdempotencyStore(prisma),
    providers: { demo: demoProvider, ...(scanner ? { testnet: testnetProvider(prisma, scanner) } : {}) },
    unavailableReason: { testnet: testnetUnavailableReason() },
    observedThrough: async (network) => {
      if (network === "demo") return new Date();
      const cursor = await prisma.chainCursor.findUnique({ where: { network }, select: { observedThrough: true } });
      return cursor?.observedThrough ?? null;
    },
  });
}
