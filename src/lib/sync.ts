import "server-only";
import { kvGet, logSync } from "./db";
import { findColumn, parseCsv } from "./csv";
import { addDays, today } from "./format";
import { upsertBankTransactions } from "./finance";
import { addLead } from "./crm";
import { countApplications, getMetric, setMetric } from "./metrics";
import { bankConfigured, currentBankLink, fetchBankTransactions } from "./integrations/gocardless";
import { fetchDriveClientSheets, fetchGa4Day, googleConfigured } from "./integrations/google";
import { fetchInstagramDay, instagramConfigured } from "./integrations/instagram";
import { fetchTikTokTotals, tiktokConfigured } from "./integrations/tiktok";

export type JobResult = { job: string; ok: boolean; skipped?: boolean; message: string };

async function run(job: string, fn: () => Promise<string>, enabled: boolean, why: string): Promise<JobResult> {
  if (!enabled) return { job, ok: true, skipped: true, message: why };
  try {
    const message = await fn();
    logSync(job, true, message);
    return { job, ok: true, message };
  } catch (err) {
    const message = (err as Error).message;
    logSync(job, false, message);
    return { job, ok: false, message };
  }
}

export function syncBank() {
  return run(
    "bank",
    async () => {
      // 90-day window: PSD2 caps history on repeated access and dedup makes overlaps harmless.
      const rows = await fetchBankTransactions(addDays(today(), -90));
      const added = upsertBankTransactions(rows);
      return `${added} nuovi movimenti (${rows.length} letti dalla banca)`;
    },
    bankConfigured() && currentBankLink().accounts.length > 0,
    "Conto bancario non collegato",
  );
}

export function syncDrive() {
  return run(
    "drive",
    async () => {
      const sheets = await fetchDriveClientSheets();
      if (sheets.length === 0) return "Nessun file clienti trovato su Drive: sezione pronta per l'inserimento manuale";
      let imported = 0;
      for (const { file, csv } of sheets) {
        const [headers, ...rows] = parseCsv(csv);
        if (!headers) continue;
        const col = {
          name: findColumn(headers, ["nome e cognome", "nome d'arte", "nome", "name", "artista", "cliente"]),
          email: findColumn(headers, ["email", "e-mail", "mail"]),
          phone: findColumn(headers, ["telefono", "cellulare", "phone", "numero", "whatsapp"]),
          instagram: findColumn(headers, ["instagram", "ig", "social"]),
          genre: findColumn(headers, ["genere", "genre", "stile"]),
          notes: findColumn(headers, ["note", "notes", "messaggio", "richiesta"]),
        };
        if (col.name < 0) continue;
        for (const r of rows) {
          const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
          const name = get(col.name);
          if (!name) continue;
          const email = get(col.email).toLowerCase();
          addLead({
            name,
            email,
            phone: get(col.phone),
            instagram: get(col.instagram),
            genre: get(col.genre),
            notes: get(col.notes),
            source: "drive",
            externalRef: `drive:${email || `${file.id}:${name.toLowerCase()}`}`,
          });
          imported++;
        }
      }
      return `${imported} contatti sincronizzati da ${sheets.length} file`;
    },
    googleConfigured() && Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID),
    "Google Drive non configurato",
  );
}

export function syncInstagram(date: string) {
  return run(
    "instagram",
    async () => {
      const { metrics, warnings } = await fetchInstagramDay(date);
      for (const [k, v] of Object.entries(metrics)) setMetric(date, "instagram", k, v);
      return `Report ${date} salvato${warnings.length ? ` (${warnings.length} metriche non disponibili)` : ""}`;
    },
    instagramConfigured(),
    "Instagram non configurato",
  );
}

export function syncTikTok(date: string) {
  return run(
    "tiktok",
    async () => {
      const totals = await fetchTikTokTotals();
      const prev = addDays(date, -1);
      for (const [k, v] of Object.entries(totals)) setMetric(date, "tiktok", k, v);
      const delta = (key: string) => {
        const before = getMetric(prev, "tiktok", key);
        return before === null ? null : Math.max(0, (getMetric(date, "tiktok", key) ?? 0) - before);
      };
      const views = delta("views_total");
      const likes = delta("likes_total");
      const comments = delta("comments_total");
      const shares = delta("shares_total");
      if (views !== null) setMetric(date, "tiktok", "views", views);
      if (comments !== null) setMetric(date, "tiktok", "comments", comments);
      if (shares !== null) setMetric(date, "tiktok", "shares", shares);
      if (likes !== null && comments !== null && shares !== null) setMetric(date, "tiktok", "interactions", likes + comments + shares);
      return views === null ? "Prima istantanea salvata: i dati giornalieri partono da domani" : `Report ${date} salvato`;
    },
    tiktokConfigured(),
    "TikTok non configurato",
  );
}

export function syncWeb(date: string) {
  return run(
    "web",
    async () => {
      setMetric(date, "web", "applications", countApplications(date));
      if (!googleConfigured() || !process.env.GA4_PROPERTY_ID) return "Candidature conteggiate (GA4 non configurato)";
      const ga = await fetchGa4Day(date);
      for (const [k, v] of Object.entries(ga)) setMetric(date, "web", k, v);
      return `Report ${date} salvato`;
    },
    true,
    "",
  );
}

/** Daily job: bank + Drive + yesterday's complete social/web report (+ today's partial applications). */
export async function runDaily(): Promise<JobResult[]> {
  const yesterday = addDays(today(), -1);
  const results = await Promise.all([
    syncBank(),
    syncDrive(),
    syncInstagram(yesterday),
    syncTikTok(today()), // cumulative snapshot: taken "now", so it belongs to today
    syncWeb(yesterday),
  ]);
  setMetric(today(), "web", "applications", countApplications(today()));
  return results;
}

export function lastDailyRun(): string | null {
  return kvGet<string>("scheduler.lastRun");
}
