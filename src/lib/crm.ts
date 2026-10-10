import "server-only";
import { db, tx } from "./db";

export const LEAD_STATUSES = ["nuovo", "contattato", "in trattativa", "convertito", "perso"] as const;
export const SERVICES = ["Registrazione", "Mix", "Master", "Produzione", "Sessione vocale", "Beat", "Editing"] as const;

export const PACKAGE_PRESETS: { name: string; priceEur: number; items: [string, number][] }[] = [
  { name: "Singolo Completo", priceEur: 350, items: [["Registrazione", 1], ["Mix", 1], ["Master", 1]] },
  { name: "EP Pack", priceEur: 1500, items: [["Registrazione", 5], ["Mix", 5], ["Master", 5]] },
  { name: "Produzione + Singolo", priceEur: 600, items: [["Produzione", 1], ["Registrazione", 1], ["Mix", 1], ["Master", 1]] },
  { name: "Vocal Sessions x4", priceEur: 280, items: [["Sessione vocale", 4]] },
  { name: "Mix & Master x3", priceEur: 390, items: [["Mix", 3], ["Master", 3]] },
];

export type Lead = {
  id: number;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  genre: string;
  notes: string;
  source: string;
  status: string;
  created_at: string;
};

export type PackageItem = { id: number; package_id: number; service: string; done_at: string | null; done_by: string | null };
export type Package = {
  id: number;
  artist_id: number;
  name: string;
  price_cents: number;
  purchased_at: string;
  archived: number;
  items: PackageItem[];
};
export type UpsellState = "esaurito" | "in-esaurimento" | "attivo" | "nessun-pacchetto";
export type Artist = {
  id: number;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  notes: string;
  created_at: string;
  packages: Package[];
  total: number;
  done: number;
  remaining: number;
  upsell: UpsellState;
};

// ─── Leads ──────────────────────────────────────────────────────────────────

export function listLeads(): Lead[] {
  return db()
    .prepare(
      `SELECT * FROM leads ORDER BY CASE status WHEN 'nuovo' THEN 0 WHEN 'contattato' THEN 1 WHEN 'in trattativa' THEN 2
       WHEN 'convertito' THEN 3 ELSE 4 END, created_at DESC`,
    )
    .all() as Lead[];
}

export type LeadInput = Pick<Lead, "name" | "email" | "phone" | "instagram" | "genre" | "notes">;

export function addLead(input: LeadInput & { source?: string; externalRef?: string }) {
  return db()
    .prepare(
      `INSERT INTO leads(name, email, phone, instagram, genre, notes, source, external_ref)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(external_ref) DO UPDATE SET
         name = excluded.name, email = excluded.email, phone = excluded.phone,
         instagram = excluded.instagram, genre = excluded.genre`,
    )
    .run(
      input.name,
      input.email,
      input.phone,
      input.instagram,
      input.genre,
      input.notes,
      input.source ?? "manuale",
      input.externalRef ?? null,
    );
}

export function setLeadStatus(id: number, status: string) {
  db().prepare("UPDATE leads SET status = ? WHERE id = ?").run(status, id);
}

export function deleteLead(id: number) {
  db().prepare("DELETE FROM leads WHERE id = ?").run(id);
}

/** Turns a lead into an artist profile and marks it converted. */
export function convertLead(id: number): number {
  return tx(() => {
    const lead = db().prepare("SELECT * FROM leads WHERE id = ?").get(id) as Lead | undefined;
    if (!lead) throw new Error("Lead non trovato");
    const res = db()
      .prepare("INSERT INTO artists(name, email, phone, instagram, notes, lead_id) VALUES(?, ?, ?, ?, ?, ?)")
      .run(lead.name, lead.email, lead.phone, lead.instagram, lead.notes, lead.id);
    db().prepare("UPDATE leads SET status = 'convertito' WHERE id = ?").run(id);
    return Number(res.lastInsertRowid);
  });
}

