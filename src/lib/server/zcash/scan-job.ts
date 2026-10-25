import "server-only";
import { reconcilePayment, type ChainObservation } from "@/lib/payments/verification";
import { VersionConflictError } from "@/lib/payments/store";
import { prefixedId } from "@/lib/utils/ids";
import { Prisma } from "@/generated/prisma/client";
import { decryptSecret } from "../crypto";
import type { Db } from "../db";
import { errorFields, log } from "../log";
import { PrismaPaymentRepo } from "../repos";
import { viewingKeyAad } from "../testnet";
import { ScannerError, type KeyRef, type ScanMatch, type ScannerApi } from "./scanner-client";

/**
 * One testnet scanning pass:
 *
 *   1. Take the scan lease (one scanner per deployment, however many servers).
 *   2. Check the cursor block is still on the best chain. If not, walk back to
 *      the fork point, invalidate observations above it and rescan from there.
 *   3. Scan new blocks to the tip in batches, recording outputs that decrypt
 *      to a request's address. Block hashes are chained (prev_hash) so a reorg
 *      between batches is caught, not skipped.
 *   4. Scan the mempool. Mempool outputs that vanished (and were not mined)
 *      are invalidated, as dropped transactions.
 *   5. Re-evaluate every affected payment with reconcilePayment and save it
 *      through the normal repository, so webhooks fire from the outbox.
 *
 * observedThrough is advanced to the start of the pass only after a complete
 * pass, which is what lets testnet requests expire (see lifecycle.isDue).
 */

const NETWORK = "testnet" as const;
const LEASE_SECONDS = 120;
const MAX_REORG_DEPTH = 100;
const KEEP_BLOCKS = 1_000;

export interface ScanPassOptions {
  now?: () => Date;
  /** Blocks per scanner call. */
  batch?: number;
  /** Blocks per pass; the rest wait for the next pass so a pass stays short. */
  maxBlocks?: number;
}

export interface ScanPassResult {
  status: "scanned" | "locked" | "no_keys" | "backend_error";
  from?: number;
  to?: number;
  tip?: number;
  reorgedTo?: number | null;
  matches?: number;
  unattributed?: number;
  mempool?: number | null;
  reconciled?: number;
  complete?: boolean;
}

