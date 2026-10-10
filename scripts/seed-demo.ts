// Fills a local database with fictional demo data to try the hub.
// Usage: npm run seed            (refuses if the database already has data)
//        npm run seed -- --force (adds demo data anyway)
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SCHEMA } from "../src/lib/schema.ts";

const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, "hub.db"));
db.exec(SCHEMA);

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
    insTx.run(`demo:${year}-${m}-in-${i}`, iso(new Date(year, m, day, 12)), amount, `${cat} — artista demo`, "", cat, cash ? "cash" : "bank", cash ? "Demo" : null);
  }
  const fixed: [string, number][] = [["Affitto", 1400], ["Utenze", 180 + rand() * 120], ["Software & Plugin", 60 + rand() * 90], ["Marketing", 150 + rand() * 350]];
  if (rand() < 0.35) fixed.push(["Attrezzatura", 300 + rand() * 1800]);
  fixed.forEach(([cat, eur], i) =>
    (m < now.getMonth() || 3 + i * 5 <= now.getDate()) &&
    insTx.run(`demo:${year}-${m}-out-${i}`, iso(new Date(year, m, 3 + i * 5, 12)), -Math.round(eur * 100), `${cat} (demo)`, "", cat, "bank", null),
  );
}

const insLead = db.prepare("INSERT OR IGNORE INTO leads(name, email, genre, notes, source, status, external_ref) VALUES(?, ?, ?, ?, ?, ?, ?)");
[
  ["Nova Kid", "nova@example.com", "Trap", "Cerca EP da 5 tracce", "drive", "nuovo"],
  ["Lara V", "lara@example.com", "R&B", "Vuole sessioni vocali settimanali", "sito", "contattato"],
  ["Gemelli Diversi Demo", "gd@example.com", "Pop", "", "manuale", "in trattativa"],
  ["Sabbia", "sabbia@example.com", "Indie", "Budget 800€", "drive", "nuovo"],
].forEach(([name, email, genre, notes, source, status]) => insLead.run(name, email, genre, notes, source, status, `demo:${email}`));

const artist = db.prepare("INSERT INTO artists(name, instagram) VALUES(?, ?)");
const pkg = db.prepare("INSERT INTO packages(artist_id, name, price_cents, purchased_at) VALUES(?, ?, ?, ?)");
const item = db.prepare("INSERT INTO package_items(package_id, service, position, done_at, done_by) VALUES(?, ?, ?, ?, ?)");
const demoArtists: [string, string, number, string[], number][] = [
  ["Kaos Melodico", "@kaosmelodico", 150000, ["Registrazione 1/5", "Registrazione 2/5", "Registrazione 3/5", "Registrazione 4/5", "Registrazione 5/5", "Mix 1/5", "Mix 2/5", "Mix 3/5", "Mix 4/5", "Mix 5/5"], 9],
  ["Aria Blu", "@ariablu", 35000, ["Registrazione", "Mix", "Master"], 3],
  ["Dr. Bassi", "@drbassi", 28000, ["Sessione vocale 1/4", "Sessione vocale 2/4", "Sessione vocale 3/4", "Sessione vocale 4/4"], 1],
];
for (const [name, ig, price, services, done] of demoArtists) {
  const a = Number(artist.run(name, ig).lastInsertRowid);
  const p = Number(pkg.run(a, `Pacchetto demo ${services.length} servizi`, price, iso(new Date(year, now.getMonth(), 1))).lastInsertRowid);
  services.forEach((s, i) => item.run(p, s, i, i < done ? new Date().toISOString() : null, i < done ? "Demo" : null));
}

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
insNote.run("Pacchetto “Emergenti” per l'estate", "Bundle 3 singoli con sconto 15%: target artisti arrivati dal sito.", "Strategia", 1, "Demo", null);
insNote.run("Rinnovo consenso bancario", "Il consenso PSD2 scade ogni 180 giorni: rinnovarlo da Integrazioni.", "Promemoria", 1, "Demo", iso(new Date(now.getTime() + 20 * 86400000)));
insNote.run("Reel dietro le quinte ogni martedì", "I contenuti backstage hanno il miglior tasso di salvataggio.", "Marketing", 0, "Demo", null);
db.exec("COMMIT");
console.log("Dati demo inseriti in", path.join(dir, "hub.db"));
