import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { tiktokAppConfigured, tiktokAuthorizeUrl } from "@/lib/integrations/tiktok";

export const dynamic = "force-dynamic";

// Behind the session middleware: only a logged-in partner can start the TikTok consent flow.
export async function GET() {
  if (!tiktokAppConfigured()) return NextResponse.json({ error: "TikTok non configurato" }, { status: 400 });
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("tt_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return NextResponse.redirect(tiktokAuthorizeUrl(state));
}
