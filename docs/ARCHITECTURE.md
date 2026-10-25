# Yola architecture and payment verification

Status: decision record, October 2026. Implemented for testnet in Phase F (see "Implementation" below and docs/TESTNET.md).

## The question

How does Yola prove that a *specific* payment request was paid, by the
right amount, to the right merchant, on the right network, with enough
confirmations, without custody and without assuming shielded data is public?

## Findings (verified October 2026)

| Topic | Finding | Consequence for Yola |
|---|---|---|
| zcashd | Reached its End-of-Support halt at mainnet block 3,417,100 on 18 July 2026. The repository is archived. | Never a dependency. |
| Consensus node | Zebra (`zebrad`, Zcash Foundation) is the supported full node. | Yola's backend runs Zebra. |
| Indexer | Zaino (Zingo Labs) replaces zcashd's indexing RPCs and lightwalletd's role, and serves the light-client gRPC API. | Chain data comes from Zaino on top of Zebra. |
| Full-node wallet | Zallet (ZODL) replaces the zcashd wallet; still alpha. | Not required for receive-only verification; revisit later. |
| Payment URIs | ZIP 321 defines `zcash:` URIs: `amount` with ≤ 8 decimals and ≤ 21M ZEC, `memo` as unpadded base64url ≤ 512 bytes and forbidden for transparent recipients, percent-encoding only in `label`/`message`, Sprout forbidden. | Implemented in `src/lib/zcash/zip321.ts`, tested against the spec's own example. |
| Address formats | ZIP 316 Revision 2 adds `zu…`/`tu…` unified address prefixes beside `u…`; viewing keys move to `uvi…`/`uvf…`. | Prefix rules in `src/lib/zcash/address.ts` cover both revisions. |
| Ecosystem practice | Independent open-source gateways (ZecCheckout, Sotto, Lunaz, CipherPay) converge on the same design: a per-invoice diversified address derived from a merchant viewing key, plus trial decryption. | Strong signal the approach is sound; Yola follows it. |

## Decision: one diversified address per request, verified with an incoming viewing key

1. **Merchant onboarding.** The merchant exports a Unified **Incoming** Viewing
   Key (UIVK) from their own wallet and gives it to Yola. A UIVK can detect
   incoming payments and derive receiving addresses. It cannot spend and
   cannot see outgoing transactions. Yola never asks for a seed phrase or
   spending key. If a wallet only exports a full viewing key (UFVK), Yola
   derives the UIVK from it and discards the UFVK.
2. **Request creation.** For each payment request Yola derives a fresh
   *diversified* shielded unified address (Orchard + Sapling receivers,
   no transparent receiver) at a new diversifier index, stores
   `diversifier_index → payment_request_id`, and returns it in a ZIP 321
   URI and QR code.
3. **Detection.** A scanner follows new blocks (and the mempool, for
   "payment detected") from Zaino and trial-decrypts every shielded output
   with each merchant's UIVK. A successful decryption reveals the value and
   the diversifier, which identifies the request directly. **Memos are not
   used for attribution**: wallets can drop or alter them; the address cannot.
4. **Verification.** The verification service compares decrypted value with
   the requested amount (exact / under / over), checks the network, and
   tracks confirmation depth against the project's configured policy.
5. **Reorgs.** The scanner records the block hash of each observation. When
   Zaino reports a reorg, observations above the fork point are invalidated
   and the state machine moves the payment back (`confirming → payment_detected`
   or `→ verification_required`).
6. **Late and duplicate payments.** Funds to an expired or cancelled request's
   address go to `verification_required`, never to `confirmed`. Duplicate
   observations of the same output are idempotent (unique on txid + output index).

### Why not the alternatives

- **One static merchant address + memo.** Memos are optional in wallets and
  some drop them; two customers paying the same amount become ambiguous.
- **Customer submits a transaction ID.** A txid alone proves nothing for
  shielded outputs, and the spec forbids trusting client claims.
- **Public block explorer lookups.** Shielded amounts and recipients are
  encrypted; no public lookup can verify them.
- **Transparent addresses only.** Works technically (public outputs) but
  exposes the merchant's revenue and customer graph. Supported later as an
  explicit opt-in, clearly labelled.

## Security implications of holding viewing keys

- A leaked UIVK reveals every incoming payment to that account (amounts,
  memos, timing) to the attacker. It does **not** allow theft.
- Viewing keys are encrypted at rest with `YOLA_ENCRYPTION_KEY`, held only
  by the scanner process, and never logged, returned by the API, or sent
  to the browser.
