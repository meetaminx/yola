import "server-only";
import { demoProvider, PaymentService, type NetworkProvider } from "@/lib/payments/service";
import type { Network } from "@/lib/payments/types";
import { db } from "./db";
import { getEnv } from "./env";
import { PrismaIdempotencyStore, PrismaPaymentRepo } from "./repos";

/**
 * The server's PaymentService: the same class the browser simulator runs,
 * with Postgres storage. Webhook events are written by the repository's
 * outbox, so no separate event sink is needed here.
 */

type ProviderFactory = () => NetworkProvider | null;

/** Registered by the testnet adapter module when it is configured (Phase F). */
const extraProviders: Partial<Record<Network, ProviderFactory>> = {};

export function registerNetworkProvider(network: Network, factory: ProviderFactory) {
  extraProviders[network] = factory;
}

export function testnetUnavailableReason(): string {
  const env = getEnv();
  if (!env.YOLA_TESTNET_ENABLED) {
    return "Testnet is disabled on this server. The operator must configure a Zebra node, a Zaino indexer and the Yola scanner, then set YOLA_TESTNET_ENABLED=true.";
  }
  return "The testnet backend is configured but not available. Check the health endpoint.";
}

export function serverPaymentService(): PaymentService {
  const prisma = db();
  const testnet = extraProviders.testnet?.() ?? null;
  return new PaymentService({
    repo: new PrismaPaymentRepo(prisma),
    idempotency: new PrismaIdempotencyStore(prisma),
    providers: { demo: demoProvider, ...(testnet ? { testnet } : {}) },
    unavailableReason: { testnet: testnetUnavailableReason() },
  });
}
