import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";

/**
 * Data access layer for the dashboard. Every read of user-owned data goes
 * through these functions, which verify the session and project membership
 * against the database on each request.
 */

export const PROJECT_COOKIE = "yola_project";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Read the request first: it marks the render as request-time, so nothing
  // below (secrets, database) runs while Next.js prerenders at build time.
  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function listProjects(userId: string) {
  const rows = await db().projectMember.findMany({
    where: { userId },
    include: { project: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ ...r.project, role: r.role }));
}

/** Throws (as not found) unless the user belongs to the project. */
export async function requireMembership(userId: string, projectId: string) {
  const m = await db().projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { project: true },
  });
  if (!m) throw new Error("NOT_A_MEMBER");
  return m;
}

/**
 * The project the dashboard is showing: the one in the cookie if the user
 * is still a member, otherwise their first project, otherwise null.
 */
export async function currentProject(userId: string) {
  const projects = await listProjects(userId);
  if (projects.length === 0) return { project: null, projects };
  const wanted = (await cookies()).get(PROJECT_COOKIE)?.value;
  const project = projects.find((p) => p.id === wanted) ?? projects[0];
  return { project, projects };
}

/** For mutations: the user, and a project they belong to (validated). */
export async function requireProjectAccess(projectId: string) {
  const user = await requireUser();
  try {
    const membership = await requireMembership(user.id, projectId);
    return { user, project: membership.project, role: membership.role };
  } catch {
    throw new Error("You do not have access to that project.");
  }
}
