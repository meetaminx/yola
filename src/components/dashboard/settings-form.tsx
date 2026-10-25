"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { updateProjectAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export function SettingsForm({
  project,
  canEdit,
}: {
  project: { id: string; name: string; description: string | null; defaultNetwork: string; testnetConfirmations: number };
  canEdit: boolean;
}) {
  const ids = { name: useId(), desc: useId(), net: useId(), conf: useId() };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateProjectAction(project.id, {
        name: String(f.get("name") ?? ""),
        description: String(f.get("description") ?? ""),
        defaultNetwork: String(f.get("defaultNetwork") ?? "demo"),
        testnetConfirmations: String(f.get("testnetConfirmations") ?? ""),
      });
      if (!r.ok) {
        setErrors(r.fields ?? { _: r.error });
        toast({ tone: "error", message: r.error });
        return;
      }
      setErrors({});
      toast({ tone: "success", message: "Settings saved" });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <fieldset disabled={!canEdit || pending} className="flex flex-col gap-5">
        <Field label="Project name" htmlFor={ids.name} error={errors.name}>
          <Input id={ids.name} name="name" defaultValue={project.name} maxLength={80} aria-invalid={errors.name ? true : undefined} />
        </Field>
        <Field label="Description" htmlFor={ids.desc} error={errors.description}>
          <Textarea id={ids.desc} name="description" rows={2} maxLength={280} defaultValue={project.description ?? ""} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Default network" htmlFor={ids.net} error={errors.defaultNetwork} hint="Used by the dashboard playground. The API always uses the network you send.">
            <Select id={ids.net} name="defaultNetwork" defaultValue={project.defaultNetwork}>
              <option value="demo">Demo (simulated)</option>
              <option value="testnet">Testnet</option>
            </Select>
          </Field>
          <Field label="Testnet confirmations required" htmlFor={ids.conf} error={errors.testnetConfirmations} hint="Blocks on top of the payment's block before it counts as confirmed.">
            <Input id={ids.conf} name="testnetConfirmations" type="number" min={1} max={100} defaultValue={project.testnetConfirmations} aria-invalid={errors.testnetConfirmations ? true : undefined} />
          </Field>
        </div>
      </fieldset>
      {errors._ && <p role="alert" className="text-sm text-danger">{errors._}</p>}
      <div>
        {canEdit ? (
          <Button type="submit" loading={pending}>
            Save settings
          </Button>
        ) : (
          <p className="text-sm text-muted">Only project owners can change settings.</p>
        )}
      </div>
    </form>
  );
}
