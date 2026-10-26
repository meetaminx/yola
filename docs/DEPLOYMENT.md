# Deploying Yola to Vercel with Neon

This gets the site, docs, playground, sample store, accounts, dashboard, API and
webhooks running on the **demo** network. Testnet needs the separate scanner
service (see `TESTNET.md`) and stays off here. Mainnet is disabled in this release.

Time: about 15 minutes. You need a GitHub account with access to the repo, a
Vercel account and a domain you control.

## 1. Import the project

1. In Vercel, **Add New, Project**, and import the GitHub repo.
2. Framework preset: **Next.js**. Leave the build settings alone: `vercel.json`
   sets the build command, which applies database migrations on production
   deploys only, then builds.
3. Do not deploy yet. Add the database and variables first.

## 2. Add the database

1. In the Vercel project, **Storage, Create Database, Neon (Postgres)**, and
   connect it to the project for all environments.
2. Neon adds `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED`
   (direct, used for migrations). Nothing else to do.
3. Optional: in Neon, enable a branch per preview deploy so previews never share
   the production database. Previews never run migrations either way.

## 3. Environment variables

Vercel, **Settings, Environment Variables**. Generate each secret separately:

```bash
openssl rand -base64 32   # YOLA_SESSION_SECRET
openssl rand -base64 32   # YOLA_ENCRYPTION_KEY (must be exactly this form: 32 bytes, base64)
openssl rand -hex 32      # CRON_SECRET
```

| Variable | Value | Notes |
|---|---|---|
| `YOLA_SESSION_SECRET` | random, 32+ chars | Signs sessions. Changing it signs everyone out. |
| `YOLA_ENCRYPTION_KEY` | 32 random bytes, base64 | Encrypts webhook secrets and viewing keys. **Back it up.** Losing it makes stored webhook secrets unreadable. |
| `YOLA_PUBLIC_APP_URL` | `https://your-domain.com` | Must be https. Used for auth callbacks and CSRF checks. Set it to the custom domain. |
| `YOLA_JOBS_MODE` | `cron` | Serverless: no background loop. Work runs right after each request, plus the scheduled run. |
| `CRON_SECRET` | random, 32+ chars | Vercel sends it to `/api/internal/jobs`. |
| `YOLA_TRUST_PROXY` | `true` | Vercel sets the client IP in `X-Forwarded-For`; rate limits use it. |
| `YOLA_OPERATOR_NAME` | your name or company | Shown on /privacy and /terms. |
| `YOLA_CONTACT_EMAIL` | your contact address | Shown on /privacy and /terms for data requests. |
| `YOLA_TESTNET_ENABLED` | `false` | Leave off until a scanner is running. |
| `YOLA_MAINNET_ENABLED` | `false` | `true` is rejected. |
| `LOG_LEVEL` | `info` | |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | optional | GitHub sign-in. Callback: `https://your-domain.com/api/auth/callback/github`. |

Never set any of these with a `NEXT_PUBLIC_` prefix. `pnpm env:check` validates
a set of variables locally.

## 4. Deploy and check

1. **Deploy.** The build log shows `prisma migrate deploy` applying migrations,
   then the Next.js build.
2. Open `https://<deployment>/api/v1/health`. Expect `"status":"ok"`,
   `"database":"ok"`, `"jobs":{"mode":"cron"}`.
3. Sign up, create a project, create a test API key, and create a demo payment
   in the dashboard playground.
4. Add a webhook endpoint (a request bin you control works), send a test event,
   and confirm it arrives within seconds with a valid signature.

## 5. Domain

1. Vercel, **Settings, Domains**, add your domain and set the DNS records Vercel
   shows. HTTPS certificates are issued automatically.
2. Set `YOLA_PUBLIC_APP_URL` to `https://your-domain.com` and redeploy.
3. Optionally redirect the `*.vercel.app` address to the domain.

## Background jobs on Vercel

- After any request that changes a payment or queues a webhook, Yola processes
  pending work right after responding (Next.js `after()`).
- `vercel.json` schedules `/api/internal/jobs` once a day, the most the Hobby
  plan allows. It sweeps anything left over.
- Webhook **retries** (1 min, 5 min, 30 min...) and **expiry** of untouched
  requests happen on the next request or the next scheduled run. Requests still
  show as expired when read after their deadline. For prompt retries either:
  - on Vercel Pro, change the schedule to `* * * * *`, or
  - point an external scheduler at `POST /api/internal/jobs` every minute with
    `Authorization: Bearer $CRON_SECRET`.

## Backups and recovery

- **Database:** Neon keeps point-in-time history (the window depends on plan).
  To restore, create a branch at a past time and point `DATABASE_URL` at it, or
  restore in place from the Neon console. Test a restore before launch.
- **Secrets:** keep `YOLA_ENCRYPTION_KEY` and `YOLA_SESSION_SECRET` in a password
  manager. The database is useless for webhooks without the encryption key.
- **Rollback:** Vercel **Instant Rollback** restores a previous deployment.
  Migrations are additive, so older code runs against a newer schema.

## Production checklist

Launch rule:

- [ ] Custom domain connected, `YOLA_PUBLIC_APP_URL` set to it
- [ ] Favicon shows in the browser tab (the Yola mark)
- [ ] /privacy and /terms show your operator name and contact email
- [ ] No "Made with AI" or hosting badges anywhere on the site
- [ ] Privacy policy and terms reviewed by someone qualified for your jurisdiction

Configuration:

- [ ] `/api/v1/health` reports ok, database ok, jobs mode cron
- [ ] Secrets generated fresh for production, stored in a password manager
- [ ] `YOLA_MAINNET_ENABLED=false`, `YOLA_TESTNET_ENABLED=false` (until a scanner runs)
- [ ] No `YOLA_WEBHOOK_ALLOW_PRIVATE_NETWORKS` or `YOLA_DISABLE_RATE_LIMIT` in production (rejected anyway)
- [ ] Neon restore tested once

Behaviour:

- [ ] Sign-up, sign-in and sign-out work on the domain
- [ ] Test API key created, demo payment created and simulated to confirmed
- [ ] Webhook test event delivered and signature verified
- [ ] Unknown page shows the Yola 404; API errors return JSON with a request ID
- [ ] Response headers include `Strict-Transport-Security`, `X-Frame-Options: DENY`,
      `Content-Security-Policy` (check with `curl -sI https://your-domain.com`)

## Threat model (summary)

| Asset | Threat | Control |
|---|---|---|
| Accounts | Credential stuffing | 12-char minimum, per-email sign-in limit, global sign-up limit, IP limits |
| API keys | Leak | Stored hashed, shown once, revocable, test/live separation, never in browser code |
| Webhooks | Forgery, replay | HMAC-SHA256 with timestamp; receivers reject old timestamps |
| Webhook delivery | SSRF into internal networks | DNS resolved and checked, private ranges blocked, no redirects, pinned address |
| Payment status | Faked "paid" from a browser | Status changes only on server-side evidence; demo payments can never become real |
| Viewing keys | Disclosure | Encrypted at rest, never logged or returned; cannot spend funds |
| Funds | Theft | Yola never holds funds or spending keys |
| Database | Loss | Neon point-in-time recovery; encryption key backed up separately |

See `ARCHITECTURE.md` for payment verification and `/docs/security` for the
developer-facing security model.
