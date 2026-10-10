"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { parseEuroToCents, today } from "@/lib/format";
import * as finance from "@/lib/finance";
import * as crm from "@/lib/crm";
import * as insights from "@/lib/insights";
import { METRIC_DEFS, setMetric, type Source } from "@/lib/metrics";
import { createBankLink, disconnectBank } from "@/lib/integrations/gocardless";
import { runDaily, syncBank, syncDrive } from "@/lib/sync";

const str = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const int = (f: FormData, k: string) => {
  const n = Number(f.get(k));
  if (!Number.isInteger(n)) throw new Error(`Parametro non valido: ${k}`);
  return n;
};
const isoDateOr = (v: string, fallback: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);

export type FormState = { ok?: string; error?: string };

// ─── Finanza ────────────────────────────────────────────────────────────────

export async function addCashAction(_: FormState, f: FormData): Promise<FormState> {
  const { partner } = await requireSession();
  const cents = parseEuroToCents(str(f, "amount", 30));
  if (!cents || cents <= 0) return { error: "Inserisci un importo valido." };
  const direction = str(f, "direction") === "out" ? -1 : 1;
  const description = str(f, "description", 300);
  if (!description) return { error: "Aggiungi una descrizione." };
  finance.addCashTransaction({
    date: isoDateOr(str(f, "date"), today()),
    amountCents: direction * cents,
    description,
    category: str(f, "category", 60) || "Altro",
    author: partner,
  });
  revalidatePath("/finanza");
  revalidatePath("/");
  return { ok: `${direction > 0 ? "Entrata" : "Uscita"} in contanti registrata.` };
}

export async function deleteTransactionAction(f: FormData) {
  await requireSession();
  finance.deleteManualTransaction(str(f, "id", 200));
  revalidatePath("/finanza");
}

export async function updateCategoryAction(f: FormData) {
  await requireSession();
  finance.updateCategory(str(f, "id", 200), str(f, "category", 60));
  revalidatePath("/finanza");
}