- Recommend merchants use a dedicated receiving account for Yola.
- Recent ecosystem work (Zakura, October 2026) proposes per-use incoming
  viewing keys to limit exposure if a future quantum attack recovers a key
  from a public address. Track this; per-request addresses already reduce
  linkability for observers without the key.

## Layers

```
Developer API  ──►  PaymentRequestService  ──►  PaymentNetworkAdapter (demo | testnet | mainnet)
                                │                         │ reports VerificationCapabilities
                                ▼                         ▼
                     PaymentVerificationService  ◄── observations (scanner over Zebra + Zaino)
                                │
                                ▼
                     State machine (evidence-gated) ──► WebhookDeliveryService
```

The verification service refuses to confirm unless the adapter reports
`supported` for amount, destination, confirmation tracking and reorg
handling (`canConfirmRealPayments` in `src/lib/zcash/adapter.ts`). The demo
adapter reports `simulated` for all of them, so it can never confirm a
real payment.

## Implementation (Phase F)

| Part | Where | Notes |
|---|---|---|
| Scanner | `scanner/` (Rust) | `zcash_client_backend` 0.25, `zcash_keys` 0.17, `sapling-crypto` 0.9, `orchard` 0.16. Stateless HTTP service with a bearer token. Talks to lightwalletd or Zaino over the lightwallet gRPC API (read-only RPCs only). |
| Address derivation | `scanner/src/keys.rs` | Requires every shielded receiver the key has. With "allow", `zcash_keys` silently drops the Sapling receiver at the roughly half of indices where the Sapling diversifier is invalid; requiring it makes derivation skip to the next index where both receivers exist. |
| Trial decryption | `scanner/src/decrypt.rs` | Sapling outputs, Orchard actions and **Ironwood actions** (NU6.3). Ironwood shares Orchard's keys and addresses but uses note plaintext version 3 and its own domain (`IronwoodDomain`); a scanner that only decrypts Orchard would miss Ironwood payments. |
| Index allocation | `src/lib/server/testnet.ts` | Per key, starts at a random index in [2^40, 2^48) so it never collides with the low indices wallets hand out; advanced with a compare-and-set. Payments to indices that are not requests are ignored. |
| Scan loop | `src/lib/server/zcash/scan-job.ts` | Lease row (one scanner per deployment), cursor with block hash, `prev_hash` chaining across batches, walk-back to the fork point on reorg, mempool pass with dropped-transaction handling. |
| Verification | `src/lib/payments/verification.ts` | Pure function over observations: sum of outputs, depth of the shallowest, evidence-gated transitions, late payments to `verification_required`. |
| Expiry | `src/lib/payments/lifecycle.ts` | Chain requests expire only once a complete scan pass that began after the deadline found nothing (`chain_cursor.observedThrough`). |

Tests: the scanner's own tests use real keys from a seed, real note
encryption in all three pools, and its HTTP API against an in-process
chain. The TypeScript side is tested against a fake scanner that speaks
the same contract and returns real addresses generated by the scanner
(`tests/fixtures/zcash-testnet.json`). An opt-in suite
(`tests/integration/testnet-live.test.ts`) runs against a live scanner.

## Open risks

1. **Live verification.** The full path has not yet been run against a live
   testnet backend from this repository's build environment, which has no
   route to one. Run the opt-in live suite and a manual end-to-end payment
   (docs/TESTNET.md) before relying on it.
2. **Zaino and lightwalletd behaviour** under reorgs and for `GetMempoolTx`
   needs confirming on the deployed versions; the scanner checks block
   continuity itself rather than trusting the server.
3. **Scanning cost** grows with merchants times outputs. One pass decrypts
   every output with every key. Fine for a pilot; batch decryption is the
   next step at scale.
4. **Wallet compatibility** of the ZIP 321 URIs (amount, message) must be
   tested against current wallets before claiming support for each.
5. **Late detection.** "Late" is judged by when Yola first saw an output. If
   the scanner is down across a deadline, an on-time payment can be flagged
   for review. It is never lost or auto-confirmed.
6. **Mainnet** stays disabled (`YOLA_MAINNET_ENABLED=false`) until the
   above are done and reviewed.

## Sources

- zcashd end-of-life notice and archived repository — github.com/zcash/zcash
- Z3 stack (Zebra × Zaino × Zallet) overview — zecdev.org/zcash-z3
- Zaino — github.com/zingolabs/zaino; Zallet — github.com/zcash/zallet
- ZIP 321 and ZIP 316 — github.com/zcash/zips
- Reference gateways: samizdatproject/zeccheckout, ABCharlieEth/sotto,
  Lunaz-Gateway/lunaz; CipherPay forum thread
