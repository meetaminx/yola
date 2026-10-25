import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { RequestContext } from "@/lib/payments/service";
import type { Network } from "@/lib/payments/types";
import { prefixedId, randomToken } from "@/lib/utils/ids";
import type { ApiKeyMode } from "@/generated/prisma/client";
import { sha256Hex } from "./crypto";
import type { Db } from "./db";

/**
 * API keys: ysk_<mode>_<32 random chars> (160 bits from the CSPRNG).
 * Only a SHA-256 hash is stored. A key with this much entropy does not need
 * a slow hash: brute-forcing 2^160 is infeasible, and a fast hash keeps the
 * lookup a single indexed query.
 */

const KEY_PATTERN = /^ysk_(test|live)_[0-9a-z]{32}$/;

/** Which networks each kind of key may use. */
export const NETWORKS_FOR_MODE: Record<ApiKeyMode, readonly Network[]> = {
  test: ["demo", "testnet"],
  live: ["mainnet"],
};

export interface CreatedKey {
  id: string;
  /** Shown to the user exactly once. */
  secret: string;
  last4: string;
}

export async function createApiKey(
  prisma: Db,
  input: { projectId: string; name: string; mode: ApiKeyMode; createdById: string },
): Promise<CreatedKey> {
  const secret = `ysk_${input.mode}_${randomToken(32)}`;
  const id = prefixedId("key", 16);
  const last4 = secret.slice(-4);
  await prisma.apiKey.create({
    data: { id, projectId: input.projectId, name: input.name, mode: input.mode, secretHash: sha256Hex(secret), last4, createdById: input.createdById },
  });
  return { id, secret, last4 };
}

export interface ApiKeyContext extends RequestContext {
  apiKeyId: string;
  mode: ApiKeyMode;
}

/** Resolve an Authorization header to a project context, or throw 401. */
export async function authenticateApiKey(prisma: Db, authorization: string | null): Promise<ApiKeyContext> {
  if (!authorization) {
    throw new ApiError(401, "unauthenticated", "Send your secret key as: Authorization: Bearer ysk_test_...", undefined, {
      "WWW-Authenticate": 'Bearer realm="yola"',
    });
  }
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  const secret = match?.[1] ?? "";
  if (!KEY_PATTERN.test(secret)) {
    throw new ApiError(401, "invalid_api_key", "The API key is malformed. Keys look like ysk_test_ followed by 32 characters.", undefined, {
      "WWW-Authenticate": 'Bearer realm="yola", error="invalid_token"',
    });
  }
  const key = await prisma.apiKey.findUnique({ where: { secretHash: sha256Hex(secret) } });
  if (!key) {
    throw new ApiError(401, "invalid_api_key", "The API key is not recognised.", undefined, {
      "WWW-Authenticate": 'Bearer realm="yola", error="invalid_token"',
    });
  }
  if (key.revokedAt) {
    throw new ApiError(401, "api_key_revoked", "This API key was revoked. Create a new key in the dashboard.", undefined, {
      "WWW-Authenticate": 'Bearer realm="yola", error="invalid_token"',
    });
  }
  // Record usage at most once a minute per key, to avoid a write per request.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { projectId: key.projectId, allowedNetworks: NETWORKS_FOR_MODE[key.mode], apiKeyId: key.id, mode: key.mode };
}

export function maskKey(mode: ApiKeyMode, last4: string) {
  return `ysk_${mode}_...${last4}`;
}
