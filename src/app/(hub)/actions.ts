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
import * as biz from "@/lib/business";
import { CHANNELS } from "@/lib/business";
import { partners } from "@/lib/partners";
import { getSettings, saveSettings, type StudioSettings } from "@/lib/settings";

const PAYMENT_METHODS = ["bonifico", "contanti", "pos"] as const;
const oneOf = <T extends string>(v: string, list: readonly T[], fallback: T | ""): T | "" =>
  (list as readonly string[]).includes(v) ? (v as T) : fallback;
const optDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const time = (v: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

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
    channel: oneOf(str(f, "channel"), CHANNELS, ""),
    referredBy: oneOf(str(f, "referredBy"), partners(), ""),
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
    channel: oneOf(str(f, "channel"), CHANNELS, ""),
    referredBy: oneOf(str(f, "referredBy"), partners(), ""),
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
  const due = str(f, "dueDate");
  const packageId = crm.addPackage({
    artistId,
    name,
    priceCents: Math.max(0, parseEuroToCents(str(f, "price", 30)) ?? 0),
    purchasedAt: isoDateOr(str(f, "purchasedAt"), today()),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    items,
  });
  const deposit = parseEuroToCents(str(f, "deposit", 30));
  if (deposit && deposit > 0) {
    biz.addPayment({
      packageId,
      date: isoDateOr(str(f, "purchasedAt"), today()),
      cents: deposit,
      method: oneOf(str(f, "depositMethod"), PAYMENT_METHODS, "bonifico") || "bonifico",
      author: (await requireSession()).partner,
    });
  }
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

// ─── CRM follow-up ──────────────────────────────────────────────────────────

export async function contactedAction(f: FormData) {
  await requireSession();
  crm.markContacted(int(f, "id"));
  revalidatePath("/crm");
  revalidatePath("/");
}

export async function followUpAction(f: FormData) {
  await requireSession();
  crm.setFollowUp(int(f, "id"), str(f, "nextAction", 200), optDate(str(f, "nextActionDate")));
  revalidatePath("/crm");
  revalidatePath("/");
}

export async function leadChannelAction(f: FormData) {
  await requireSession();
  const { db } = await import("@/lib/db");
  db()
    .prepare("UPDATE leads SET channel = ?, referred_by = ? WHERE id = ?")
    .run(oneOf(str(f, "channel"), CHANNELS, ""), oneOf(str(f, "referredBy"), partners(), ""), int(f, "id"));
  revalidatePath("/crm");
}

// ─── Agenda ─────────────────────────────────────────────────────────────────

export async function addSessionAction(_: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const start = time(str(f, "start")), end = time(str(f, "end"));
  const date = optDate(str(f, "date"));
  if (!date || !start || !end) return { error: "Indica data, ora di inizio e di fine." };
  const settings = getSettings();
  const itemId = Number(str(f, "itemId")) || null;
  const artistId = Number(str(f, "artistId")) || null;
  const err = biz.addSession({
    date,
    start,
    end,
    room: oneOf(str(f, "room"), settings.rooms, settings.rooms[0]) || settings.rooms[0],
    engineer: oneOf(str(f, "engineer"), partners(), ""),
    artistId,
    itemId,
    title: str(f, "title", 120),
  });
  if (err) return { error: err };
  revalidatePath("/agenda");
  revalidatePath("/");
  return { ok: "Sessione prenotata." };
}

export async function sessionStatusAction(f: FormData) {
  const { partner } = await requireSession();
  const status = oneOf(str(f, "status"), ["prenotata", "completata", "annullata"] as const, "prenotata") || "prenotata";
  biz.setSessionStatus(int(f, "id"), status, partner);
  revalidatePath("/agenda");
  revalidatePath("/artisti");
  revalidatePath("/");
}

export async function deleteSessionAction(f: FormData) {
  await requireSession();
  biz.deleteSession(int(f, "id"));
  revalidatePath("/agenda");
}

// ─── Incassi ────────────────────────────────────────────────────────────────

export async function addPaymentAction(_: FormState, f: FormData): Promise<FormState> {
  const { partner } = await requireSession();
  const cents = parseEuroToCents(str(f, "amount", 30));
  if (!cents || cents <= 0) return { error: "Inserisci un importo valido." };
  const method = oneOf(str(f, "method"), PAYMENT_METHODS, "bonifico") || "bonifico";
  biz.addPayment({ packageId: int(f, "packageId"), date: isoDateOr(str(f, "date"), today()), cents, method, author: partner });
  revalidatePath("/artisti");
  revalidatePath("/incassi");
  revalidatePath("/finanza");
  revalidatePath("/");
  return { ok: method === "contanti" ? "Pagamento registrato e aggiunto ai movimenti in contanti." : "Pagamento registrato." };
}

export async function deletePaymentAction(f: FormData) {
  await requireSession();
  biz.deletePayment(int(f, "id"));
  revalidatePath("/artisti");
  revalidatePath("/incassi");
  revalidatePath("/finanza");
}

export async function packageDueAction(f: FormData) {
  await requireSession();
  biz.setPackageDueDate(int(f, "id"), optDate(str(f, "dueDate")));
  revalidatePath("/artisti");
  revalidatePath("/incassi");
}

// ─── Soci ───────────────────────────────────────────────────────────────────

export async function addPartnerMoveAction(_: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const cents = parseEuroToCents(str(f, "amount", 30));
  if (!cents || cents <= 0) return { error: "Inserisci un importo valido." };
  const partner = oneOf(str(f, "partner"), partners(), "");
  if (!partner) return { error: "Seleziona il socio." };
  biz.addPartnerMove({
    date: isoDateOr(str(f, "date"), today()),
    partner,
    kind: str(f, "kind") === "versamento" ? "versamento" : "prelievo",
    amount_cents: cents,
    note: str(f, "note", 200),
  });
  revalidatePath("/soci");
  return { ok: "Movimento registrato." };
}

export async function deletePartnerMoveAction(f: FormData) {
  await requireSession();
  biz.deletePartnerMove(int(f, "id"));
  revalidatePath("/soci");
}

// ─── Brani ──────────────────────────────────────────────────────────────────

export async function addTrackAction(_: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const title = str(f, "title", 150);
  if (!title) return { error: "Serve il titolo del brano." };
  const url = str(f, "driveUrl", 500);
  biz.addTrack({ artistId: int(f, "artistId"), title, dueDate: optDate(str(f, "dueDate")), driveUrl: /^https?:\/\//.test(url) ? url : "" });
  revalidatePath("/artisti");
  revalidatePath("/");
  return { ok: `“${title}” aggiunto.` };
}

export async function moveTrackAction(f: FormData) {
  await requireSession();
  const op = str(f, "op");
  if (op === "revision") biz.addRevision(int(f, "id"));
  else if (op === "delete") biz.deleteTrack(int(f, "id"));
  else biz.moveTrack(int(f, "id"), op === "back" ? -1 : 1);
  revalidatePath("/artisti");
  revalidatePath("/");
}

// ─── Attrezzatura ───────────────────────────────────────────────────────────

export async function addEquipmentAction(_: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const name = str(f, "name", 150);
  if (!name) return { error: "Serve il nome dell'attrezzatura." };
  const months = Number(str(f, "serviceMonths"));
  biz.addEquipment({
    name,
    category: oneOf(str(f, "category"), biz.EQUIPMENT_CATEGORIES, "Altro") || "Altro",
    purchase_date: isoDateOr(str(f, "purchaseDate"), today()),
    cost_cents: Math.max(0, parseEuroToCents(str(f, "cost", 30)) ?? 0),
    life_years: Math.min(20, Math.max(1, Number(str(f, "lifeYears")) || 5)),
    warranty_until: optDate(str(f, "warrantyUntil")),
    service_months: Number.isInteger(months) && months > 0 ? Math.min(60, months) : null,
    notes: str(f, "notes", 500),
  });
  revalidatePath("/attrezzatura");
  return { ok: `${name} aggiunto all'inventario.` };
}

export async function equipmentOpAction(f: FormData) {
  await requireSession();
  if (str(f, "op") === "delete") biz.deleteEquipment(int(f, "id"));
  else biz.markServiced(int(f, "id"));
  revalidatePath("/attrezzatura");
  revalidatePath("/");
}

// ─── Parametri dello studio ─────────────────────────────────────────────────

export async function saveSettingsAction(_: FormState, f: FormData): Promise<FormState> {
  await requireSession();
  const cur = getSettings();
  const num = (k: string) => Number(str(f, k, 20).replace(",", "."));
  const pct = (k: string, fallback: number) => {
    const v = num(k);
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v / 100 : fallback;
  };
  const rooms = str(f, "rooms", 300).split(",").map((r) => r.trim()).filter(Boolean).slice(0, 10);
  const open = Math.round(num("openHour")), close = Math.round(num("closeHour"));
  if (!(open >= 0 && close <= 24 && close > open)) return { error: "Orari non validi: la chiusura deve essere dopo l'apertura." };
  const fixedCosts = str(f, "fixedCosts", 3000)
    .split(/\r?\n/)
    .map((line) => line.split(/[:=]/))
    .filter((parts) => parts.length >= 2 && parts[0].trim())
    .map(([label, ...rest]) => ({ label: label.trim().slice(0, 60), cents: Math.max(0, parseEuroToCents(rest.join(":")) ?? 0) }));
  const shares: Record<string, number> = {};
  for (const p of partners()) {
    const v = num(`share:${p}`);
    shares[p] = Number.isFinite(v) && v >= 0 ? v : cur.shares[p] ?? 0;
  }
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 0.5) return { error: `Le quote dei soci devono sommare 100% (ora ${total.toFixed(1)}%).` };
  const next: StudioSettings = {
    rooms: rooms.length ? rooms : cur.rooms,
    openHour: open,
    closeHour: close,
    openDays: [1, 2, 3, 4, 5, 6, 7].filter((d) => f.get(`day:${d}`) === "on"),
    fixedCosts,
    tax: {
      coefficient: pct("coefficient", cur.tax.coefficient),
      substituteRate: pct("substituteRate", cur.tax.substituteRate),
      inpsRate: pct("inpsRate", cur.tax.inpsRate),
      threshold: Math.max(0, num("threshold") || cur.tax.threshold),
      vatNumbers: Math.min(10, Math.max(1, Math.round(num("vatNumbers")) || cur.tax.vatNumbers)),
    },
    shares,
  };
  saveSettings(next);
  revalidatePath("/", "layout");
  return { ok: "Parametri salvati." };
}
