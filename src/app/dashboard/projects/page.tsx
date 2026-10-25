import { ProjectsView } from "@/components/dashboard/projects-view";
import { loadDashboard } from "@/lib/server/dashboard";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { project, projects } = await loadDashboard();
  return (
    <ProjectsView
      currentId={project?.id ?? null}
      projects={projects.map((p) => ({ id: p.id, name: p.name, description: p.description, role: p.role, createdAt: p.createdAt.toISOString() }))}
    />
  );
}
