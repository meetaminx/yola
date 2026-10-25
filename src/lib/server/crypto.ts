import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEnv } from "./env";

/**
 * Symmetric encryption for secrets Yola must be able to read back
 * (webhook signing secrets, viewing keys). AES-256-GCM with a random
 * 96-bit IV per value. Format: "v1.<iv>.<ciphertext>.<tag>" (base64url).
 * The associated data binds a ciphertext to its purpose and owner, so a
 * value copied into another row fails to decrypt.
 */

function key(): Buffer {
  return Buffer.from(getEnv().YOLA_ENCRYPTION_KEY, "base64");
}

export function encryptSecret(plaintext: string, associatedData: string, keyOverride?: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOverride ?? key(), iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptSecret(value: string, associatedData: string, keyOverride?: Buffer): string {
  const [version, iv, ct, tag] = value.split(".");
  if (version !== "v1" || !iv || !ct || !tag) throw new Error("Unrecognised ciphertext format.");
  const decipher = createDecipheriv("aes-256-gcm", keyOverride ?? key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