export async function importCsvAction(_: FormState, f: FormData): Promise<FormState> {
  const { partner } = await requireSession();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Seleziona un file CSV." };
  if (file.size > 5 * 1024 * 1024) return { error: "File troppo grande (max 5 MB)." };
  try {
    const { added, skipped } = finance.importStatementCsv(await file.text(), partner);
    revalidatePath("/finanza");
    return { ok: `${added} movimenti importati${skipped ? `, ${skipped} saltati (già presenti o non validi)` : ""}.` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function syncBankAction(): Promise<FormState> {
  await requireSession();
  const r = await syncBank();
  revalidatePath("/finanza");
  return r.ok ? { ok: r.message } : { error: r.message };
}

// ─── CRM ────────────────────────────────────────────────────────────────────

export async function addLeadAction(_: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const name = str(f, "name", 200);
  if (!name) return { error: "Il nome è obbligatorio." };
  crm.addLead({
    name,
    email: str(f, "email", 200).toLowerCase(),
    phone: str(f, "phone", 50),
    instagram: str(f, "instagram", 100),
    genre: str(f, "genre", 100),
    notes: str(f, "notes"),
  });
  revalidatePath("/crm");
  return { ok: `${name} aggiunto alla pipeline.` };
}

export async function setLeadStatusAction(f: FormData) {
  await requireSession();
  const status = str(f, "status");
  if (!(crm.LEAD_STATUSES as readonly string[]).includes(status)) return;
  crm.setLeadStatus(int(f, "id"), status);
  revalidatePath("/crm");
}

export async function deleteLeadAction(f: FormData) {
  await requireSession();
  crm.deleteLead(int(f, "id"));
  revalidatePath("/crm");
}

export async function convertLeadAction(f: FormData) {
  await requireSession();
  const artistId = crm.convertLead(int(f, "id"));
  revalidatePath("/crm");
  redirect(`/artisti#artista-${artistId}`);
}

export async function syncDriveAction(): Promise<FormState> {
  await requireSession();
  const r = await syncDrive();
  revalidatePath("/crm");
  if (r.skipped) return { error: "Google Drive non configurato: vedi Integrazioni." };
  return r.ok ? { ok: r.message } : { error: r.message };
}

// ─── Artisti & pacchetti ────────────────────────────────────────────────────

export async function addArtistAction(_: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const name = str(f, "name", 200);
  if (!name) return { error: "Il nome è obbligatorio." };
  crm.addArtist({
    name,
    email: str(f, "email", 200),
    phone: str(f, "phone", 50),
    instagram: str(f, "instagram", 100),
    notes: str(f, "notes"),
  });
  revalidatePath("/artisti");
  return { ok: `${name} aggiunto.` };
}

export async function deleteArtistAction(f: FormData) {
  await requireSession();
  crm.deleteArtist(int(f, "id"));
  revalidatePath("/artisti");
}

export async function addPackageAction(_: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const artistId = int(f, "artistId");
  const items: [string, number][] = [];
  for (const service of crm.SERVICES) {
    const qty = Math.min(50, Math.max(0, Number(f.get(`qty:${service}`) ?? 0) || 0));
    if (qty > 0) items.push([service, qty]);
  }
  const custom = str(f, "custom", 100);
  const customQty = Math.min(50, Math.max(0, Number(f.get("customQty") ?? 0) || 0));
  if (custom && customQty > 0) items.push([custom, customQty]);
  if (items.length === 0) return { error: "Aggiungi almeno un servizio al pacchetto." };
  const name = str(f, "name", 120) || "Pacchetto personalizzato";
  crm.addPackage({
    artistId,
    name,
    priceCents: Math.max(0, parseEuroToCents(str(f, "price", 30)) ?? 0),
    purchasedAt: isoDateOr(str(f, "purchasedAt"), today()),
    items,
  });
  revalidatePath("/artisti");
  revalidatePath("/");
  return { ok: `Pacchetto “${name}” assegnato.` };
}

export async function toggleItemAction(f: FormData) {
  const { partner } = await requireSession();
  crm.toggleItem(int(f, "id"), str(f, "done") === "1", partner);
  revalidatePath("/artisti");
  revalidatePath("/");
}

export async function archivePackageAction(f: FormData) {
  await requireSession();
  crm.archivePackage(int(f, "id"), str(f, "archived") === "1");
  revalidatePath("/artisti");
}

export async function deletePackageAction(f: FormData) {
  await requireSession();
  crm.deletePackage(int(f, "id"));
  revalidatePath("/artisti");
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export async function manualMetricsAction(_: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const source = str(f, "source") as Source;
  if (!(source in METRIC_DEFS)) return { error: "Sorgente non valida." };
  const date = isoDateOr(str(f, "date"), today());
  let n = 0;
  for (const def of METRIC_DEFS[source]) {
    const raw = str(f, def.key, 30).replace(",", ".");
    if (!raw) continue;
    const v = Number(raw.replace("%", ""));
    if (!Number.isFinite(v) || v < 0) return { error: `Valore non valido per ${def.label}.` };
    setMetric(date, source, def.key, def.kind === "pct" ? v / 100 : v);
    n++;
  }
  revalidatePath("/analytics");
  return n ? { ok: `${n} metriche salvate per il ${date}.` } : { error: "Nessun valore inserito." };
}

export async function runDailyAction(): Promise<FormState> {
  await requireSession();
  const results = await runDaily();
  revalidatePath("/", "layout");
  const failed = results.filter((r) => !r.ok);
  const done = results.filter((r) => r.ok && !r.skipped).length;
  return failed.length
    ? { error: `${done} completati, ${failed.length} con errori: ${failed.map((r) => `${r.job} (${r.message})`).join("; ")}` }
    : { ok: `Sincronizzazione completata (${done} sorgenti attive).` };
}

// ─── Insights ───────────────────────────────────────────────────────────────

export async function addInsightAction(_: FormState, f: FormData): Promise<FormState> {
  const { partner } = await requireSession();
  const title = str(f, "title", 200);
  if (!title) return { error: "Serve un titolo." };
  const due = str(f, "dueDate");
  insights.addInsight({
    title,
    body: str(f, "body", 10_000),
    category: str(f, "category", 40) || "Strategia",
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    author: partner,
  });
  revalidatePath("/insights");
  revalidatePath("/");
  return { ok: "Nota aggiunta alla bacheca." };
}

export async function updateInsightAction(f: FormData) {
  await requireSession();
  const due = str(f, "dueDate");
  insights.updateInsight(int(f, "id"), {
    title: str(f, "title", 200) || "Senza titolo",
    body: str(f, "body", 10_000),
    category: str(f, "category", 40) || "Strategia",
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
  });
  revalidatePath("/insights");
}

export async function insightFlagAction(f: FormData) {
  await requireSession();
  const flag = str(f, "flag") === "done" ? "done" : "pinned";
  insights.setInsightFlag(int(f, "id"), flag, str(f, "value") === "1");
  revalidatePath("/insights");
  revalidatePath("/");
}

export async function deleteInsightAction(f: FormData) {
  await requireSession();
  insights.deleteInsight(int(f, "id"));
  revalidatePath("/insights");
}

// ─── Banca ──────────────────────────────────────────────────────────────────

export async function connectBankAction(f: FormData) {
  await requireSession();
  const [id, ...nameParts] = str(f, "institution", 300).split("|");
  if (!id) return;
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const link = await createBankLink(id, nameParts.join("|"), `${base}/api/bank/callback`);
  redirect(link);
}

export async function disconnectBankAction() {
  await requireSession();
  disconnectBank();
  revalidatePath("/impostazioni");
}
