# Yola architecture and payment verification

Status: Phase 1 decision record, October 2026. Revisit before Stage 4.

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

## Open risks for Stage 4

1. **Scanner implementation.** Trial decryption needs librustzcash
   (`zcash_client_backend`). Options: a small Rust sidecar exposing a narrow
   HTTP API to the TypeScript backend, or `zcash-devtool` as a reference.
   Node bindings are not mature; do not reimplement the cryptography in JS.
2. **Address derivation from a UIVK** must also run in that sidecar.
3. **Zaino API stability**: pin a release (0.5.x line at the time of
   writing) and test reorg behaviour on testnet.
4. **Scanning cost** grows with merchants × outputs. Fine for a pilot;
   batch decryption and per-merchant birthday heights are required at scale.
5. **Wallet compatibility** of ZIP 321 URIs (amount, memo handling) must be
   tested against Zashi/Zodl, Ywallet and Zingo before claiming support.
6. **Mainnet** stays disabled (`YOLA_MAINNET_ENABLED=false`) until the
   above are tested and reviewed.

## Sources

- zcashd end-of-life notice and archived repository — github.com/zcash/zcash
- Z3 stack (Zebra × Zaino × Zallet) overview — zecdev.org/zcash-z3
- Zaino — github.com/zingolabs/zaino; Zallet — github.com/zcash/zallet
- ZIP 321 and ZIP 316 — github.com/zcash/zips
- Reference gateways: samizdatproject/zeccheckout, ABCharlieEth/sotto,
  Lunaz-Gateway/lunaz; CipherPay forum thread
