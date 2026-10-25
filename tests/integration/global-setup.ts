import { execSync } from "node:child_process";

/**
 * Bring the dedicated test database up to date with `prisma migrate deploy`
 * (applies pending migrations, never drops data). Individual tests clear
 * rows between cases. Refuses any URL that does not name a test database.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/yola_test";
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run integration tests against "${dbName}": the database name must contain "test".`);
  }
  try {
    execSync("pnpm exec prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  } catch (err) {
    const out = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`prisma migrate deploy failed:\n${out.stdout?.toString() ?? ""}${out.stderr?.toString() ?? ""}`);
  }
}
