import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createScannerClient, ScannerError, ScannerUnavailableError } from "@/lib/server/zcash/scanner-client";

/** The HTTP client against a local server speaking the scanner's contract. */

let server: Server;
let base = "";
let reply: (path: string, auth: string | undefined, body: string) => { status: number; json: unknown } = () => ({ status: 200, json: {} });
const seen: { path: string; body: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", body });
      const r = reply(req.url ?? "", req.headers.authorization, body);
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(JSON.stringify(r.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const client = (token = "t".repeat(40)) => createScannerClient({ baseUrl: base, token, timeoutMs: 2000 });

describe("scanner client", () => {
  it("sends the bearer token and validates responses", async () => {
    reply = (path, auth) =>
      auth === `Bearer ${"t".repeat(40)}` && path === "/v1/addresses"
        ? { status: 200, json: { address: "utest1abcdefghijk", index: "1099511627777" } }
        : { status: 401, json: { error: { code: "unauthenticated", message: "no" } } };
    expect(await client().deriveAddress("uivk", "1099511627776")).toEqual({ address: "utest1abcdefghijk", index: "1099511627777" });
    expect(JSON.parse(seen.at(-1)!.body)).toEqual({ uivk: "uivk", index: "1099511627776" });
    await expect(client("wrong").deriveAddress("uivk", "1")).rejects.toThrow(ScannerUnavailableError);
  });

  it("maps scanner validation errors and refuses malformed data", async () => {
    reply = () => ({ status: 422, json: { error: { code: "secret_material_rejected", message: "Never share those." } } });
    const err = await client().inspectKey("abandon abandon").catch((e) => e);
    expect(err).toBeInstanceOf(ScannerError);
    expect(err).toMatchObject({ status: 422, code: "secret_material_rejected" });

    reply = () => ({ status: 200, json: { tip_height: 5, blocks: [], matches: [{ key_id: "a", txid: "not-hex", pool: "orchard", output_index: 0, value_zat: "1", diversifier_index: "1", height: 5 }] } });
    await expect(client().scan(1, 5, [])).rejects.toThrow(/unexpected response/);

    reply = () => ({ status: 502, json: { error: { code: "backend_unavailable", message: "x" } } });
    await expect(client().mempool([])).rejects.toThrow(ScannerUnavailableError);
  });

  it("reports health without throwing", async () => {
    reply = () => ({ status: 503, json: { status: "wrong_network", chain_name: "main", tip_height: 9 } });
    expect(await client().health()).toMatchObject({ status: "wrong_network", chain_name: "main" });
    const dead = createScannerClient({ baseUrl: "http://127.0.0.1:9", token: "x", timeoutMs: 500 });
    expect(await dead.health()).toEqual({ status: "unavailable" });
    await expect(dead.block(1)).rejects.toThrow(ScannerUnavailableError);
  });
});
