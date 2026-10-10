// Fills a local database with fictional demo data to try the hub.
// Usage: npm run seed            (refuses if the database already has data)
//        npm run seed -- --force (adds demo data anyway)
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { COLUMN_MIGRATIONS, SCHEMA } from "../src/lib/schema.ts";

const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "hub.db"));
db.exec(SCHEMA);
for (const [table, column, definition] of COLUMN_MIGRATIONS) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
const PARTNERS = (process.env.PARTNERS ?? "Plugghe,Freya,Astral").split(",").map((p) => p.trim()).filter(Boolean);
const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

const { n } = db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number };
if (n > 0 && !process.argv.includes("--force")) {
  console.error("Il database contiene già dati: aggiungi --force per inserire comunque i dati demo.");
  process.exit(1);
}

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const now = new Date();
const year = now.getFullYear();

const insTx = db.prepare(
  "INSERT OR IGNORE INTO transactions(id, date, amount_cents, description, counterparty, category, source, created_by) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
);
db.exec("BEGIN");
for (let m = 0; m <= now.getMonth(); m++) {
  const season = 1 + 0.35 * Math.sin((m / 12) * Math.PI * 2 - 1);
  const sessions = Math.round(14 * season + rand() * 6);
  for (let i = 0; i < sessions; i++) {
    const lastDay = m === now.getMonth() ? now.getDate() : 27;
    const day = 1 + Math.floor(rand() * lastDay);
    const cash = rand() < 0.3;
    const cat = rand() < 0.5 ? "Sessioni" : rand() < 0.6 ? "Mix & Master" : "Pacchetti";
    const amount = Math.round((cat === "Pacchetti" ? 350 + rand() * 900 : 60 + rand() * 220) * 100);
    insTx.run(`demo:${year}-${m}-in-${i}`, iso(new Date(year, m, day, 12)), amount, `${cat} — artista demo`, "", cat, cash ? "cash" : "bank", cash ? pick(PARTNERS) : null);
  }
  const fixed: [string, number][] = [["Affitto", 1400], ["Utenze", 180 + rand() * 120], ["Software & Plugin", 60 + rand() * 90], ["Marketing", 150 + rand() * 350]];
  if (rand() < 0.35) fixed.push(["Attrezzatura", 300 + rand() * 1800]);
  fixed.forEach(([cat, eur], i) =>
    (m < now.getMonth() || 3 + i * 5 <= now.getDate()) &&
    insTx.run(`demo:${year}-${m}-out-${i}`, iso(new Date(year, m, 3 + i * 5, 12)), -Math.round(eur * 100), `${cat} (demo)`, "", cat, "bank", null),
  );
}

