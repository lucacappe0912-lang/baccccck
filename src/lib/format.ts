const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const eurCompact = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("it-IT");
const compact = new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 });

export const fmtEur = (cents: number) => eur.format(cents / 100);
export const fmtEurShort = (cents: number) => eurCompact.format(cents / 100);
export const fmtNum = (n: number) => num.format(Math.round(n));
export const fmtCompact = (n: number) => compact.format(n);
export const fmtPct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")}%`;

export function fmtDate(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

export const MONTHS_IT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function today(): string {
  return isoDate(new Date());
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Parses "1.234,56" / "1234.56" / "-50" into integer cents. */
export function parseEuroToCents(input: string): number | null {
  let s = input.trim().replace(/[€\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
