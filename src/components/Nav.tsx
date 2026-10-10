"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Panoramica" },
  { href: "/agenda", label: "Agenda" },
  { href: "/finanza", label: "Finanza" },
  { href: "/incassi", label: "Incassi" },
  { href: "/crm", label: "CRM" },
  { href: "/artisti", label: "Artisti" },
  { href: "/analytics", label: "Analytics" },
  { href: "/soci", label: "Soci" },
  { href: "/attrezzatura", label: "Attrezzatura" },
  { href: "/insights", label: "Insights" },
  { href: "/impostazioni", label: "Impostazioni" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sezioni">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
