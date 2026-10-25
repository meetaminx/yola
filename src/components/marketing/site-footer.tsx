import Link from "next/link";
import { YolaLogo } from "@/components/ui/logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#product", label: "Features" },
      { href: "/#demo", label: "Live demo" },
      { href: "/#security", label: "Privacy and security" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/api", label: "API reference" },
      { href: "/docs/architecture", label: "Architecture" },
    ],
  },
  {
    title: "Zcash",
    links: [
      { href: "https://zcash.readthedocs.io/", label: "Zcash documentation", external: true },
      { href: "https://github.com/zcash", label: "Zcash on GitHub", external: true },
      { href: "https://github.com/ZcashFoundation/zebra", label: "Zebra", external: true },
      { href: "https://github.com/zingolabs/zaino", label: "Zaino", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] md:px-8">
        <div>
          <YolaLogo />
          <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-muted">
            Everything developers need to accept ZEC. One integration at a time.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm text-text">{c.title}</h2>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) =>
                "external" in l ? (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-sm text-muted hover:text-text">
                      {l.label}
                    </a>
                  </li>
                ) : (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-muted hover:text-text">
                      {l.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-3 border-t border-line px-5 py-6 text-xs text-faint md:px-8">
        <p>Yola is pre-release software. Production use requires a security review.</p>
        <p>Not affiliated with the Electric Coin Company or the Zcash Foundation.</p>
      </div>
    </footer>
  );
}
