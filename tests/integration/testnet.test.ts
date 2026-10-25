import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as collection from "@/app/api/v1/payment-requests/route";
import * as status from "@/app/api/v1/payment-requests/[id]/status/route";
import * as simulate from "@/app/api/v1/payment-requests/[id]/simulate/route";
import { decryptSecret } from "@/lib/server/crypto";
import { saveViewingKey, setScannerForTesting, viewingKeyAad } from "@/lib/server/testnet";
import { runTestnetScan } from "@/lib/server/zcash/scan-job";
import { ScannerError, ScannerUnavailableError, type KeyRef, type ScanBlock, type ScanMatch, type ScannerApi } from "@/lib/server/zcash/scanner-client";
import { call, makeProject, prisma, resetDb } from "./fixtures";

/**
 * Testnet flow against an in-process fake scanner. The fake speaks the real
 * scanner's HTTP contract (scanner/src/server.rs) and returns real testnet
 * addresses derived by the scanner (tests/fixtures/zcash-testnet.json). The
 * cryptography itself is tested in the Rust crate; this covers everything
 * Yola does with the scanner's answers.
 */

const fx = JSON.parse(readFileSync(new URL("../fixtures/zcash-testnet.json", import.meta.url), "utf8")) as {
  ufvk: string;
  uivk: string;
  fingerprint: string;
  first_address: string;
  first_index: string;
  mainnet_uivk: string;
  addresses: { index: string; address: string }[];
};

const hex = (n: number, fork: number) => fork.toString(16).padStart(8, "0") + n.toString(16).padStart(56, "0");

class FakeScanner implements ScannerApi {
  tip = 1000;
  fork = 0;
  up = true;
  blocks = new Map<number, ScanBlock>();
  minedMatches = new Map<number, Omit<ScanMatch, "key_id" | "height">[]>();
  mempoolMatches: Omit<ScanMatch, "key_id" | "height">[] = [];
  derived = 0;

