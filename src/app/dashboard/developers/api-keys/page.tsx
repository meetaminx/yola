import { ApiKeysView } from "@/components/dashboard/api-keys-view";
import { EmptyState } from "@/components/dashboard/page-header";
import { ButtonLink } from "@/components/ui/button";
import { maskKey } from "@/lib/server/api-keys";
import { loadDashboard } from "@/lib/server/dashboard";
import { db } from "@/lib/server/db";

export const metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const { project } = await loadDashboard();
  if (!project) return <EmptyState title="No project selected" body="Create a project first." action={<ButtonLink href="/dashboard" size="sm">Create a project</ButtonLink>} />;
  // Only non-secret columns are selected. The hash never leaves the server either.
  const keys = await db().apiKey.findMany({
    where: { projectId: project.id },
    select: { id: true, name: true, mode: true, last4: true, createdAt: true, lastUsedAt: true, revokedAt: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <ApiKeysView
      projectId={project.id}
      keys={keys.map((k) => ({
        id: k.id,
        name: k.name,
        mode: k.mode,
        masked: maskKey(k.mode, k.last4),
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
      }))}
    />
  );
}
