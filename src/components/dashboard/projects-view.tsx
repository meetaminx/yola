"use client";

import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { switchProjectAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { CreateProjectForm } from "./create-project-form";
import { PageHeader } from "./page-header";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  role: string;
  createdAt: string;
}

export function ProjectsView({ projects, currentId }: { projects: ProjectRow[]; currentId: string | null }) {
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function open_(id: string) {
    start(async () => {
      const r = await switchProjectAction(id);
      if (!r.ok) return toast({ tone: "error", message: r.error });
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project has its own API keys, payment requests, webhooks and viewing key. Nothing is shared between projects."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden /> New project
          </Button>
        }
      />
      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-normal">Name</th>
              <th scope="col" className="hidden px-4 py-3 font-normal md:table-cell">Project ID</th>
              <th scope="col" className="hidden px-4 py-3 font-normal sm:table-cell">Your role</th>
              <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <p className="text-text">{p.name}</p>
                  {p.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{p.description}</p>}
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs text-muted md:table-cell">{p.id}</td>
                <td className="hidden px-4 py-3 capitalize text-muted sm:table-cell">{p.role}</td>
                <td className="px-4 py-3 text-right">
                  {p.id === currentId ? (
                    <span className="text-xs text-signal">Current</span>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => open_(p.id)}>
                      Open
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="New project" description="You can rename it later in settings.">
        <CreateProjectForm onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