  constructor() {
    for (let h = 990; h <= this.tip; h++) this.#put(h);
  }
  #put(h: number) {
    this.blocks.set(h, { height: h, hash: hex(h, this.fork), prev_hash: this.blocks.get(h - 1)?.hash ?? hex(h - 1, 0), time: 1_800_000_000 + h * 75 });
  }
  /** Mine a block containing these outputs (removing them from the mempool). */
  mine(outputs: Omit<ScanMatch, "key_id" | "height">[] = []) {
    this.tip++;
    this.#put(this.tip);
    this.minedMatches.set(this.tip, outputs);
    const mined = new Set(outputs.map((o) => o.txid));
    this.mempoolMatches = this.mempoolMatches.filter((m) => !mined.has(m.txid));
  }
  /** Replace every block above `height` with a different chain. */
  reorgTo(height: number) {
    this.fork++;
    for (let h = height + 1; h <= this.tip; h++) {
      this.blocks.delete(h);
      this.minedMatches.delete(h);
    }
    this.tip = height;
  }
  #check() {
    if (!this.up) throw new ScannerUnavailableError("Scanner unreachable: fake");
  }
  #attach(keys: KeyRef[], m: Omit<ScanMatch, "key_id" | "height">, height: number | null): ScanMatch[] {
    return keys.filter((k) => k.uivk === fx.uivk).map((k) => ({ ...m, key_id: k.id, height }));
  }

  async health() {
    return this.up ? { status: "ok" as const, chain_name: "test", tip_height: this.tip } : { status: "unavailable" as const };
  }
  async inspectKey(key: string) {
    this.#check();
    if (key.trim().split(/\s+/).length >= 12) throw new ScannerError(422, "secret_material_rejected", "This looks like a seed phrase or spending key.");
    if (key === fx.mainnet_uivk) throw new ScannerError(422, "wrong_network", "This viewing key is for a different network.");
    if (key !== fx.ufvk && key !== fx.uivk) throw new ScannerError(422, "invalid_viewing_key", "Not a valid unified viewing key.");
    return {
      uivk: fx.uivk,
      fingerprint: fx.fingerprint,
      was_full_viewing_key: key === fx.ufvk,
      has_sapling: true,
      has_orchard: true,
      first_address: fx.first_address,
      first_index: fx.first_index,
    };
  }
  async deriveAddress(uivk: string, index: string) {
    this.#check();
    if (uivk !== fx.uivk) throw new ScannerError(422, "invalid_viewing_key", "bad key");
    // Mimic Sapling's invalid diversifiers: odd indices skip forward by one.
    const found = BigInt(index) % 2n === 1n ? BigInt(index) + 1n : BigInt(index);
    return { address: fx.addresses[this.derived++ % fx.addresses.length]!.address, index: found.toString() };
  }
  async scan(start: number, end: number, keys: KeyRef[]) {
    this.#check();
    const blocks: ScanBlock[] = [];
    const matches: ScanMatch[] = [];
    for (let h = start; h <= end; h++) {
      const b = this.blocks.get(h);
      if (!b) throw new ScannerError(422, "beyond_tip", "beyond tip");
      blocks.push(b);
      for (const m of this.minedMatches.get(h) ?? []) matches.push(...this.#attach(keys, m, h));
    }
    return { tip_height: this.tip, blocks, matches };
  }
  async mempool(keys: KeyRef[]) {
    this.#check();
    return { tip_height: this.tip, transactions: this.mempoolMatches.length, matches: this.mempoolMatches.flatMap((m) => this.#attach(keys, m, null)) };
  }
  async block(h: number) {
    this.#check();
    const b = this.blocks.get(h);
    if (!b) throw new ScannerError(404, "not_found", "no block");
    return { tip_height: this.tip, block: b };
  }
}

let scanner: FakeScanner;
beforeEach(async () => {
  await resetDb();
  scanner = new FakeScanner();
  setScannerForTesting(scanner);
});
afterEach(() => setScannerForTesting(undefined));

const tx = (n: number) => n.toString(16).padStart(64, "0");
const output = (index: string, value: number, txn: number, pool: ScanMatch["pool"] = "orchard") => ({
  txid: tx(txn),
  pool,
  output_index: 0,
  value_zat: String(value),
  diversifier_index: index,
});

async function projectWithKey(confirmations = 3) {
  const p = await makeProject();
  await prisma().project.update({ where: { id: p.project.id }, data: { testnetConfirmations: confirmations } });
  const saved = await saveViewingKey(prisma(), scanner, p.project.id, fx.ufvk);
  expect(saved.ok).toBe(true);
  return p;
}

async function createTestnet(key: string, body: Record<string, unknown> = {}) {
  return call(collection.POST, { method: "POST", path: "/payment-requests", key, body: { amount: "0.001", currency: "ZEC", network: "testnet", ...body } });
}

const getStatus = (id: string, key: string) => call(status.GET, { path: `/payment-requests/${id}/status`, key });

describe("viewing keys", () => {
  it("rejects seed phrases and wrong-network keys without storing anything", async () => {
    const { project } = await makeProject();
    const seed = Array.from({ length: 24 }, () => "abandon").join(" ");
    expect(await saveViewingKey(prisma(), scanner, project.id, seed)).toMatchObject({ ok: false, code: "secret_material_rejected" });
    expect(await saveViewingKey(prisma(), scanner, project.id, fx.mainnet_uivk)).toMatchObject({ ok: false, code: "wrong_network" });
    expect(await prisma().viewingKey.count()).toBe(0);
  });

  it("stores only the encrypted incoming viewing key, starting far from wallet indices", async () => {
    const { project } = await makeProject();
    const r = await saveViewingKey(prisma(), scanner, project.id, fx.ufvk);
    expect(r).toMatchObject({ ok: true, fingerprint: fx.fingerprint, wasFullViewingKey: true, firstAddress: fx.first_address });
    const row = await prisma().viewingKey.findFirstOrThrow();
    expect(row.encryptedKey).not.toContain(fx.uivk.slice(10, 40));
    expect(row.encryptedKey).not.toContain(fx.ufvk.slice(10, 40));
    expect(decryptSecret(row.encryptedKey, viewingKeyAad(project.id))).toBe(fx.uivk);
    expect(BigInt(row.nextDiversifierIndex.toFixed(0)) >= 1n << 40n).toBe(true);
    expect(row.birthdayHeight).toBe(1000);
    expect(await saveViewingKey(prisma(), scanner, project.id, fx.uivk)).toMatchObject({ ok: false, code: "already_configured" });
  });
});

describe("testnet payment requests", () => {
  it("needs a viewing key, then issues per-request shielded addresses with ZIP 321 URIs", async () => {
    const bare = await makeProject();
    const refused = await createTestnet(bare.testKey);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("viewing_key_required");

    const { testKey } = await projectWithKey();
    const a = await createTestnet(testKey, { description: "Order 1042" });
    const b = await createTestnet(testKey);
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ network: "testnet", trust_level: "verified_testnet", status: "awaiting_payment", confirmations: null });
    expect(a.body.destination).toMatch(/^utest1/);
    expect(a.body.payment_uri).toBe(`zcash:${a.body.destination}?amount=0.001&message=Order%201042`);
    expect(a.body.qr_payload).toBe(a.body.payment_uri);
    expect(a.body.destination).not.toBe(b.body.destination);
    const rows = await prisma().paymentRequest.findMany({ orderBy: { createdAt: "asc" } });
    const [ia, ib] = rows.map((r) => BigInt(r.diversifierIndex!.toFixed(0)));
    expect(ib! > ia!).toBe(true);
    // Internal columns never leak into the API.
    expect(JSON.stringify(a.body)).not.toMatch(/diversifier|uivk|projectId/i);
  });

  it("refuses the simulator for testnet requests and live keys for testnet", async () => {
    const { testKey, liveKey } = await projectWithKey();
    const p = (await createTestnet(testKey)).body;
    const sim = await call(simulate.POST, { method: "POST", path: `/payment-requests/${p.id}/simulate`, key: testKey, body: { action: "pay" } });
    expect(sim.status).toBe(403);
    expect(sim.body.error.code).toBe("simulation_not_allowed");
    expect((await createTestnet(liveKey)).status).toBe(403);
  });

  it("answers 503 when the scanner is down, without creating anything", async () => {
    const { testKey } = await projectWithKey();
    scanner.up = false;
    const r = await createTestnet(testKey, {});
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("network_unavailable");
    expect(r.headers.get("retry-after")).toBe("30");
    expect(await prisma().paymentRequest.count()).toBe(0);
  });
});

