import "server-only";
// Business intelligence: agenda & saturation, payments & receivables, prepaid services,
// forfettario tax accrual, break-even, partner ledger, acquisition channels, tracks, equipment.
import { randomUUID } from "node:crypto";
import { db, tx } from "./db";
import { addDays, isoDate, today } from "./format";
import { fixedCostsTotal, getSettings, type StudioSettings } from "./settings";
import { listArtists, type Artist } from "./crm";

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(iso, -dow);
}

// ─── Agenda ─────────────────────────────────────────────────────────────────

export type Session = {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  room: string;
  engineer: string;
  artist_id: number | null;
  item_id: number | null;
  title: string;
  status: "prenotata" | "completata" | "annullata";
  artist_name: string | null;
  service: string | null;
};

export function listSessions(from: string, to: string): Session[] {
  return db()
    .prepare(
      `SELECT s.*, a.name AS artist_name, i.service AS service
         FROM sessions s
         LEFT JOIN artists a ON a.id = s.artist_id
         LEFT JOIN package_items i ON i.id = s.item_id
        WHERE s.date BETWEEN ? AND ?
        ORDER BY s.date, s.start_time`,
    )
    .all(from, to) as Session[];
}

export function addSession(input: {
  date: string;
  start: string;
  end: string;
  room: string;
  engineer: string;
  artistId: number | null;
  itemId: number | null;
  title: string;
}): string | null {
  if (minutes(input.end) <= minutes(input.start)) return "L'orario di fine deve essere dopo l'inizio.";
  let artistId = input.artistId;
  if (input.itemId) {
    const row = db()
      .prepare("SELECT p.artist_id FROM package_items i JOIN packages p ON p.id = i.package_id WHERE i.id = ?")
      .get(input.itemId) as { artist_id: number } | undefined;
    if (!row) return "Servizio del pacchetto non trovato.";
    artistId = row.artist_id;
  }
  const clash = db()
    .prepare(
      `SELECT start_time, end_time FROM sessions
        WHERE date = ? AND room = ? AND status != 'annullata' AND start_time < ? AND end_time > ?`,
    )
    .get(input.date, input.room, input.end, input.start) as { start_time: string; end_time: string } | undefined;
  if (clash) return `${input.room} è già occupata dalle ${clash.start_time} alle ${clash.end_time}.`;
  db()
    .prepare(
      `INSERT INTO sessions(date, start_time, end_time, room, engineer, artist_id, item_id, title)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.date, input.start, input.end, input.room, input.engineer, artistId, input.itemId, input.title);
  return null;
}

/** Completing a session linked to a package service ticks that service off automatically. */
export function setSessionStatus(id: number, status: Session["status"], partner: string) {
  tx(() => {
    const s = db().prepare("SELECT item_id, engineer FROM sessions WHERE id = ?").get(id) as
      | { item_id: number | null; engineer: string }
      | undefined;
    if (!s) return;
    db().prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id);
    if (s.item_id) {
      if (status === "completata") {
        db()
          .prepare("UPDATE package_items SET done_at = COALESCE(done_at, ?), done_by = COALESCE(done_by, ?) WHERE id = ?")
          .run(new Date().toISOString(), s.engineer || partner, s.item_id);
      } else {
        db().prepare("UPDATE package_items SET done_at = NULL, done_by = NULL WHERE id = ?").run(s.item_id);
      }
    }
  });
}

export function deleteSession(id: number) {
  db().prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

/** Pending package services, for linking a booking to what the artist already paid for. */
export function pendingItems() {
  return db()
    .prepare(
      `SELECT i.id, i.service, a.id AS artist_id, a.name AS artist_name
         FROM package_items i
         JOIN packages p ON p.id = i.package_id AND p.archived = 0
         JOIN artists a ON a.id = p.artist_id
        WHERE i.done_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.item_id = i.id AND s.status = 'prenotata')
        ORDER BY a.name, i.position`,
    )
    .all() as { id: number; service: string; artist_id: number; artist_name: string }[];
}

const hours = (s: { start_time: string; end_time: string }) => (minutes(s.end_time) - minutes(s.start_time)) / 60;

/** Booked share of available room-hours between two dates (inclusive). */
export function saturation(from: string, to: string, settings = getSettings()) {
  let capacity = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = ((new Date(`${d}T12:00:00`).getDay() + 6) % 7) + 1;
    if (settings.openDays.includes(dow)) capacity += (settings.closeHour - settings.openHour) * settings.rooms.length;
  }
  const booked = listSessions(from, to)
    .filter((s) => s.status !== "annullata")
    .reduce((a, s) => a + hours(s), 0);
  return { booked, capacity, rate: capacity ? booked / capacity : 0 };
}

/** Occupancy per weekday × hour over the last `weeks` weeks: shows which slots stay empty. */
export function occupancyHeatmap(weeks = 8, settings = getSettings()) {
  const to = addDays(weekStart(today()), -1);
  const from = addDays(to, -(weeks * 7 - 1));
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const s of listSessions(from, to)) {
    if (s.status === "annullata") continue;
    const dow = (new Date(`${s.date}T12:00:00`).getDay() + 6) % 7;
    for (let h = Math.floor(minutes(s.start_time) / 60); h < Math.ceil(minutes(s.end_time) / 60); h++) grid[dow][h] += 1;
  }
  const denom = weeks * settings.rooms.length;
  return {
    hours: Array.from({ length: settings.closeHour - settings.openHour }, (_, i) => settings.openHour + i),
    days: settings.openDays.map((d) => d - 1),
    rate: (dow: number, h: number) => Math.min(1, grid[dow][h] / denom),
  };
}

// ─── Payments, receivables, prepaid services ───────────────────────────────

export type Payment = { id: number; package_id: number; date: string; amount_cents: number; method: string; tx_id: string | null; created_by: string };

export function paymentsByPackage(): Map<number, Payment[]> {
  const rows = db().prepare("SELECT * FROM payments ORDER BY date").all() as Payment[];
  const map = new Map<number, Payment[]>();
  for (const r of rows) map.set(r.package_id, [...(map.get(r.package_id) ?? []), r]);
  return map;
}

/** Cash payments also land in the finance ledger; bank ones arrive with the bank import. */
export function addPayment(input: { packageId: number; date: string; cents: number; method: string; author: string }) {
  tx(() => {
    let txId: string | null = null;
    if (input.method === "contanti") {
      const pkg = db()
        .prepare("SELECT p.name, a.name AS artist FROM packages p JOIN artists a ON a.id = p.artist_id WHERE p.id = ?")
        .get(input.packageId) as { name: string; artist: string };
      txId = `cash:${randomUUID()}`;
      db()
        .prepare(
          `INSERT INTO transactions(id, date, amount_cents, description, category, source, created_by)
           VALUES(?, ?, ?, ?, 'Pacchetti', 'cash', ?)`,
        )
        .run(txId, input.date, input.cents, `${pkg.name} — ${pkg.artist}`, input.author);
    }
    db()
      .prepare("INSERT INTO payments(package_id, date, amount_cents, method, tx_id, created_by) VALUES(?, ?, ?, ?, ?, ?)")
      .run(input.packageId, input.date, input.cents, input.method, txId, input.author);
  });
}

export function deletePayment(id: number) {
  tx(() => {
    const p = db().prepare("SELECT tx_id FROM payments WHERE id = ?").get(id) as { tx_id: string | null } | undefined;
    if (p?.tx_id) db().prepare("DELETE FROM transactions WHERE id = ?").run(p.tx_id);
    db().prepare("DELETE FROM payments WHERE id = ?").run(id);
  });
}

export function setPackageDueDate(id: number, due: string | null) {
  db().prepare("UPDATE packages SET due_date = ? WHERE id = ?").run(due, id);
}

export type PackageMoney = {
  packageId: number;
  packageName: string;
  artistId: number;
  artistName: string;
  price: number;
  paid: number;
  outstanding: number;
  dueDate: string | null;
  daysLate: number;
  delivered: number; // value of services already done
  prepaidOwed: number; // paid but not yet delivered
  done: number;
  total: number;
  archived: boolean;
};

export function packageMoney(artists: Artist[] = listArtists()): PackageMoney[] {
  const pays = paymentsByPackage();
  const t = today();
  const out: PackageMoney[] = [];
  for (const a of artists) {
    for (const p of a.packages) {
      const paid = (pays.get(p.id) ?? []).reduce((s, x) => s + x.amount_cents, 0);
      const total = p.items.length;
      const done = p.items.filter((i) => i.done_at).length;
      const delivered = total ? Math.round((p.price_cents * done) / total) : 0;
      const due = (p as { due_date?: string | null }).due_date ?? null;
      const outstanding = Math.max(0, p.price_cents - paid);
      out.push({
        packageId: p.id,
        packageName: p.name,
        artistId: a.id,
        artistName: a.name,
        price: p.price_cents,
        paid,
        outstanding,
        dueDate: due,
        daysLate: due && outstanding > 0 && due < t ? Math.round((Date.parse(t) - Date.parse(due)) / 86_400_000) : 0,
        delivered,
        prepaidOwed: Math.max(0, Math.min(paid, p.price_cents) - delivered),
        done,
        total,
        archived: Boolean(p.archived),
      });
    }
  }
  return out;
}

export function recentPayments(limit = 12) {
  return db()
    .prepare(
      `SELECT pay.*, p.name AS package_name, a.name AS artist_name
         FROM payments pay JOIN packages p ON p.id = pay.package_id JOIN artists a ON a.id = p.artist_id
        ORDER BY pay.date DESC, pay.id DESC LIMIT ?`,
    )
    .all(limit) as (Payment & { package_name: string; artist_name: string })[];
}

// ─── Forfettario & break-even ──────────────────────────────────────────────

export function incomeBetween(from: string, to: string): number {
  const row = db()
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS v FROM transactions WHERE amount_cents > 0 AND date BETWEEN ? AND ?")
    .get(from, to) as { v: number };
  return row.v;
}

/** Simplified forfettario estimate on cash received (principio di cassa). Indicative only. */
export function taxEstimate(revenueCents: number, s: StudioSettings = getSettings()) {
  const income = revenueCents * s.tax.coefficient;
  const contributions = income * s.tax.inpsRate;
  const tax = Math.max(0, income - contributions) * s.tax.substituteRate;
  const total = contributions + tax;
  return {
    taxableIncome: Math.round(income),
    contributions: Math.round(contributions),
    tax: Math.round(tax),
    total: Math.round(total),
    per100: revenueCents ? (total / revenueCents) * 100 : s.tax.coefficient * (s.tax.inpsRate + (1 - s.tax.inpsRate) * s.tax.substituteRate) * 100,
  };
}

export function fiscalYear(s: StudioSettings = getSettings()) {
  const year = new Date().getFullYear();
  const revenue = incomeBetween(`${year}-01-01`, `${year}-12-31`);
  const perVat = revenue / Math.max(1, s.tax.vatNumbers);
  return { year, revenue, estimate: taxEstimate(revenue, s), perVat, thresholdCents: s.tax.threshold * 100 };
}

export function averageSessionCents(): number {
  const row = db()
    .prepare(
      `SELECT AVG(amount_cents) AS v FROM transactions
        WHERE amount_cents > 0 AND category IN ('Sessioni', 'Mix & Master') AND date >= ?`,
    )
    .get(addDays(today(), -180)) as { v: number | null };
  return Math.round(row.v ?? 15000);
}

export function breakEven(s: StudioSettings = getSettings()) {
  const now = new Date();
  const from = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const fixed = fixedCostsTotal(s);
  const income = incomeBetween(from, to);
  const missing = Math.max(0, fixed - income);
  const avg = averageSessionCents();
  return { fixed, income, missing, sessionsNeeded: Math.ceil(missing / Math.max(1, avg)), avgSession: avg, rate: fixed ? income / fixed : 1 };
}

// ─── Partner ledger ────────────────────────────────────────────────────────

export type PartnerMove = { id: number; date: string; partner: string; kind: "prelievo" | "versamento"; amount_cents: number; note: string };

export function listPartnerMoves(year: number): PartnerMove[] {
  return db()
    .prepare("SELECT * FROM partner_moves WHERE date LIKE ? ORDER BY date DESC, id DESC")
    .all(`${year}%`) as PartnerMove[];
}

export function addPartnerMove(input: Omit<PartnerMove, "id">) {
  db()
    .prepare("INSERT INTO partner_moves(date, partner, kind, amount_cents, note) VALUES(?, ?, ?, ?, ?)")
    .run(input.date, input.partner, input.kind, input.amount_cents, input.note);
}

export function deletePartnerMove(id: number) {
  db().prepare("DELETE FROM partner_moves WHERE id = ?").run(id);
}

export function partnerStats(partner: string, year: number) {
  const q = <T>(sql: string, ...p: (string | number)[]) => db().prepare(sql).get(...p) as T;
  const clients = q<{ n: number }>("SELECT COUNT(*) AS n FROM artists WHERE referred_by = ?", partner).n;
  const hoursRow = db()
    .prepare("SELECT start_time, end_time FROM sessions WHERE engineer = ? AND status = 'completata' AND date LIKE ?")
    .all(partner, `${year}%`) as { start_time: string; end_time: string }[];
  const services = q<{ n: number }>(
    "SELECT COUNT(*) AS n FROM package_items WHERE done_by = ? AND substr(done_at, 1, 4) = ?",
    partner,
    String(year),
  ).n;
  return { clients, hours: hoursRow.reduce((a, s) => a + hours(s), 0), services };
}

// ─── Acquisition channels ──────────────────────────────────────────────────

export const CHANNELS = ["Instagram", "TikTok", "Sito web", "Passaparola", "Eventi", "Altro"] as const;

export function channelRevenue(money: PackageMoney[] = packageMoney()) {
  const artists = db().prepare("SELECT id, channel FROM artists").all() as { id: number; channel: string }[];
  const channelOf = new Map(artists.map((a) => [a.id, a.channel || "Non indicato"]));
  const byChannel = new Map<string, { channel: string; paid: number; clients: Set<number> }>();
  for (const m of money) {
    const ch = channelOf.get(m.artistId) ?? "Non indicato";
    const e = byChannel.get(ch) ?? { channel: ch, paid: 0, clients: new Set<number>() };
    e.paid += m.paid;
    e.clients.add(m.artistId);
    byChannel.set(ch, e);
  }
  const leads = db()
    .prepare("SELECT CASE WHEN channel = '' THEN 'Non indicato' ELSE channel END AS ch, COUNT(*) AS n FROM leads GROUP BY ch")
    .all() as { ch: string; n: number }[];
  const leadCount = new Map(leads.map((l) => [l.ch, l.n]));
  return [...byChannel.values()]
    .map((e) => ({ channel: e.channel, paid: e.paid, clients: e.clients.size, avg: e.clients.size ? Math.round(e.paid / e.clients.size) : 0, leads: leadCount.get(e.channel) ?? 0 }))
    .sort((a, b) => b.paid - a.paid);
}

// ─── Tracks (song projects) ────────────────────────────────────────────────

export const TRACK_STAGES = ["Registrazione", "Mix", "Revisioni", "Master", "Consegnato"] as const;

export type Track = {
  id: number;
  artist_id: number;
  title: string;
  stage: number;
  mix_revisions: number;
  due_date: string | null;
  drive_url: string;
  updated_at: string;
  artist_name?: string;
};

export function tracksByArtist(): Map<number, Track[]> {
  const rows = db().prepare("SELECT * FROM tracks ORDER BY stage, COALESCE(due_date, '9999'), id").all() as Track[];
  const map = new Map<number, Track[]>();
  for (const r of rows) map.set(r.artist_id, [...(map.get(r.artist_id) ?? []), r]);
  return map;
}

export function upcomingDeliveries(days = 14): Track[] {
  return db()
    .prepare(
      `SELECT t.*, a.name AS artist_name FROM tracks t JOIN artists a ON a.id = t.artist_id
        WHERE t.stage < ? AND t.due_date IS NOT NULL AND t.due_date <= ?
        ORDER BY t.due_date`,
    )
    .all(TRACK_STAGES.length - 1, addDays(today(), days)) as Track[];
}

export function addTrack(input: { artistId: number; title: string; dueDate: string | null; driveUrl: string }) {
  db()
    .prepare("INSERT INTO tracks(artist_id, title, due_date, drive_url) VALUES(?, ?, ?, ?)")
    .run(input.artistId, input.title, input.dueDate, input.driveUrl);
}

export function moveTrack(id: number, delta: number) {
  db()
    .prepare(
      `UPDATE tracks SET stage = MAX(0, MIN(?, stage + ?)), updated_at = datetime('now') WHERE id = ?`,
    )
    .run(TRACK_STAGES.length - 1, delta, id);
}

export function addRevision(id: number) {
  db()
    .prepare("UPDATE tracks SET mix_revisions = mix_revisions + 1, stage = MAX(stage, 2), updated_at = datetime('now') WHERE id = ?")
    .run(id);
}

export function deleteTrack(id: number) {
  db().prepare("DELETE FROM tracks WHERE id = ?").run(id);
}

// ─── Equipment ─────────────────────────────────────────────────────────────

export const EQUIPMENT_CATEGORIES = ["Microfoni", "Preamp & outboard", "Monitor & cuffie", "Strumenti", "Computer & interfacce", "Software", "Arredo & acustica", "Altro"] as const;

export type Equipment = {
  id: number;
  name: string;
  category: string;
  purchase_date: string;
  cost_cents: number;
  life_years: number;
  warranty_until: string | null;
  service_months: number | null;
  last_service: string | null;
  notes: string;
};

/** Straight-line depreciation: value left today. */
export function residualValue(e: Equipment, on = today()): number {
  const years = (Date.parse(on) - Date.parse(e.purchase_date)) / (365.25 * 86_400_000);
  return Math.max(0, Math.round(e.cost_cents * (1 - years / Math.max(1, e.life_years))));
}

export function nextService(e: Equipment): string | null {
  if (!e.service_months) return null;
  const base = new Date(`${e.last_service ?? e.purchase_date}T12:00:00`);
  base.setMonth(base.getMonth() + e.service_months);
  return isoDate(base);
}

export function listEquipment(): Equipment[] {
  return db().prepare("SELECT * FROM equipment ORDER BY category, name").all() as Equipment[];
}

export function addEquipment(input: Omit<Equipment, "id" | "last_service">) {
  db()
    .prepare(
      `INSERT INTO equipment(name, category, purchase_date, cost_cents, life_years, warranty_until, service_months, notes)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.name, input.category, input.purchase_date, input.cost_cents, input.life_years, input.warranty_until, input.service_months, input.notes);
}

export function markServiced(id: number) {
  db().prepare("UPDATE equipment SET last_service = ? WHERE id = ?").run(today(), id);
}

export function deleteEquipment(id: number) {
  db().prepare("DELETE FROM equipment WHERE id = ?").run(id);
}

/** Equipment needing attention: maintenance due within 14 days or warranty ending within 60. */
export function equipmentAlerts(list = listEquipment()) {
  const t = today();
  return list.flatMap((e) => {
    const out: { id: number; name: string; kind: "manutenzione" | "garanzia"; date: string; late: boolean }[] = [];
    const ns = nextService(e);
    if (ns && ns <= addDays(t, 14)) out.push({ id: e.id, name: e.name, kind: "manutenzione", date: ns, late: ns < t });
    if (e.warranty_until && e.warranty_until >= t && e.warranty_until <= addDays(t, 60)) out.push({ id: e.id, name: e.name, kind: "garanzia", date: e.warranty_until, late: false });
    return out;
  });
}
