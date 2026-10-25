# Running Yola on Zcash testnet

Testnet is off by default. This guide is for the operator of a Yola server.

> ZCASH TESTNET — TEST FUNDS HAVE NO MONETARY VALUE. Never send mainnet ZEC to a testnet address.

## Parts

```
Zebra (testnet) ──► Zaino or lightwalletd ──gRPC──► yola-scanner ──HTTP+token──► Yola server ──► Postgres
```

- **Zebra** synced to testnet.
- **Zaino** (or lightwalletd) serving the lightwallet gRPC API on top of it.
- **yola-scanner** (`scanner/`): derives per-request addresses and trial-decrypts
  compact blocks and mempool transactions. Stateless; holds no keys between requests.
- **Yola server** keeps encrypted viewing keys, the scan cursor, recent block hashes
  and observations in Postgres, and runs the scan loop.

`zcashd` is not supported (end of life, July 2026).

## 1. Build and run the scanner

Requires Rust 1.89 or newer.

```bash
cd scanner
cargo test --release          # crypto + HTTP API tests
cargo build --release
YOLA_SCANNER_LIGHTWALLETD_URL=https://your-zaino-or-lightwalletd:443 \
YOLA_SCANNER_TOKEN=$(openssl rand -hex 32) \
YOLA_SCANNER_LISTEN=127.0.0.1:9077 \
./target/release/yola-scanner
```

| Variable | Meaning |
|---|---|
| `YOLA_SCANNER_LIGHTWALLETD_URL` | `http://` or `https://` gRPC URL of Zaino or lightwalletd. https uses the Web PKI roots. |
| `YOLA_SCANNER_TOKEN` | Bearer token, 32+ characters. The Yola server sends it on every call. |
| `YOLA_SCANNER_LISTEN` | Listen address. Default `127.0.0.1:9077`. Keep it private. |
| `YOLA_SCANNER_NETWORK` | Must be `test` (default). Anything else exits: mainnet is disabled. |

The scanner connects lazily, so it starts even if the backend is down and reports
that on `/v1/health`. It refuses to scan when the backend reports a chain other than
`test`. Logs are JSON lines on stderr and never contain keys.

Check it:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:9077/v1/health
# {"status":"ok","chain_name":"test","tip_height":...}
```

## 2. Point Yola at it

```bash
YOLA_TESTNET_ENABLED=true
ZCASH_BACKEND_URL=http://127.0.0.1:9077      # the scanner
ZCASH_BACKEND_AUTH_TOKEN=<YOLA_SCANNER_TOKEN>
```

Apply migrations (`pnpm db:deploy`) and restart. `GET /api/v1/health` should report
`"testnet": "available"`. Scanning runs in the job loop: every 10 seconds in
`YOLA_JOBS_MODE=inline`, or on every `/api/internal/jobs` call in `cron` mode. Only
one server scans at a time (lease in `chain_cursor`).

## 3. Add a viewing key

In the dashboard, Settings, paste a **unified viewing key** exported from a testnet
wallet (`uviewtest1...` full or `uivktest1...` incoming). Yola:

- sends it to the scanner, which rejects seed phrases, spending keys, mainnet keys and junk;
- keeps only the incoming viewing key, encrypted with `YOLA_ENCRYPTION_KEY`;
- shows your wallet's default address so you can check it is the right wallet.

Use a dedicated wallet account for Yola. A leaked incoming viewing key reveals
incoming payments to that account but cannot move funds.

## 4. End-to-end check (manual)

1. Create a request with a **test** API key:
   ```bash
   curl -s https://your-yola/api/v1/payment-requests \
     -H "Authorization: Bearer ysk_test_..." -H "Content-Type: application/json" \
     -d '{"amount":"0.001","currency":"ZEC","network":"testnet"}'
   ```
2. Pay `payment_uri` from a funded testnet wallet (a faucet can provide TAZ).
3. Watch `GET /api/v1/payment-requests/{id}/status`: `payment_detected` within a scan
   of the transaction reaching the mempool, `confirming` once mined, `confirmed` at the
   project's required depth (default 10 blocks).
4. Confirm the funds appear in your own wallet. Yola never holds them.

## 5. Opt-in automated live tests

```bash
YOLA_LIVE_SCANNER_URL=http://127.0.0.1:9077 YOLA_LIVE_SCANNER_TOKEN=$TOKEN \
  pnpm test:integration testnet-live
```

Checks the backend is testnet, that address derivation matches
`tests/fixtures/zcash-testnet.json`, and that recent blocks and the mempool scan
cleanly. It does not send funds.

## What has been verified, and what has not

Verified in this repository:

- Key handling, address derivation and trial decryption with real keys and real
  note encryption for Sapling, Orchard and Ironwood (`cargo test`).
- The scanner HTTP API, including auth, input validation and wrong-network refusal.
- The full Yola flow (key storage, address allocation, scanning, reorgs, mempool
  drops, under/over payment, late payments, expiry gating, webhooks) against a fake
  scanner that returns real derived addresses.

Not yet verified here: a run against a live testnet backend. The build environment
for this release has no network route to one. Do steps 4 and 5 before relying on it.

## Recovery

- **Scanner down:** requests stay open and do not expire; nothing is confirmed.
  When it returns, the loop catches up from the cursor (up to 2,000 blocks per pass).
- **Reorg:** handled automatically up to 100 blocks deep. Confirmed payments affected
  by a reorg move to `verification_required` for review.
- **Lost `YOLA_ENCRYPTION_KEY`:** stored viewing keys cannot be decrypted. Remove and
  re-add the key in Settings (open testnet requests must be closed first).