describe("scanning and verification", () => {
  async function setup(confirmations = 3) {
    const ctx = await projectWithKey(confirmations);
    const p = (await createTestnet(ctx.testKey)).body;
    const row = await prisma().paymentRequest.findUniqueOrThrow({ where: { id: p.id } });
    const index = row.diversifierIndex!.toFixed(0);
    expect((await runTestnetScan(prisma(), scanner)).status).toBe("scanned"); // initial cursor + first pass
    return { ...ctx, p, index };
  }

  it("follows a payment from mempool to confirmed and emits webhook events", async () => {
    const { p, index, testKey } = await setup(3);
    scanner.mempoolMatches.push(output(index, 100_000, 1));
    let r = await runTestnetScan(prisma(), scanner);
    expect(r).toMatchObject({ status: "scanned", complete: true, mempool: 1 });
    expect((await getStatus(p.id, testKey)).body).toMatchObject({ status: "payment_detected", transaction_id: tx(1), confirmations: { observed: 0, required: 3 } });

    scanner.mine([output(index, 100_000, 1)]);
    await runTestnetScan(prisma(), scanner);
    expect((await getStatus(p.id, testKey)).body).toMatchObject({ status: "confirming", confirmations: { observed: 1, required: 3 } });

    scanner.mine();
    scanner.mine();
    r = await runTestnetScan(prisma(), scanner);
    expect(r.to).toBe(scanner.tip);
    const s = (await getStatus(p.id, testKey)).body;
    expect(s).toMatchObject({ status: "confirmed", final: true, trust_level: "verified_testnet", amount_received: "0.00100000" });

    const events = await prisma().webhookEvent.findMany({ where: { paymentRequestId: p.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual([
      "payment_request.created",
      "payment_request.awaiting_payment",
      "payment_request.payment_detected",
      "payment_request.confirming",
      "payment_request.confirmed",
    ]);
    const payload = events.at(-1)!.payload as { livemode: boolean; data: { payment_request: { trust_level: string } } };
    expect(payload.livemode).toBe(false);
    expect(payload.data.payment_request.trust_level).toBe("verified_testnet");
  });

  it("walks back on a reorg, then confirms once the transaction is re-mined", async () => {
    const { p, index, testKey } = await setup(3);
    const forkBase = scanner.tip;
    scanner.mine([output(index, 100_000, 7)]);
    await runTestnetScan(prisma(), scanner);
    expect((await getStatus(p.id, testKey)).body.status).toBe("confirming");

    // The block is orphaned and the transaction returns to the mempool.
    scanner.reorgTo(forkBase);
    scanner.mine();
    scanner.mempoolMatches.push(output(index, 100_000, 7));
    let r = await runTestnetScan(prisma(), scanner);
    expect(r.reorgedTo).toBe(forkBase);
    expect((await getStatus(p.id, testKey)).body).toMatchObject({ status: "payment_detected", confirmations: { observed: 0 } });

    // Then it is dropped entirely.
    scanner.mempoolMatches = [];
    await runTestnetScan(prisma(), scanner);
    expect((await getStatus(p.id, testKey)).body).toMatchObject({ status: "awaiting_payment", transaction_id: null });
    expect((await prisma().paymentObservation.findFirstOrThrow()).invalidatedAt).not.toBeNull();

    // Rebroadcast and mined on the new chain.
    scanner.mine([output(index, 100_000, 7)]);
    scanner.mine();
    scanner.mine();
    r = await runTestnetScan(prisma(), scanner);
    expect(r.reorgedTo).toBeNull();
    expect((await getStatus(p.id, testKey)).body.status).toBe("confirmed");
    const history = (await prisma().paymentEvent.findMany({ where: { paymentRequestId: p.id }, orderBy: { seq: "asc" } })).map((e) => `${e.status}:${e.evidence}`);
    expect(history).toContain("payment_detected:reorg");
    expect(history).toContain("awaiting_payment:reorg");
  });

  it("flags a confirmed payment for review after a deep reorg", async () => {
    const { p, index, testKey } = await setup(1);
    const base = scanner.tip;
    scanner.mine([output(index, 100_000, 9)]);
    await runTestnetScan(prisma(), scanner);
    expect((await getStatus(p.id, testKey)).body.status).toBe("confirmed");
    scanner.reorgTo(base);
    scanner.mine();
    await runTestnetScan(prisma(), scanner);
    expect((await getStatus(p.id, testKey)).body).toMatchObject({ status: "verification_required", final: false });
  });

  it("handles underpayment, top-up and overpayment", async () => {
    const { p, index, testKey } = await setup(1);
    scanner.mine([output(index, 30_000, 20, "sapling")]);
    await runTestnetScan(prisma(), scanner);
    expect((await getStatus(p.id, testKey)).body).toMatchObject({ status: "underpaid", amount_received: "0.00030000" });
    scanner.mine([output(index, 90_000, 21, "ironwood")]);
    await runTestnetScan(prisma(), scanner);
    expect((await getStatus(p.id, testKey)).body).toMatchObject({ status: "overpaid", amount_received: "0.00120000" });
    const pools = (await prisma().paymentObservation.findMany()).map((o) => o.pool).sort();
    expect(pools).toEqual(["ironwood", "sapling"]);
  });

  it("ignores payments to indices that are not requests (the merchant's own addresses)", async () => {
    const { p, testKey } = await setup();
    scanner.mine([output(fx.first_index, 5_000_000, 30)]);
    const r = await runTestnetScan(prisma(), scanner);
    expect(r.unattributed).toBe(1);
    expect(await prisma().paymentObservation.count()).toBe(0);
    expect((await getStatus(p.id, testKey)).body.status).toBe("awaiting_payment");
  });

  it("expires only after a complete pass past the deadline, and flags late payments", async () => {
    const { p, index, testKey } = await setup();
    await prisma().paymentRequest.update({ where: { id: p.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    // The last complete pass began before the deadline: no expiry yet.
    await prisma().chainCursor.update({ where: { network: "testnet" }, data: { observedThrough: new Date(Date.now() - 60_000) } });
    expect((await getStatus(p.id, testKey)).body.status).toBe("awaiting_payment");

    scanner.up = false;
    expect((await runTestnetScan(prisma(), scanner)).status).toBe("backend_error");
    expect((await getStatus(p.id, testKey)).body.status).toBe("awaiting_payment");

    scanner.up = true;
    await runTestnetScan(prisma(), scanner);
    expect((await getStatus(p.id, testKey)).body.status).toBe("expired");

    scanner.mempoolMatches.push(output(index, 100_000, 40));
    await runTestnetScan(prisma(), scanner);
    expect((await getStatus(p.id, testKey)).body.status).toBe("verification_required");
  });

  it("lets only one pass hold the scan lease", async () => {
    await setup();
    // Hold the first pass inside the scanner until the second has tried for the lease.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let entered!: () => void;
    const inside = new Promise<void>((r) => (entered = r));
    const realMempool = scanner.mempool.bind(scanner);
    scanner.mempool = async (k) => {
      entered();
      await gate;
      return realMempool(k);
    };
    const first = runTestnetScan(prisma(), scanner);
    await inside;
    expect((await runTestnetScan(prisma(), scanner)).status).toBe("locked");
    release();
    expect((await first).status).toBe("scanned");
    scanner.mempool = realMempool;
    expect((await runTestnetScan(prisma(), scanner)).status).toBe("scanned");
  });

  it("detects a chain change between batches instead of skipping blocks", async () => {
    const { index } = await setup();
    for (let i = 0; i < 5; i++) scanner.mine();
    const realScan = scanner.scan.bind(scanner);
    let calls = 0;
    scanner.scan = async (s, e, k) => {
      const res = await realScan(s, e, k);
      if (calls++ === 0) scanner.blocks.set(e + 1, { ...scanner.blocks.get(e + 1)!, prev_hash: "f".repeat(64) });
      return res;
    };
    const r = await runTestnetScan(prisma(), scanner, { batch: 2 });
    expect(r.complete).toBe(false);
    expect(r.to).toBe((r.from ?? 0) + 1);
    expect((await prisma().chainCursor.findFirstOrThrow()).observedThrough).not.toBeNull(); // from the earlier complete pass only
    void index;
  });
});
