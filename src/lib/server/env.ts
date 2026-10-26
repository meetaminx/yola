import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once on first use (not at import time, so
 * `next build` works without production secrets). Any problem throws a
 * single error listing every invalid variable.
 */

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const base64Key32 = z
  .string()
  .refine((s) => {
    try {
      return Buffer.from(s, "base64").length === 32;
    } catch {
      return false;
    }
  }, "must be 32 random bytes, base64-encoded (openssl rand -base64 32)");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// connection string"),
    YOLA_SESSION_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -base64 32)"),
    YOLA_ENCRYPTION_KEY: base64Key32,
    YOLA_PUBLIC_APP_URL: z.url("must be the public base URL, e.g. https://yola.example.com"),
    YOLA_DEFAULT_NETWORK: z.enum(["demo", "testnet", "mainnet"]).default("demo"),
    YOLA_TESTNET_ENABLED: bool,
    YOLA_MAINNET_ENABLED: bool,
    ZCASH_BACKEND_URL: z.url().optional().or(z.literal("").transform(() => undefined)),
    ZCASH_BACKEND_AUTH_TOKEN: z.string().optional(),
    /** "inline": the web server runs the job loop. "cron": only /api/internal/jobs runs jobs. "off": neither. */
    YOLA_JOBS_MODE: z.enum(["inline", "cron", "off"]).default("inline"),
    YOLA_CRON_SECRET: z.string().min(32).optional().or(z.literal("").transform(() => undefined)),
    /** Vercel sends this as "Authorization: Bearer <CRON_SECRET>" on scheduled calls. Accepted in place of YOLA_CRON_SECRET. */
    CRON_SECRET: z.string().min(32).optional().or(z.literal("").transform(() => undefined)),
    /** Development only: allow webhook URLs on localhost and private networks. */
    YOLA_WEBHOOK_ALLOW_PRIVATE_NETWORKS: bool,
    /** Trust X-Forwarded-For for client IPs. Enable only behind a proxy you control that sets it. */
    YOLA_TRUST_PROXY: bool,
    /** Comma-separated IPs/CIDRs of your reverse proxies (used with YOLA_TRUST_PROXY). */
    YOLA_TRUSTED_PROXIES: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [])),
    YOLA_DISABLE_RATE_LIMIT: bool,
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    YOLA_EXAMPLE_STORE_SECRET_KEY: z.string().optional(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.YOLA_MAINNET_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["YOLA_MAINNET_ENABLED"],
        message: "mainnet cannot be enabled in this release: the mainnet verification path has not been built or reviewed",
      });
    }
    if (env.YOLA_TESTNET_ENABLED && !env.ZCASH_BACKEND_URL) {
      ctx.addIssue({ code: "custom", path: ["ZCASH_BACKEND_URL"], message: "is required when YOLA_TESTNET_ENABLED=true" });
    }
    if (env.YOLA_TESTNET_ENABLED && (env.ZCASH_BACKEND_AUTH_TOKEN ?? "").length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["ZCASH_BACKEND_AUTH_TOKEN"],
        message: "must be the scanner's token (32+ characters) when YOLA_TESTNET_ENABLED=true",
      });
    }
    if (env.NODE_ENV === "production" && env.YOLA_WEBHOOK_ALLOW_PRIVATE_NETWORKS) {
      ctx.addIssue({
        code: "custom",
        path: ["YOLA_WEBHOOK_ALLOW_PRIVATE_NETWORKS"],
        message: "must not be enabled in production (it would allow requests to internal services)",
      });
    }
    if (env.NODE_ENV === "production" && env.YOLA_DISABLE_RATE_LIMIT) {
      ctx.addIssue({ code: "custom", path: ["YOLA_DISABLE_RATE_LIMIT"], message: "must not be enabled in production" });
    }
    if (env.YOLA_JOBS_MODE === "cron" && !env.YOLA_CRON_SECRET && !env.CRON_SECRET) {
      ctx.addIssue({ code: "custom", path: ["YOLA_CRON_SECRET"], message: "(or CRON_SECRET on Vercel) is required when YOLA_JOBS_MODE=cron" });
    }
    const appUrl = new URL(env.YOLA_PUBLIC_APP_URL);
    const isLocalhost = appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1";
    if (env.NODE_ENV === "production" && appUrl.protocol !== "https:" && !isLocalhost) {
      ctx.addIssue({ code: "custom", path: ["YOLA_PUBLIC_APP_URL"], message: "must use https:// in production (http is allowed only for localhost)" });
    }
    if (env.YOLA_DEFAULT_NETWORK === "mainnet") {
      ctx.addIssue({ code: "custom", path: ["YOLA_DEFAULT_NETWORK"], message: "cannot be mainnet while mainnet is disabled" });
    }
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export class EnvError extends Error {}

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new EnvError(`Invalid server environment:\n${lines.join("\n")}\nSee .env.example.`);
  }
  cached = result.data;
  return cached;
}

/** True when the database-backed features can run (used to degrade gracefully). */
export function backendConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Test helper. */
export function resetEnvCache() {
  cached = undefined;
}
