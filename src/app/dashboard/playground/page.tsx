import { DashboardPlayground } from "@/components/dashboard/dashboard-playground";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { ButtonLink } from "@/components/ui/button";
import { loadDashboard } from "@/lib/server/dashboard";

export const metadata = { title: "Playground" };

export default async function DashboardPlaygroundPage() {
  const { project } = await loadDashboard();
  if (!project) {
    return <EmptyState title="No project selected" body="Create a project first." action={<ButtonLink href="/dashboard" size="sm">Create a project</ButtonLink>} />;
  }
  return (
    <>
      <PageHeader
        title="Playground"
        description={`Requests here run on this server for ${project.name}, using your session instead of an API key. Demo payments are stored and appear under Payments; webhooks are delivered to your endpoints.`}
      />
      <DashboardPlayground projectId={project.id} />
    </>
  );
}
