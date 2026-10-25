import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 md:grid-cols-[220px_minmax(0,1fr)] md:gap-14 md:px-8 md:py-16">
        <aside className="md:sticky md:top-24 md:self-start">
          <DocsSidebar />
        </aside>
        <main id="main">{children}</main>
      </div>
      <SiteFooter />
    </>
  );
}
