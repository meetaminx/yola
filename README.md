# Yola

**Zcash payments. Built for builders.**
Everything developers need to accept ZEC. One integration at a time.

Yola is noncustodial developer infrastructure for accepting ZEC: payment
requests, ZIP 321 QR codes, status tracking and signed webhooks.

> Pre-release. Production deployment requires a security review, threat
> modelling and testing. Mainnet is disabled.

## Run it

Requires Node.js 20+, pnpm and PostgreSQL 16 (the marketing site, docs,
playground and sample store also run without a database).

```bash
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL and the secrets
pnpm db:deploy               # apply migrations
pnpm dev                     # http://localhost:3000
```

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build && pnpm start` | Production build and server |
| `pnpm typecheck`, `pnpm lint` | Strict TypeScript, ESLint |
| `pnpm test` | Unit tests |
| `pnpm test:integration` | API, database, webhook and testnet-flow tests (needs PostgreSQL) |
| `pnpm test:e2e` | Browser tests against a production build |
| `pnpm env:check` | Validate environment variables |
| `cd scanner && cargo test --release` | Zcash scanner tests (Rust) |

## Deploy

[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Vercel + Neon, environment
variables, domain, backups, threat model and the production checklist.
Testnet operation: [docs/TESTNET.md](docs/TESTNET.md).

## Status

| Part | Status |
|---|---|
| Site, docs, playground, sample store, `<YolaPaymentStatus />` | Done |
| Accounts, projects, API keys, `/api/v1`, idempotency, rate limits | Done |
| Signed webhooks with retries and SSRF protection | Done |
| Zcash testnet: viewing-key scanner (Sapling, Orchard, Ironwood) | Built and tested; not yet run against a live testnet |
| Mainnet | Disabled |

## Routes

- `/`, `/playground`, `/examples/store`, `/privacy`, `/terms`
- `/docs` and `/docs/{quickstart,api,sdks,qr,webhooks,testnet,security,architecture}`
- `/sign-in`, `/sign-up`, `/dashboard/*`
- `/api/v1/payment-requests`, `/api/v1/webhooks/test`, `/api/v1/health`

## How payments are verified

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short: each request
gets its own diversified shielded address derived from the merchant's
incoming viewing key; a scanner reading compact blocks from lightwalletd or Zaino trial-decrypts outputs,
and the address identifies the request. Memos are never used for
attribution. zcashd is end-of-life and not supported.

## Layout

```
src/
  app/(marketing)/      landing page
  app/docs/             documentation
  components/ui/        buttons, code blocks, status and environment badges
  components/motion/    duration tokens, named transitions, reduced-motion provider
  components/marketing/ nav, payment rail, features, integration tabs, footer
  components/payments/  live demo
  components/qr/        QR rendering and PNG/SVG download
  lib/payments/         amounts, state machine, types, demo adapter
  lib/zcash/            address classification, ZIP 321, adapter capability contract
  lib/webhooks/         HMAC signatures
  lib/content/          code snippets shared by landing page and docs
  sdk/                  TypeScript client (import as @yola/sdk)
tests/unit/             Vitest
docs/ARCHITECTURE.md    verification decision record
```

Fonts (Space Grotesk, Inter, JetBrains Mono) are self-hosted from
`src/app/fonts`, so builds never depend on a font CDN.
