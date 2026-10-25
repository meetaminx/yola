import { Suspense } from "react";
import { MenuButton, ShellProvider, Sidebar } from "@/components/dashboard/shell";
import { ProjectSwitcher, UserMenu } from "@/components/dashboard/topbar-controls";
import { ToastProvider } from "@/components/ui/toast";
import { currentProject, requireUser } from "@/lib/server/session";

export const metadata = { title: { default: "Dashboard", template: "%s · Yola dashboard" } };

// Reads the session, so it streams in behind its own boundary.
async function TopbarSession() {
  const user = await requireUser();
  const { project, projects } = await currentProject(user.id);
  return (
    <>
      <ProjectSwitcher current={project ? { id: project.id, name: project.name } : null} projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
      <span className="hidden items-center gap-1.5 rounded-md border border-warning/30 bg-warning/[0.08] px-2 py-1 font-mono text-[11px] text-warning sm:inline-flex">
        Test mode: demo and testnet only
      </span>
      <div className="ml-auto">
        <UserMenu name={user.name} email={user.email} />
      </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ShellProvider>
        <div className="flex min-h-dvh">
          {/* The sidebar highlights the current path, which is request data on dynamic routes. */}
          <Suspense fallback={<div className="hidden w-60 shrink-0 border-r border-line lg:block" aria-hidden />}>
            <Sidebar />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md md:px-8">
              <MenuButton />
              <Suspense fallback={<div className="h-9 w-48 animate-pulse rounded-md bg-surface" aria-hidden />}>
                <TopbarSession />
              </Suspense>
            </header>
            <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 md:px-8 md:py-10">
              <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
            </main>
          </div>
        </div>
      </ShellProvider>
    </ToastProvider>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
      <div className="h-9 w-56 animate-pulse rounded-md bg-surface" />
      <div className="h-40 animate-pulse rounded-[var(--radius-panel)] bg-surface" />
      <div className="h-64 animate-pulse rounded-[var(--radius-panel)] bg-surface" />
    </div>
  );
}
