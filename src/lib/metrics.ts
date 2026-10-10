import "server-only";
import { db } from "./db";
import { addDays } from "./format";

export type Source = "instagram" | "tiktok" | "web";

export const METRIC_DEFS: Record<Source, { key: string; label: string; kind: "count" | "pct" }[]> = {
  instagram: [
    { key: "views", label: "Visualizzazioni", kind: "count" },
    { key: "reach", label: "Account raggiunti", kind: "count" },
    { key: "followers", label: "Follower", kind: "count" },
    { key: "interactions", label: "Interazioni totali", kind: "count" },
    { key: "saves", label: "Salvataggi", kind: "count" },
    { key: "shares", label: "Condivisioni", kind: "count" },
  ],
  tiktok: [
    { key: "views", label: "Visualizzazioni", kind: "count" },
    { key: "followers", label: "Follower", kind: "count" },
    { key: "interactions", label: "Interazioni totali", kind: "count" },
    { key: "shares", label: "Condivisioni", kind: "count" },
    { key: "comments", label: "Commenti", kind: "count" },
  ],
  web: [
    { key: "users", label: "Visitatori unici", kind: "count" },
    { key: "sessions", label: "Sessioni", kind: "count" },
    { key: "engagement_rate", label: "Tasso di interazione", kind: "pct" },
    { key: "clicks", label: "Clic", kind: "count" },
    { key: "applications", label: "Candidature", kind: "count" },
  ],
};

export function setMetric(date: string, source: Source, key: string, value: number) {
  db()
    .prepare(
      "INSERT INTO metrics(date, source, key, value) VALUES(?, ?, ?, ?) ON CONFLICT(date, source, key) DO UPDATE SET value = excluded.value",
    )
    .run(date, source, key, value);
}

export function getMetric(date: string, source: Source, key: string): number | null {
  const row = db().prepare("SELECT value FROM metrics WHERE date = ? AND source = ? AND key = ?").get(date, source, key) as
    | { value: number }
    | undefined;
  return row?.value ?? null;
}

/** Daily series for the last `days` days ending at `end` (inclusive). Missing days are null. */
export function series(source: Source, key: string, days: number, end: string): (number | null)[] {
  const start = addDays(end, -(days - 1));
  const rows = db()
    .prepare("SELECT date, value FROM metrics WHERE source = ? AND key = ? AND date BETWEEN ? AND ?")
    .all(source, key, start, end) as { date: string; value: number }[];
  const map = new Map(rows.map((r) => [r.date, r.value]));
  return Array.from({ length: days }, (_, i) => map.get(addDays(start, i)) ?? null);
}

export function latestMetricDate(): string | null {
  const row = db().prepare("SELECT MAX(date) AS d FROM metrics").get() as { d: string | null };
  return row.d;
}

// ─── Website applications ───────────────────────────────────────────────────

export type Application = {
  id: number;
  name: string;
  email: string;
  phone: string;
  kind: string;
  message: string;
  received_at: string;
};

export function addApplication(input: Omit<Application, "id" | "received_at">) {
  db()
    .prepare("INSERT INTO applications(name, email, phone, kind, message) VALUES(?, ?, ?, ?, ?)")
    .run(input.name, input.email, input.phone, input.kind, input.message);
}

export function recentApplications(limit = 20): Application[] {
  return db().prepare("SELECT * FROM applications ORDER BY received_at DESC LIMIT ?").all(limit) as Application[];
}

/** Applications received on a local calendar day (stored as UTC). */
export function countApplications(date: string): number {
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM applications WHERE date(received_at, 'localtime') = ?")
    .get(date) as { n: number };
  return row.n;
}
