import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { addApplication, countApplications, setMetric } from "@/lib/metrics";
import { addLead } from "@/lib/crm";
import { today } from "@/lib/format";

export const dynamic = "force-dynamic";

// Called by the website's application/booking form (server-side) with header x-webhook-secret.
const Body = z.object({
  name: z.string().trim().max(200).default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(50).default(""),
  instagram: z.string().trim().max(100).default(""),
  genre: z.string().trim().max(100).default(""),
  kind: z.enum(["candidatura", "prenotazione"]).default("candidatura"),
  message: z.string().trim().max(5000).default(""),
});

function authorized(req: NextRequest) {
  const secret = process.env.APPLICATION_WEBHOOK_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("x-webhook-secret") ?? "");
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.name && !parsed.data.email)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const d = parsed.data;
  addApplication({ name: d.name, email: d.email, phone: d.phone, kind: d.kind, message: d.message });
  // Every application also lands in the CRM pipeline as a new lead.
  addLead({
    name: d.name || d.email,
    email: d.email.toLowerCase(),
    phone: d.phone,
    instagram: d.instagram,
    genre: d.genre,
    notes: d.message,
    source: "sito",
    externalRef: d.email ? `sito:${d.email.toLowerCase()}` : undefined,
  });
  setMetric(today(), "web", "applications", countApplications(today()));
  return NextResponse.json({ ok: true });
}
