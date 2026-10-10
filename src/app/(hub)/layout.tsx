import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { requireSession } from "@/lib/auth";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="Backrooms Studio — Panoramica">
            <Logo />
          </Link>
          <Nav />
          <div className="user-chip">
            <span className="avatar" aria-hidden>{session.partner.slice(0, 1).toUpperCase()}</span>
            <span className="name">{session.partner}</span>
            <form action={logout}>
              <button className="btn btn-ghost btn-sm" type="submit">Esci</button>
            </form>
          </div>
        </div>
      </header>
      <main className="shell">{children}</main>
    </>
  );
}
