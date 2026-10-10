import { LogoMark } from "@/components/Logo";
import { partners } from "@/lib/partners";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Accesso" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="login-wrap">
      <div className="login-orb" aria-hidden />
      <div className="card login-card">
        <LogoMark className="logo" height={96} />
        <h1 className="title-l chrome-text" style={{ marginBottom: 6 }}>Hub dei soci</h1>
        <p className="muted small" style={{ margin: "0 0 26px" }}>Area riservata. Accesso solo per i fondatori.</p>
        <LoginForm partners={partners()} next={next ?? "/"} />
      </div>
    </main>
  );
}
