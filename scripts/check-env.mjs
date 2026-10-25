// Validates server environment variables without starting the app.
// Usage: pnpm env:check   (reads .env.local / .env, then the process env)
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const errors = [];
const need = (k, test, msg) => {
  const v = process.env[k];
  if (!v || !test(v)) errors.push(`${k}: ${msg}`);
};
const prod = process.env.NODE_ENV === "production";
need("DATABASE_URL", (v) => /^postgres(ql)?:\/\//.test(v), "must be a postgres:// connection string");
need("YOLA_SESSION_SECRET", (v) => v.length >= 32, "must be at least 32 characters");
need("YOLA_ENCRYPTION_KEY", (v) => Buffer.from(v, "base64").length === 32, "must be 32 random bytes, base64-encoded");
need("YOLA_PUBLIC_APP_URL", (v) => { try { const u = new URL(v); return !prod || u.protocol === "https:" || ["localhost", "127.0.0.1"].includes(u.hostname); } catch { return false; } }, prod ? "must be an https:// URL" : "must be a URL");
if (["true", "1"].includes(process.env.YOLA_MAINNET_ENABLED ?? "")) errors.push("YOLA_MAINNET_ENABLED: must be false in this release");
if (["true", "1"].includes(process.env.YOLA_TESTNET_ENABLED ?? "") && !process.env.ZCASH_BACKEND_URL) errors.push("ZCASH_BACKEND_URL: required when YOLA_TESTNET_ENABLED=true");
if (process.env.YOLA_JOBS_MODE === "cron" && (process.env.YOLA_CRON_SECRET ?? "").length < 32) errors.push("YOLA_CRON_SECRET: required (32+ characters) when YOLA_JOBS_MODE=cron");
if (prod && ["true", "1"].includes(process.env.YOLA_WEBHOOK_ALLOW_PRIVATE_NETWORKS ?? "")) errors.push("YOLA_WEBHOOK_ALLOW_PRIVATE_NETWORKS: must not be enabled in production");
if (prod && ["true", "1"].includes(process.env.YOLA_DISABLE_RATE_LIMIT ?? "")) errors.push("YOLA_DISABLE_RATE_LIMIT: must not be enabled in production");

if (errors.length) {
  console.error("Environment is invalid:\n  - " + errors.join("\n  - "));
  process.exit(1);
}
console.log("Environment OK.");