async function acquireLease(prisma: Db, owner: string): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE chain_cursor
       SET "lockedUntil" = (now() AT TIME ZONE 'UTC') + make_interval(secs => ${LEASE_SECONDS}), "lockOwner" = ${owner}
     WHERE network = 'testnet'::"Network"
       AND ("lockedUntil" IS NULL OR "lockedUntil" < (now() AT TIME ZONE 'UTC') OR "lockOwner" = ${owner})`;
  return n === 1;
}

async function releaseLease(prisma: Db, owner: string) {
  await prisma.chainCursor.updateMany({ where: { network: NETWORK, lockOwner: owner }, data: { lockedUntil: null, lockOwner: null } });
}

async function loadKeys(prisma: Db): Promise<{ refs: KeyRef[]; projectOf: Map<string, string> }> {
  const rows = await prisma.viewingKey.findMany({ where: { network: NETWORK }, select: { id: true, projectId: true, encryptedKey: true } });
  const refs: KeyRef[] = [];
  const projectOf = new Map<string, string>();
  for (const r of rows) {
    try {
      refs.push({ id: r.id, uivk: decryptSecret(r.encryptedKey, viewingKeyAad(r.projectId)) });
      projectOf.set(r.id, r.projectId);
    } catch (err) {
      log.error("scan.key_decrypt_failed", { viewing_key_id: r.id, ...errorFields(err) });
    }
  }
  return { refs, projectOf };
}

/** Find the highest stored block that is still on the best chain. */
async function findForkPoint(prisma: Db, scanner: ScannerApi, from: number): Promise<{ height: number; hash: string } | null> {
  for (let h = from; h > from - MAX_REORG_DEPTH && h >= 0; h--) {
    const stored = await prisma.chainBlock.findUnique({ where: { network_height: { network: NETWORK, height: h } } });
    if (!stored) break;
    const onChain = await scanner.block(h).catch((err) => {
      if (err instanceof ScannerError && err.code === "not_found") return null;
      throw err;
    });
    if (onChain && onChain.block.hash === stored.hash) return { height: h, hash: stored.hash };
  }
  return null;
}

async function recordMatch(
  tx: Prisma.TransactionClient,
  m: ScanMatch,
  projectOf: Map<string, string>,
  blockHash: string | null,
  now: Date,
): Promise<string | null> {
  const projectId = projectOf.get(m.key_id);
  if (!projectId) return null;
  const payment = await tx.paymentRequest.findFirst({
    where: { projectId, network: NETWORK, diversifierIndex: new Prisma.Decimal(m.diversifier_index) },
    select: { id: true },
  });
  if (!payment) return null; // paid an index Yola never assigned to a request (the merchant's own address)
  const key = { network_txid_pool_outputIndex: { network: NETWORK, txid: m.txid, pool: m.pool, outputIndex: m.output_index } } as const;
  const existing = await tx.paymentObservation.findUnique({ where: key });
  if (existing && existing.paymentRequestId !== payment.id) {
    log.error("scan.observation_conflict", { txid: m.txid, payment_request_id: payment.id });
    return null;
  }
  // Mempool sighting of an output already known and valid (mined or pending): nothing new.
  // Never downgrade a mined observation to pending.
  if (m.height === null && existing && existing.invalidatedAt === null) return null;
  await tx.paymentObservation.upsert({
    where: key,
    create: {
      id: prefixedId("obs"),
      paymentRequestId: payment.id,
      projectId,
      network: NETWORK,
      txid: m.txid,
      pool: m.pool,
      outputIndex: m.output_index,
      valueZatoshis: BigInt(m.value_zat),
      blockHeight: m.height,
      blockHash,
      observedAt: now,
    },
    update: { blockHeight: m.height, blockHash, invalidatedAt: null },
  });
  return payment.id;
}

export async function runTestnetScan(prisma: Db, scanner: ScannerApi, opts: ScanPassOptions = {}): Promise<ScanPassResult> {
  const clock = opts.now ?? (() => new Date());
  const passStart = clock();
  const batch = opts.batch ?? 100;
  const maxBlocks = opts.maxBlocks ?? 2_000;
  const owner = prefixedId("lease");

  const { refs, projectOf } = await loadKeys(prisma);
  if (refs.length === 0) return { status: "no_keys" };

  try {
    // First run: start at the current tip. No request can predate its key, and keys are added "now".
    if (!(await prisma.chainCursor.findUnique({ where: { network: NETWORK } }))) {
      const tip = (await scanner.health()).tip_height;
      if (tip === undefined) return { status: "backend_error" };
      const start = Math.max(0, tip - 1);
      const b = await scanner.block(start);
      await prisma.chainCursor.createMany({ data: [{ network: NETWORK, height: start, hash: b.block.hash }], skipDuplicates: true });
      await prisma.chainBlock.createMany({
        data: [{ network: NETWORK, height: start, hash: b.block.hash, prevHash: b.block.prev_hash, time: new Date(b.block.time * 1000) }],
        skipDuplicates: true,
      });
    }
    if (!(await acquireLease(prisma, owner))) return { status: "locked" };
  } catch (err) {
    log.warn("scan.start_failed", errorFields(err));
    return { status: "backend_error" };
  }

  const touched = new Set<string>();
  const result: ScanPassResult = { status: "scanned", reorgedTo: null, matches: 0, unattributed: 0, mempool: null, reconciled: 0, complete: false };
  try {
    let cursor = await prisma.chainCursor.findUniqueOrThrow({ where: { network: NETWORK } });

    // 2. Reorg check.
    const head = await scanner.block(cursor.height).catch((err) => {
      if (err instanceof ScannerError && err.code === "not_found") return null; // chain got shorter
      throw err;
    });
    if (!head || head.block.hash !== cursor.hash) {
      const fork = (await findForkPoint(prisma, scanner, cursor.height - 1)) ?? null;
      const forkHeight = fork?.height ?? Math.max(0, cursor.height - MAX_REORG_DEPTH);
      const forkHash = fork?.hash ?? (await scanner.block(forkHeight)).block.hash;
      const now = clock();
      const lost = await prisma.paymentObservation.findMany({
        where: { network: NETWORK, invalidatedAt: null, blockHeight: { gt: forkHeight } },
        select: { paymentRequestId: true },
      });
      await prisma.$transaction([
        prisma.paymentObservation.updateMany({
          where: { network: NETWORK, invalidatedAt: null, blockHeight: { gt: forkHeight } },
          data: { invalidatedAt: now },
        }),
        prisma.chainBlock.deleteMany({ where: { network: NETWORK, height: { gt: forkHeight } } }),
        prisma.chainCursor.update({ where: { network: NETWORK }, data: { height: forkHeight, hash: forkHash } }),
      ]);
      lost.forEach((o) => touched.add(o.paymentRequestId));
      log.warn("scan.reorg", { from_height: cursor.height, fork_height: forkHeight, observations_invalidated: lost.length });
      result.reorgedTo = forkHeight;
      cursor = await prisma.chainCursor.findUniqueOrThrow({ where: { network: NETWORK } });
    }
    const tip = head?.tip_height ?? (await scanner.health()).tip_height ?? cursor.height;
    result.tip = tip;
    result.from = cursor.height + 1;

    // 3. Blocks.
    let scanned = 0;
    let chainBroken = false;
    while (cursor.height < tip && scanned < maxBlocks) {
      const start = cursor.height + 1;
      const end = Math.min(tip, start + batch - 1, start + (maxBlocks - scanned) - 1);
      const res = await scanner.scan(start, end, refs);
      let prev = cursor.hash;
      for (const b of res.blocks) {
        if (b.prev_hash !== prev) {
          chainBroken = true;
          break;
        }
        prev = b.hash;
      }
      if (chainBroken || res.blocks.length !== end - start + 1) {
        log.warn("scan.chain_changed_mid_pass", { start, end });
        chainBroken = true;
        break;
      }
      const now = clock();
      const hashAt = new Map(res.blocks.map((b) => [b.height, b.hash]));
      await prisma.$transaction(async (tx) => {
        for (const m of res.matches) {
          const id = await recordMatch(tx, m, projectOf, hashAt.get(m.height ?? -1) ?? null, now);
          if (id) touched.add(id);
          else result.unattributed!++;
        }
        await tx.chainBlock.createMany({
          data: res.blocks.map((b) => ({ network: NETWORK, height: b.height, hash: b.hash, prevHash: b.prev_hash, time: new Date(b.time * 1000) })),
          skipDuplicates: true,
        });
        const last = res.blocks.at(-1)!;
        await tx.chainCursor.update({ where: { network: NETWORK }, data: { height: last.height, hash: last.hash, lockedUntil: new Date(Date.now() + LEASE_SECONDS * 1000) } });
      });
      result.matches! += res.matches.length;
      scanned += res.blocks.length;
      cursor = await prisma.chainCursor.findUniqueOrThrow({ where: { network: NETWORK } });
    }
    result.to = cursor.height;
    await prisma.chainBlock.deleteMany({ where: { network: NETWORK, height: { lt: cursor.height - KEEP_BLOCKS } } });

    // 4. Mempool, only when caught up and the tip has not moved meanwhile.
    if (!chainBroken && cursor.height === tip) {
      const mp = await scanner.mempool(refs);
      if (mp.tip_height === tip) {
        const now = clock();
        const seen = new Set<string>();
        await prisma.$transaction(async (tx) => {
          for (const m of mp.matches) {
            seen.add(`${m.txid}:${m.pool}:${m.output_index}`);
            const id = await recordMatch(tx, m, projectOf, null, now);
            if (id) touched.add(id);
          }
          const pending = await tx.paymentObservation.findMany({
            where: { network: NETWORK, blockHeight: null, invalidatedAt: null },
            select: { id: true, txid: true, pool: true, outputIndex: true, paymentRequestId: true },
          });
          const dropped = pending.filter((o) => !seen.has(`${o.txid}:${o.pool}:${o.outputIndex}`));
          if (dropped.length) {
            await tx.paymentObservation.updateMany({ where: { id: { in: dropped.map((o) => o.id) } }, data: { invalidatedAt: now } });
            dropped.forEach((o) => touched.add(o.paymentRequestId));
            log.info("scan.mempool_dropped", { count: dropped.length });
          }
        });
        result.mempool = mp.matches.length;
        result.complete = true;
        await prisma.chainCursor.update({ where: { network: NETWORK }, data: { observedThrough: passStart } });
      }
    }

    // 5. Reconcile.
    const open = await prisma.paymentRequest.findMany({
      where: { network: NETWORK, status: { in: ["awaiting_payment", "payment_detected", "confirming", "underpaid"] }, observations: { some: {} } },
      select: { id: true },
    });
    open.forEach((p) => touched.add(p.id));
    result.reconciled = await reconcileAll(prisma, [...touched], tip, clock);
    log.info("scan.pass", { ...result });
    return result;
  } catch (err) {
    log.error("scan.pass_failed", errorFields(err));
    return { ...result, status: "backend_error" };
  } finally {
    await releaseLease(prisma, owner).catch(() => undefined);
  }
}

async function reconcileAll(prisma: Db, ids: string[], tip: number, clock: () => Date): Promise<number> {
  const repo = new PrismaPaymentRepo(prisma);
  let changed = 0;
  for (const id of ids) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await prisma.paymentRequest.findUnique({
        where: { id },
        select: { projectId: true, project: { select: { testnetConfirmations: true } } },
      });
      if (!row) break;
      const current = await repo.get(row.projectId, id);
      if (!current) break;
      const obs = await prisma.paymentObservation.findMany({ where: { paymentRequestId: id, invalidatedAt: null } });
      const evidence: ChainObservation[] = obs.map((o) => ({
        txid: o.txid,
        valueZatoshis: o.valueZatoshis,
        height: o.blockHeight,
        firstSeenAt: o.observedAt,
      }));
      const next = reconcilePayment(current, evidence, { tipHeight: tip, requiredConfirmations: row.project.testnetConfirmations, now: clock() });
      if (next === current) break;
      try {
        await repo.save(next, current.version);
        changed++;
        break;
      } catch (err) {
        if (!(err instanceof VersionConflictError)) {
          log.error("scan.reconcile_failed", { payment_request_id: id, ...errorFields(err) });
          break;
        }
      }
    }
  }
  return changed;
}