const insLead = db.prepare(
  `INSERT OR IGNORE INTO leads(name, email, genre, notes, source, status, external_ref, channel, referred_by, next_action, next_action_date, last_contact, created_at)
   VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const dayIso = (offset: number) => iso(new Date(now.getTime() + offset * 86400000));
[
  ["Nova Kid", "nova@example.com", "Trap", "Cerca EP da 5 tracce", "drive", "nuovo", "Instagram", PARTNERS[0], "Chiamare per il preventivo EP", dayIso(-1), null, dayIso(-12)],
  ["Lara V", "lara@example.com", "R&B", "Vuole sessioni vocali settimanali", "sito", "contattato", "Sito web", PARTNERS[1], "Mandare listino vocal", dayIso(2), dayIso(-3), dayIso(-8)],
  ["Gemma Rossi", "gemma@example.com", "Pop", "Singolo + videoclip, budget 900 €", "manuale", "in trattativa", "Passaparola", PARTNERS[2], "", null, dayIso(-10), dayIso(-20)],
  ["Sabbia", "sabbia@example.com", "Indie", "Budget 800€", "drive", "nuovo", "TikTok", "", "", null, null, dayIso(-2)],
  ["Rocco Beats", "rocco@example.com", "Hip hop", "Ha chiesto il listino beat", "sito", "perso", "Sito web", "", "", null, dayIso(-30), dayIso(-40)],
].forEach(([name, email, genre, notes, source, status, channel, ref, action, actionDate, last, created]) =>
  insLead.run(name, email, genre, notes, source, status, `demo:${email}`, channel, ref, action, actionDate, last, created),
);

const artist = db.prepare("INSERT INTO artists(name, instagram, channel, referred_by) VALUES(?, ?, ?, ?)");
const pkg = db.prepare("INSERT INTO packages(artist_id, name, price_cents, purchased_at, due_date) VALUES(?, ?, ?, ?, ?)");
const item = db.prepare("INSERT INTO package_items(package_id, service, position, done_at, done_by) VALUES(?, ?, ?, ?, ?)");
const pay = db.prepare("INSERT INTO payments(package_id, date, amount_cents, method, created_by) VALUES(?, ?, ?, ?, ?)");
const track = db.prepare("INSERT INTO tracks(artist_id, title, stage, mix_revisions, due_date) VALUES(?, ?, ?, ?, ?)");
const expand = (list: [string, number][]) => list.flatMap(([s, q]) => Array.from({ length: q }, (_, i) => (q > 1 ? `${s} ${i + 1}/${q}` : s)));
type DemoArtist = { name: string; ig: string; channel: string; ref: string; pkg: string; price: number; items: [string, number][]; done: number; bought: number; due: number | null; paid: [number, string, number][]; tracks: [string, number, number, number | null][] };
const demoArtists: DemoArtist[] = [
  { name: "Kaos Melodico", ig: "@kaosmelodico", channel: "Instagram", ref: PARTNERS[0], pkg: "EP Pack", price: 150000, items: [["Registrazione", 5], ["Mix", 5], ["Master", 5]], done: 13, bought: -60, due: -5, paid: [[60000, "bonifico", -60], [40000, "bonifico", -25]], tracks: [["Notte fonda", 4, 2, null], ["Cemento", 3, 3, 4], ["Luce blu", 2, 1, 9], ["Fuori", 1, 0, 15], ["Outro", 0, 0, 20]] },
  { name: "Aria Blu", ig: "@ariablu", channel: "TikTok", ref: PARTNERS[1], pkg: "Singolo Completo", price: 35000, items: [["Registrazione", 1], ["Mix", 1], ["Master", 1]], done: 3, bought: -20, due: -10, paid: [[35000, "contanti", -20]], tracks: [["Polvere", 4, 1, null]] },
  { name: "Dr. Bassi", ig: "@drbassi", channel: "Passaparola", ref: PARTNERS[2], pkg: "Vocal Sessions x4", price: 28000, items: [["Sessione vocale", 4]], done: 1, bought: -10, due: 20, paid: [[14000, "pos", -10]], tracks: [] },
  { name: "Lunaria", ig: "@lunaria", channel: "Sito web", ref: PARTNERS[0], pkg: "Produzione + Singolo", price: 60000, items: [["Produzione", 1], ["Registrazione", 1], ["Mix", 1], ["Master", 1]], done: 2, bought: -14, due: 10, paid: [[30000, "bonifico", -14]], tracks: [["Marea", 2, 2, 6]] },
];
const itemIds = new Map<string, number[]>();
for (const d of demoArtists) {
  const a = Number(artist.run(d.name, d.ig, d.channel, d.ref).lastInsertRowid);
  const p = Number(pkg.run(a, d.pkg, d.price, dayIso(d.bought), d.due === null ? null : dayIso(d.due)).lastInsertRowid);
  const ids: number[] = [];
  expand(d.items).forEach((s, i) => ids.push(Number(item.run(p, s, i, i < d.done ? dayIso(d.bought + 2 + i * 3) : null, i < d.done ? pick(PARTNERS) : null).lastInsertRowid)));
  itemIds.set(d.name, ids);
  for (const [cents, method, off] of d.paid) pay.run(p, dayIso(off), cents, method, pick(PARTNERS));
  for (const [title, stage, rev, due] of d.tracks) track.run(a, title, stage, rev, due === null ? null : dayIso(due));
}

// Agenda: past 8 weeks of sessions + this week and next
const sess = db.prepare("INSERT INTO sessions(date, start_time, end_time, room, engineer, artist_id, item_id, title, status) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)");
const artistIds = (db.prepare("SELECT id FROM artists").all() as { id: number }[]).map((r) => r.id);
const SLOTS = [["10:00", "13:00"], ["14:00", "17:00"], ["15:00", "18:00"], ["18:00", "21:00"], ["19:00", "22:00"]];
for (let off = -56; off <= 10; off++) {
  const d = new Date(now.getTime() + off * 86400000);
  if (d.getDay() === 0) continue;
  const n = Math.floor(rand() * 3) + (d.getDay() >= 4 ? 1 : 0);
  const booked: [string, string, string][] = [];
  for (let k = 0; k < n; k++) {
    const [start, end] = d.getDay() >= 4 && rand() < 0.6 ? SLOTS[3 + Math.floor(rand() * 2)] : pick(SLOTS);
    const room = rand() < 0.65 ? "Sala A" : "Sala B";
    if (booked.some(([r, s0, e0]) => r === room && s0 < end && e0 > start)) continue;
    booked.push([room, start, end]);
    const status = off < 0 ? (rand() < 0.08 ? "annullata" : "completata") : "prenotata";
    sess.run(iso(d), start, end, room, pick(PARTNERS), pick(artistIds), null, "", status);
  }
}
// next sessions linked to pending package services
const bassi = itemIds.get("Dr. Bassi")!, luna = itemIds.get("Lunaria")!;
const openDay = (offset: number) => { let o = offset; while (new Date(now.getTime() + o * 86400000).getDay() === 0) o++; return dayIso(o); };
sess.run(openDay(1), "10:00", "13:00", "Sala A", PARTNERS[1], null, bassi[1], "", "prenotata");
sess.run(openDay(3), "11:00", "14:00", "Sala B", PARTNERS[0], null, luna[2], "", "prenotata");

// Equipment
const eq = db.prepare("INSERT INTO equipment(name, category, purchase_date, cost_cents, life_years, warranty_until, service_months, last_service, notes) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)");
eq.run("Neumann U87 Ai", "Microfoni", dayIso(-700), 320000, 8, dayIso(30), 12, dayIso(-370), "Matricola demo");
eq.run("Universal Audio Apollo x8", "Computer & interfacce", dayIso(-420), 290000, 5, dayIso(310), null, null, "");
eq.run("Genelec 8040B (coppia)", "Monitor & cuffie", dayIso(-900), 180000, 7, null, null, null, "");
eq.run("Neve 1073 DPX", "Preamp & outboard", dayIso(-300), 380000, 8, dayIso(400), 24, null, "");
eq.run("Pannelli acustici sala A", "Arredo & acustica", dayIso(-1000), 150000, 10, null, null, null, "");
eq.run("Mac Studio M2", "Computer & interfacce", dayIso(-500), 260000, 4, dayIso(45), 6, dayIso(-200), "Pulizia e backup ogni 6 mesi");

// Partner draws
const mv = db.prepare("INSERT INTO partner_moves(date, partner, kind, amount_cents, note) VALUES(?, ?, ?, ?, ?)");
for (let mth = 0; mth < now.getMonth(); mth++) {
  PARTNERS.forEach((p, i) => mv.run(iso(new Date(year, mth, 28, 12)), p, "prelievo", 35000 + i * 5000, `Compenso ${["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"][mth]}`));
}
mv.run(iso(new Date(year, 0, 10, 12)), PARTNERS[0], "versamento", 150000, "Contributo acquisto Neve 1073");

const insMetric = db.prepare("INSERT OR REPLACE INTO metrics(date, source, key, value) VALUES(?, ?, ?, ?)");
let igF = 4200, ttF = 9800;
for (let d = 45; d >= 1; d--) {
  const date = iso(new Date(now.getTime() - d * 86400000));
  igF += Math.round(rand() * 25 - 3);
  ttF += Math.round(rand() * 60 - 8);
  const igViews = Math.round(2500 + rand() * 4000);
  insMetric.run(date, "instagram", "followers", igF);
  insMetric.run(date, "instagram", "views", igViews);
  insMetric.run(date, "instagram", "reach", Math.round(igViews * (0.45 + rand() * 0.2)));
  insMetric.run(date, "instagram", "interactions", Math.round(igViews * (0.03 + rand() * 0.03)));
  insMetric.run(date, "instagram", "saves", Math.round(10 + rand() * 40));
  insMetric.run(date, "instagram", "shares", Math.round(5 + rand() * 30));
  const ttViews = Math.round(5000 + rand() * 15000);
  insMetric.run(date, "tiktok", "followers", ttF);
  insMetric.run(date, "tiktok", "views", ttViews);
  insMetric.run(date, "tiktok", "interactions", Math.round(ttViews * (0.04 + rand() * 0.04)));
  insMetric.run(date, "tiktok", "shares", Math.round(20 + rand() * 80));
  insMetric.run(date, "tiktok", "comments", Math.round(15 + rand() * 60));
  const users = Math.round(80 + rand() * 140);
  insMetric.run(date, "web", "users", users);
  insMetric.run(date, "web", "sessions", Math.round(users * 1.3));
  insMetric.run(date, "web", "engagement_rate", 0.45 + rand() * 0.2);
  insMetric.run(date, "web", "clicks", Math.round(users * (0.1 + rand() * 0.1)));
  insMetric.run(date, "web", "applications", Math.floor(rand() * 4));
}

const insNote = db.prepare("INSERT INTO insights(title, body, category, pinned, author, due_date) VALUES(?, ?, ?, ?, ?, ?)");
insNote.run("Pacchetto “Emergenti” per l'estate", "Bundle 3 singoli con sconto 15%: target artisti arrivati dal sito.", "Strategia", 1, PARTNERS[0], null);
insNote.run("Rinnovo consenso bancario", "Il consenso PSD2 scade ogni 180 giorni: rinnovarlo da Impostazioni.", "Promemoria", 1, PARTNERS[2], iso(new Date(now.getTime() + 20 * 86400000)));
insNote.run("Reel dietro le quinte ogni martedì", "I contenuti backstage hanno il miglior tasso di salvataggio.", "Marketing", 0, PARTNERS[1], null);
db.exec("COMMIT");
console.log("Dati demo inseriti in", path.join(dir, "hub.db"));
