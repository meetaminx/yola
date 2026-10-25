import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { getEnv } from "./env";

/**
 * Better Auth: database-backed sessions in Postgres, email and password
 * sign-in, and GitHub sign-in when GITHUB_CLIENT_ID/SECRET are set.
 * Created on first use so builds never need secrets.
 */

function create() {
  const env = getEnv();
  const github =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : undefined;
  return betterAuth({
    appName: "Yola",
    baseURL: env.YOLA_PUBLIC_APP_URL,
    secret: env.YOLA_SESSION_SECRET,
    database: prismaAdapter(db(), { provider: "postgresql" }),
    trustedOrigins: [new URL(env.YOLA_PUBLIC_APP_URL).origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    ...(github ? { socialProviders: github } : {}),
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: !env.YOLA_DISABLE_RATE_LIMIT,
      window: 60,
      max: 30,
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      // Client IPs come from X-Forwarded-For only behind declared proxies. Without
      // one, the header is client-controlled, so Yola's own per-account and
      // global limits (see the /api/auth route) are the protection that holds.
      ipAddress: env.YOLA_TRUST_PROXY
        ? { ipAddressHeaders: ["x-forwarded-for"], trustedProxies: env.YOLA_TRUSTED_PROXIES }
        : undefined,
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof create>;
const globalForAuth = globalThis as unknown as { yolaAuth?: Auth };

export function auth(): Auth {
  globalForAuth.yolaAuth ??= create();
  return globalForAuth.yolaAuth;
}

export function githubEnabled() {
  const env = getEnv();
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}
