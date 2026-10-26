// Vercel build: apply database migrations on production deploys only, then build.
// Preview deploys never touch the production schema. Migrations are
// additive and applied with `migrate deploy` (never `migrate reset`).
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set for Production. Add it in Vercel, Settings, Environment Variables.");
    process.exit(1);
  }
  run("pnpm exec prisma migrate deploy");
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`);
}
run("pnpm exec next build");
