import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Server-side request forgery protection for webhook destinations.
 *
 * 1. Validate the URL shape (https only, no credentials, sane length).
 * 2. Resolve the hostname and require EVERY address to be public.
 * 3. Connect to the address that was checked (see deliver.ts), so a DNS
 *    answer that changes between check and connect (rebinding) cannot
 *    redirect the request to an internal service.
 * Redirects are never followed.
 */

const blocked = new BlockList();
// IPv4 special-purpose ranges (RFC 6890 and friends)
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, includes cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
// IPv6 special-purpose ranges
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["fd00:ec2::254", 128], // AWS IMDS over IPv6
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** Extract an embedded IPv4 address from IPv4-mapped, -compatible or NAT64 IPv6 forms. */
function embeddedV4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const a = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return null;
}

export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family === 6) {
    const v4 = embeddedV4(ip);
    if (v4) return isPublicIp(v4);
    return !blocked.check(ip, "ipv6");
  }
  return false;
}

export class UnsafeUrlError extends Error {}

export interface UrlPolicy {
  /** Development only: allow http:// and private/loopback destinations. */
  allowPrivate: boolean;
}

const BLOCKED_HOSTNAMES = /^(localhost|localhost\.localdomain|metadata\.google\.internal|metadata)$|\.(localhost|internal|local)$/i;

/** Static checks that need no network. */
export function checkUrlShape(raw: string, policy: UrlPolicy): URL {
  if (raw.length > 2048) throw new UnsafeUrlError("The URL is longer than 2048 characters.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Enter a full URL, starting with https://");
  }
  if (url.protocol !== "https:" && !(policy.allowPrivate && url.protocol === "http:")) {
    throw new UnsafeUrlError("Webhook URLs must use https://");
  }
  if (url.username || url.password) throw new UnsafeUrlError("Remove the username and password from the URL.");
  if (url.hash) throw new UnsafeUrlError("Remove the #fragment from the URL.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!policy.allowPrivate) {
    if (BLOCKED_HOSTNAMES.test(host)) throw new UnsafeUrlError("That host is not reachable from the internet.");
    if (isIP(host) && !isPublicIp(host)) throw new UnsafeUrlError("Private, loopback and link-local addresses are not allowed.");
  }
  return url;
}

export interface ResolvedTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

/** Resolve and require every address to be public. Returns the address to connect to. */
export async function resolveSafeTarget(raw: string, policy: UrlPolicy): Promise<ResolvedTarget> {
  const url = checkUrlShape(raw, policy);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(host);
  const addresses = literal
    ? [{ address: host, family: literal as 4 | 6 }]
    : await lookup(host, { all: true, verbatim: true }).catch(() => {
        throw new UnsafeUrlError(`The host ${host} could not be resolved.`);
      });
  if (addresses.length === 0) throw new UnsafeUrlError(`The host ${host} has no addresses.`);
  if (!policy.allowPrivate) {
    const bad = addresses.find((a) => !isPublicIp(a.address));
    if (bad) throw new UnsafeUrlError("The host resolves to a private or reserved address, which is not allowed.");
  }
  const first = addresses[0];
  return { url, address: first.address, family: first.family as 4 | 6 };
}
