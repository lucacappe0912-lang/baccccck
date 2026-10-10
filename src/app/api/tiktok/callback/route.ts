import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { tiktokExchangeCode } from "@/lib/integrations/tiktok";
import { syncTikTok } from "@/lib/sync";
import { today } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL("/impostazioni", process.env.APP_URL ?? req.nextUrl.origin);
  const store = await cookies();
  const expected = store.get("tt_state")?.value;
  store.delete("tt_state");
  const code = req.nextUrl.searchParams.get("code");
  if (!code || !expected || req.nextUrl.searchParams.get("state") !== expected) {
    url.searchParams.set("tiktok", "error");
    return NextResponse.redirect(url);
  }
  try {
    await tiktokExchangeCode(code);
    await syncTikTok(today());
    url.searchParams.set("tiktok", "ok");
  } catch (err) {
    url.searchParams.set("tiktok", "error");
    url.searchParams.set("msg", (err as Error).message.slice(0, 200));
  }
  return NextResponse.redirect(url);
}