// ─── Artists & packages ─────────────────────────────────────────────────────

export function upsellState(total: number, remaining: number): UpsellState {
  if (total === 0) return "nessun-pacchetto";
  if (remaining === 0) return "esaurito";
  if (remaining <= Math.max(1, Math.ceil(total * 0.25))) return "in-esaurimento";
  return "attivo";
}

export function listArtists(): Artist[] {
  const artists = db().prepare("SELECT * FROM artists ORDER BY name COLLATE NOCASE").all() as Omit<
    Artist,
    "packages" | "total" | "done" | "remaining" | "upsell"
  >[];
  const packages = db().prepare("SELECT * FROM packages ORDER BY purchased_at DESC, id DESC").all() as Omit<
    Package,
    "items"
  >[];
  const items = db().prepare("SELECT * FROM package_items ORDER BY package_id, position, id").all() as PackageItem[];

  const itemsByPkg = new Map<number, PackageItem[]>();
  for (const it of items) itemsByPkg.set(it.package_id, [...(itemsByPkg.get(it.package_id) ?? []), it]);
  const pkgsByArtist = new Map<number, Package[]>();
  for (const p of packages) {
    pkgsByArtist.set(p.artist_id, [...(pkgsByArtist.get(p.artist_id) ?? []), { ...p, items: itemsByPkg.get(p.id) ?? [] }]);
  }

  const order: Record<UpsellState, number> = { esaurito: 0, "in-esaurimento": 1, attivo: 2, "nessun-pacchetto": 3 };
  return artists
    .map((a) => {
      const pkgs = pkgsByArtist.get(a.id) ?? [];
      const activeItems = pkgs.filter((p) => !p.archived).flatMap((p) => p.items);
      const total = activeItems.length;
      const done = activeItems.filter((i) => i.done_at).length;
      return { ...a, packages: pkgs, total, done, remaining: total - done, upsell: upsellState(total, total - done) };
    })
    .sort((x, y) => order[x.upsell] - order[y.upsell] || x.name.localeCompare(y.name));
}

export function addArtist(input: { name: string; email: string; phone: string; instagram: string; notes: string }) {
  const res = db()
    .prepare("INSERT INTO artists(name, email, phone, instagram, notes) VALUES(?, ?, ?, ?, ?)")
    .run(input.name, input.email, input.phone, input.instagram, input.notes);
  return Number(res.lastInsertRowid);
}

export function deleteArtist(id: number) {
  db().prepare("DELETE FROM artists WHERE id = ?").run(id);
}

export function addPackage(input: { artistId: number; name: string; priceCents: number; purchasedAt: string; items: [string, number][] }) {
  tx(() => {
    const res = db()
      .prepare("INSERT INTO packages(artist_id, name, price_cents, purchased_at) VALUES(?, ?, ?, ?)")
      .run(input.artistId, input.name, input.priceCents, input.purchasedAt);
    const pkgId = Number(res.lastInsertRowid);
    const ins = db().prepare("INSERT INTO package_items(package_id, service, position) VALUES(?, ?, ?)");
    let pos = 0;
    for (const [service, qty] of input.items) {
      for (let i = 0; i < qty; i++) ins.run(pkgId, qty > 1 ? `${service} ${i + 1}/${qty}` : service, pos++);
    }
  });
}

export function toggleItem(itemId: number, done: boolean, partner: string) {
  db()
    .prepare("UPDATE package_items SET done_at = ?, done_by = ? WHERE id = ?")
    .run(done ? new Date().toISOString() : null, done ? partner : null, itemId);
}

export function archivePackage(id: number, archived: boolean) {
  db().prepare("UPDATE packages SET archived = ? WHERE id = ?").run(archived ? 1 : 0, id);
}

export function deletePackage(id: number) {
  db().prepare("DELETE FROM packages WHERE id = ?").run(id);
}
