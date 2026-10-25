# Yola

**Zcash payments. Built for builders.**
Everything developers need to accept ZEC. One integration at a time.

Yola is noncustodial developer infrastructure for accepting ZEC: payment
requests, ZIP 321 QR codes, status tracking and signed webhooks.

> Pre-release. Production deployment requires a security review, threat
> modelling and testing. Mainnet is disabled.

## Run it

Requires Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build && pnpm start` | Production build and server |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm typecheck` | Strict TypeScript |
| `pnpm lint` | ESLint |

## Build status

| Stage | Scope | Status |
|---|---|---|
| 1. Visual experience | Brand tokens, motion system, landing page, hero rail, live demo, docs shell | **Done** |
| 2. Functional demo | Playground route, sample store, `<YolaPaymentStatus />` | Next |
| 3. Backend | Postgres + Prisma, `/api/v1`, auth, idempotency, webhook delivery | Planned |
| 4. Zcash | Zebra + Zaino + viewing-key scanner on testnet | Planned |
| 5. Developer experience | Full docs, examples, e2e tests, deployment guide | Planned |
| 6. Polish | Accessibility and responsive audit, motion tuning | Planned |

Already working and tested in Stage 1: exact amount parsing (bigint
zatoshis), the evidence-gated payment state machine, the demo adapter,
the ZIP 321 URI builder (checked against the spec's own example), address
prefix classification including ZIP 316 Revision 2, webhook HMAC
signatures, and the SDK client.

## Routes

- `/` — landing page with the live simulator (`/#demo`)
- `/docs` — introduction
- `/docs/quickstart`, `/docs/api`, `/docs/sdks`, `/docs/qr`,
  `/docs/webhooks`, `/docs/testnet`, `/docs/security`, `/docs/architecture`

## How payments are verified

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short: each request
gets its own diversified shielded address derived from the merchant's
incoming viewing key; a scanner over Zebra + Zaino trial-decrypts outputs,
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
