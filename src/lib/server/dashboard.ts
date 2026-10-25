import "server-only";
import { currentProject, requireUser } from "./session";

/** Everything a dashboard page needs: the verified user and their current project. */
export async function loadDashboard() {
  const user = await requireUser();
  const { project, projects } = await currentProject(user.id);
  return { user, project, projects };
}
