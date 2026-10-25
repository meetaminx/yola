# yola-scanner

Stateless service that Yola's server calls to:

- validate a merchant's unified viewing key and reduce it to the incoming viewing key (UIVK);
- derive per-request shielded addresses (Sapling + Orchard receivers, no transparent);
- trial-decrypt compact blocks and mempool transactions (Sapling, Orchard, Ironwood)
  fetched from lightwalletd or Zaino.

Built on the official Zcash crates (`zcash_client_backend`, `zcash_keys`,
`sapling-crypto`, `orchard`). Testnet only: it refuses to start for mainnet and refuses
to scan if the backend is not on testnet. It never sees spending keys or seeds and
never broadcasts transactions.

```bash
cargo test --release
cargo build --release
YOLA_SCANNER_LIGHTWALLETD_URL=https://... YOLA_SCANNER_TOKEN=... ./target/release/yola-scanner
```

API (all routes need `Authorization: Bearer $YOLA_SCANNER_TOKEN`):

| Route | Body | Returns |
|---|---|---|
| `GET /v1/health` | | `status`, `chain_name`, `tip_height` |
| `POST /v1/keys/inspect` | `{viewing_key}` | `uivk`, `fingerprint`, `was_full_viewing_key`, `first_address` |
| `POST /v1/addresses` | `{uivk, index}` | `{address, index}` (index may advance past invalid Sapling diversifiers) |
| `POST /v1/scan` | `{start, end, keys:[{id,uivk}]}` (max 1,000 blocks) | `tip_height`, `blocks` (hash chain), `matches` |
| `POST /v1/mempool` | `{keys}` | `tip_height`, `matches` (height null) |
| `GET /v1/blocks/{height}` | | `block` summary |

`cargo run --release --example fixtures` regenerates `../tests/fixtures/zcash-testnet.json`
(a public test seed, never fund it). See `../docs/TESTNET.md` for operation.
