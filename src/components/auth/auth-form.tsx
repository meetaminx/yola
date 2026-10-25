"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { transition } from "@/components/motion/tokens";
import { Button } from "@/components/ui/button";
import { signIn, signUp } from "@/lib/auth-client";

/** Only same-site relative paths are allowed as a post-login destination. */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/dashboard";
  return value;
}

const input =
  "h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 text-[15px] text-text outline-none transition-colors focus:border-brand aria-[invalid=true]:border-danger";

export function AuthForm({ mode, github }: { mode: "sign-in" | "sign-up"; github: boolean }) {
  const ids = { name: useId(), email: useId(), password: useId(), err: useId() };
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    if (mode === "sign-up" && password.length < 12) {
      setError("Use a password of at least 12 characters.");
      return;
    }
    setPending(true);
    setError(null);
    const result =
      mode === "sign-in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: name || email.split("@")[0] });
    if (result.error) {
      setPending(false);
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : mode === "sign-in"
            ? "That email and password do not match an account."
            : (result.error.message ?? "The account could not be created."),
      );
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="type-heading text-3xl">{mode === "sign-in" ? "Sign in to Yola" : "Create your Yola account"}</h1>
      <p className="mt-2 text-sm text-muted">
        {mode === "sign-in" ? "Manage projects, API keys and webhooks." : "Start with test keys and the simulator. No ZEC needed."}
      </p>

      {github && (
        <>
          <Button
            type="button"
            variant="secondary"
            className="mt-8 w-full"
            onClick={() => signIn.social({ provider: "github", callbackURL: next })}
          >
            Continue with GitHub
          </Button>
          <div className="my-6 flex items-center gap-3 text-xs text-faint" aria-hidden>
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={submit} noValidate className={github ? "flex flex-col gap-4" : "mt-8 flex flex-col gap-4"} aria-describedby={error ? ids.err : undefined}>
        {mode === "sign-up" && (
          <div>
            <label htmlFor={ids.name} className="mb-1.5 block text-sm text-text">
              Name
            </label>
            <input id={ids.name} name="name" autoComplete="name" className={input} />
          </div>
        )}
        <div>
          <label htmlFor={ids.email} className="mb-1.5 block text-sm text-text">
            Email
          </label>
          <input id={ids.email} name="email" type="email" required autoComplete="email" className={input} aria-invalid={error ? true : undefined} />
        </div>
        <div>
          <label htmlFor={ids.password} className="mb-1.5 block text-sm text-text">
            Password {mode === "sign-up" && <span className="text-muted">(at least 12 characters)</span>}
          </label>
          <input
            id={ids.password}
            name="password"
            type="password"
            required
            minLength={mode === "sign-up" ? 12 : undefined}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className={input}
            aria-invalid={error ? true : undefined}
          />
        </div>
        <AnimatePresence initial={false}>
          {error && (
            <motion.p
              id={ids.err}
              role="alert"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: [-4, 3, -2, 0] }}
              exit={{ opacity: 0 }}
              transition={transition.reveal}
              className="text-sm text-danger"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {mode === "sign-in" ? (
          <>
            New to Yola?{" "}
            <Link href={`/sign-up${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-brand-soft hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-brand-soft hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
