import { NextResponse, type NextRequest } from "next/server";
import { finalizeBankLink } from "@/lib/integrations/gocardless";
import { syncBank } from "@/lib/sync";

export const dynamic = "force-dynamic";

// The bank redirects here after the partner grants PSD2 consent (route is behind the session middleware).
export async function GET(req: NextRequest) {
  const url = new URL("/impostazioni", process.env.APP_URL ?? req.nextUrl.origin);
  try {
    await finalizeBankLink();
    const result = await syncBank();
    url.searchParams.set("bank", result.ok ? "ok" : "sync-error");
  } catch (err) {
    url.searchParams.set("bank", "error");
    url.searchParams.set("msg", (err as Error).message.slice(0, 200));
  }
  return NextResponse.redirect(url);
}
