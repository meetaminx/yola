"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createProjectAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export function CreateProjectForm({ onDone, submitLabel = "Create project" }: { onDone?: () => void; submitLabel?: string }) {
  const ids = { name: useId(), desc: useId(), nameErr: useId() };
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const toast = useToast();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    start(async () => {
      const r = await createProjectAction({ name: String(form.get("name") ?? ""), description: String(form.get("description") ?? "") });
      if (!r.ok) {
        setErrors(r.fields ?? { _: r.error });
        return;
      }
      setErrors({});
      toast({ tone: "success", message: "Project created" });
      onDone?.();
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Project name" htmlFor={ids.name} error={errors.name} errorId={ids.nameErr} hint="Usually the name of the app or shop that will accept ZEC.">
        <Input id={ids.name} name="name" required maxLength={80} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? ids.nameErr : undefined} />
      </Field>
      <Field label={<>Description <span className="text-muted">(optional)</span></>} htmlFor={ids.desc} error={errors.description}>
        <Textarea id={ids.desc} name="description" rows={2} maxLength={280} />
      </Field>
      {errors._ && (
        <p role="alert" className="text-sm text-danger">
          {errors._}
        </p>
      )}
      <div>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
