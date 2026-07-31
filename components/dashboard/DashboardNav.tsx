import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Executive Summary" },
  { href: "/funds", label: "Funds" },
  { href: "/companies", label: "Portfolio Companies" },
  { href: "/alerts", label: "Alerts" },
];

export function DashboardNav() {
  return (
    <header className="border-b border-navy2 bg-navy2">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-white hover:text-gold-light">
          Portfolio Monitoring
        </Link>
        <nav className="flex items-center gap-5 text-sm text-gold-light">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
