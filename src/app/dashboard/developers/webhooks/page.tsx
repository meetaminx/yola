import { EmptyState } from "@/components/dashboard/page-header";
import { WebhooksView } from "@/components/dashboard/webhooks-view";
import { ButtonLink } from "@/components/ui/button";
import { loadDashboard } from "@/lib/server/dashboard";
import { db } from "@/lib/server/db";

export const metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const { project } = await loadDashboard();
  if (!project) return <EmptyState title="No project selected" body="Create a project first." action={<ButtonLink href="/dashboard" size="sm">Create a project</ButtonLink>} />;

  const [endpoints, deliveries] = await Promise.all([
    // The encrypted secret is never selected for display.
    db().webhookEndpoint.findMany({
      where: { projectId: project.id },
      select: { id: true, url: true, description: true, eventTypes: true, enabled: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db().webhookDelivery.findMany({
      where: { projectId: project.id },
      include: { event: { select: { id: true, type: true } }, endpoint: { select: { url: true } }, attempts: { orderBy: { attempt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <WebhooksView
      projectId={project.id}
      endpoints={endpoints.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))}
      deliveries={deliveries.map((d) => ({
        id: d.id,
        eventId: d.event.id,
        eventType: d.event.type,
        endpointUrl: d.endpoint.url,
        status: d.status,
        attemptCount: d.attemptCount,
        lastStatusCode: d.lastStatusCode,
        lastError: d.lastError,
        nextAttemptAt: d.nextAttemptAt.toISOString(),
        createdAt: d.createdAt.toISOString(),
        attempts: d.attempts.map((a) => ({ attempt: a.attempt, startedAt: a.startedAt.toISOString(), durationMs: a.durationMs, statusCode: a.statusCode, error: a.error })),
      }))}
    />
  );
}
