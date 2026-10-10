import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type Session } from "./session";

/** Re-checks the session inside server actions / pages (defence in depth beyond middleware). */
export async function requireSession(): Promise<Session> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  return session;
}
