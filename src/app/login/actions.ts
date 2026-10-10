"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";
import { clearFailures, isLocked, registerFailure, verifyPassword } from "@/lib/password";
import { partners, passwordHashFor } from "@/lib/partners";

export type LoginState = { error?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const locked = isLocked(ip);
  if (locked) return { error: `Troppi tentativi. Riprova tra ${locked} min.` };

  const password = String(form.get("password") ?? "");
  const partner = String(form.get("partner") ?? "");
  if (!partners().includes(partner)) return { error: "Seleziona chi sta accedendo." };

  const hash = passwordHashFor(partner);
  if (!hash) return { error: "Password non configurata sul server per questo socio." };

  if (!password || !verifyPassword(password, hash)) {
    registerFailure(ip);
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return { error: "Password non corretta." };
  }
  clearFailures(ip);

  (await cookies()).set(SESSION_COOKIE, await signSession({ partner }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
