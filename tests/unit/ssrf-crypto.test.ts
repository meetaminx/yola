import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { nextAttemptDelay, RETRY_DELAYS_MS } from "@/lib/server/deliver";
import { redact } from "@/lib/server/log";
import { checkUrlShape, isPublicIp, resolveSafeTarget, UnsafeUrlError } from "@/lib/server/ssrf";

const strict = { allowPrivate: false };

describe("isPublicIp", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "fd00:ec2::254", "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::10.0.0.1",
  ])("blocks %s", (ip) => expect(isPublicIp(ip)).toBe(false));

  it.each(["1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) =>
    expect(isPublicIp(ip)).toBe(true),
  );

  it("rejects non-IPs", () => expect(isPublicIp("example.com")).toBe(false));
});

describe("webhook URL checks", () => {
  it.each([
    ["http://example.com/hook", /https/],
    ["https://user:pw@example.com/", /username/],
    ["https://localhost/hook", /not reachable/],
    ["https://metadata.google.internal/", /not reachable/],
    ["https://169.254.169.254/latest/meta-data", /Private/],
    ["https://[::1]/hook", /Private/],
    ["https://10.0.0.5:8443/x", /Private/],
    ["https://example.com/#frag", /fragment/],
    ["not a url", /full URL/],
  ])("rejects %s", (url, msg) => {
    expect(() => checkUrlShape(url, strict)).toThrow(UnsafeUrlError);
    expect(() => checkUrlShape(url, strict)).toThrow(msg);
  });

  it("accepts a normal https URL", () => {
    expect(checkUrlShape("https://shop.example.com/api/webhooks/yola?x=1", strict).hostname).toBe("shop.example.com");
  });

  it("allows private destinations only when explicitly permitted (development)", async () => {
    await expect(resolveSafeTarget("http://127.0.0.1:9/x", strict)).rejects.toThrow(UnsafeUrlError);
    await expect(resolveSafeTarget("http://127.0.0.1:9/x", { allowPrivate: true })).resolves.toMatchObject({ address: "127.0.0.1", family: 4 });
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    // "localhost" style names are blocked by name; a resolving name pointing at loopback is blocked by address.
    await expect(resolveSafeTarget("https://127.0.0.1.nip.io.invalid/", strict)).rejects.toThrow(UnsafeUrlError);
  });
});

describe("secret encryption", () => {
  const key = randomBytes(32);
  it("round-trips and binds ciphertext to its owner", () => {
    const c = encryptSecret("whsec_abc", "webhook:we_1", key);
    expect(c).not.toContain("whsec_abc");
    expect(c.startsWith("v1.")).toBe(true);
    expect(decryptSecret(c, "webhook:we_1", key)).toBe("whsec_abc");
    expect(() => decryptSecret(c, "webhook:we_2", key)).toThrow();
    expect(() => decryptSecret(c, "webhook:we_1", randomBytes(32))).toThrow();
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("x", "a", key)).not.toBe(encryptSecret("x", "a", key));
  });
});

describe("retry schedule", () => {
  it("backs off with jitter and stops", () => {
    expect(nextAttemptDelay(1, () => 0.5)).toBe(60_000);
    expect(nextAttemptDelay(2, () => 0)).toBe(Math.round(5 * 60_000 * 0.9));
    expect(nextAttemptDelay(RETRY_DELAYS_MS.length + 1)).toBeNull();
  });
});

describe("log redaction", () => {
  it("removes credentials by key name and inside text", () => {
    expect(
      redact({ authorization: "Bearer x", nested: { webhook_secret: "s", ok: 1 }, msg: "used ysk_test_abcdefghijklmnopqrstuvwxyz012345 and whsec_abc" }),
    ).toEqual({ authorization: "[redacted]", nested: { webhook_secret: "[redacted]", ok: 1 }, msg: "used ysk_test_[redacted] and whsec_[redacted]" });
  });
});
