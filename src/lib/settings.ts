import "server-only";
import { kvGet, kvSet } from "./db";
import { partners } from "./partners";

export type StudioSettings = {
  rooms: string[];
  openHour: number; // 0-23
  closeHour: number; // 1-24
  openDays: number[]; // 1 = lunedì … 7 = domenica
  fixedCosts: { label: string; cents: number }[];
  tax: {
    coefficient: number; // coefficiente di redditività forfettario (0.67 = 67%)
    substituteRate: number; // imposta sostitutiva (0.15, o 0.05 i primi 5 anni)
    inpsRate: number; // aliquota contributi sul reddito
    threshold: number; // soglia ricavi per partita IVA, in euro
    vatNumbers: number; // quante partite IVA si dividono i ricavi
  };
  shares: Record<string, number>; // quote soci in percentuale
};

/** Example values (forfettario): every number is editable from Impostazioni. */
export function defaultSettings(): StudioSettings {
  const p = partners();
  const share = Math.round((100 / p.length) * 100) / 100;
  return {
    rooms: ["Sala A", "Sala B"],
    openHour: 10,
    closeHour: 22,
    openDays: [1, 2, 3, 4, 5, 6],
    fixedCosts: [
      { label: "Affitto", cents: 140000 },
      { label: "Utenze", cents: 25000 },
      { label: "Software & plugin", cents: 15000 },
      { label: "Marketing", cents: 30000 },
      { label: "Altro", cents: 20000 },
    ],
    tax: { coefficient: 0.67, substituteRate: 0.15, inpsRate: 0.2607, threshold: 85000, vatNumbers: p.length },
    shares: Object.fromEntries(p.map((name) => [name, share])),
  };
}

export function getSettings(): StudioSettings {
  const stored = kvGet<Partial<StudioSettings>>("settings") ?? {};
  const d = defaultSettings();
  const shares = { ...d.shares, ...(stored.shares ?? {}) };
  // Partners renamed or removed in .env no longer take a share.
  for (const k of Object.keys(shares)) if (!partners().includes(k)) delete shares[k];
  return { ...d, ...stored, tax: { ...d.tax, ...(stored.tax ?? {}) }, shares };
}

export function saveSettings(s: StudioSettings) {
  kvSet("settings", s);
}

export const fixedCostsTotal = (s: StudioSettings) => s.fixedCosts.reduce((a, c) => a + c.cents, 0);

export const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
