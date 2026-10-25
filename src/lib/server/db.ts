import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "./env";

/**
 * One Prisma client per server process (reused across hot reloads in dev).
 * Created lazily so importing this module never needs a database.
 */
const globalForPrisma = globalThis as unknown as { yolaPrisma?: PrismaClient };

export function db(): PrismaClient {
  if (!globalForPrisma.yolaPrisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    globalForPrisma.yolaPrisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.yolaPrisma;
}

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
