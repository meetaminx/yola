import Link from "next/link";
import { YolaLogo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-5 md:px-8">
        <Link href="/" aria-label="Yola home" className="rounded-md">
          <YolaLogo />
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-5 pt-[8vh] pb-16">
        {children}
      </main>
    </div>
  );
}
