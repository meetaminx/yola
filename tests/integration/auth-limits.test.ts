import { beforeEach, describe, expect, it } from "vitest";
import * as authRoute from "@/app/api/auth/[...all]/route";
import { resetDb } from "./fixtures";

beforeEach(resetDb);

function signIn(email: string, ip: string) {
  return authRoute.POST(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", "X-Forwarded-For": ip },
      body: JSON.stringify({ email, password: "wrong-password-123" }),
    }),
  );
}

describe("sign-in limits that do not depend on client IP", () => {
  it("locks an account after 10 attempts even when every attempt claims a different IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await signIn("victim@example.com", `198.51.100.${i + 1}`)).status);
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Another account is unaffected.
    expect((await signIn("someone-else@example.com", "198.51.100.200")).status).not.toBe(429);
  });

  it("treats email case and whitespace as the same account", async () => {
    for (let i = 0; i < 10; i++) await signIn(i % 2 ? "Victim@Example.com" : " victim@example.com ", `192.0.2.${i + 1}`);
    expect((await signIn("VICTIM@example.com", "192.0.2.99")).status).toBe(429);
  });
});
