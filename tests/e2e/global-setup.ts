import { execSync } from "node:child_process";

/** Apply migrations to the e2e database (non-destructive). */
export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@localhost:5432/yola_e2e";
  if (!/e2e|test/i.test(new URL(url).pathname)) throw new Error(`Refusing to migrate ${url}: not an e2e/test database.`);
  execSync("pnpm exec prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
