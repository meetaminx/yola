import { connection } from "next/server";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

// GitHub sign-in is shown only when the server has it configured, which is
// known at request time, not build time.
async function Form({ mode }: { mode: "sign-in" | "sign-up" }) {
  await connection();
  const github = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  return <AuthForm mode={mode} github={github} />;
}

export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <Suspense fallback={<div className="h-96 w-full max-w-[400px] animate-pulse rounded-xl bg-surface" aria-busy="true" />}>
      <Form mode={mode} />
    </Suspense>
  );
}
