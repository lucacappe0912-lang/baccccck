// Creates/updates .env.local with password hashes and fresh secrets.
// Passwords are read from environment variables (never argv, so they don't show in the
// process list):
//   HUB_PARTNERS="Plugghe,Freya,Astral"
//   HUB_PASSWORDS='{"Plugghe":"…","Freya":"…"}'   one password per partner (JSON), or
//   HUB_PASSWORD="…"                               one shared master password
// Usage: node scripts/create-env.mjs [output-file]   (default .env.local)
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const N = 2 ** 15;
const hash = (password) => {
  const salt = randomBytes(16);
  const h = scryptSync(password, salt, 64, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 });
  return `scrypt:${N}:${salt.toString("base64")}:${h.toString("base64")}`;
};
const hashVar = (partner) =>
  "PASSWORD_HASH_" +
  partner.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const file = process.argv[2] ?? ".env.local";
let text = existsSync(file) ? readFileSync(file, "utf8") : readFileSync(".env.example", "utf8");
const set = (key, value, onlyIfEmpty = false) => {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = text.match(re);
  if (m && onlyIfEmpty && m[1].trim()) return;
  text = m ? text.replace(re, () => `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
};

const partners = (process.env.HUB_PARTNERS ?? "").split(",").map((p) => p.trim()).filter(Boolean);
if (partners.length) set("PARTNERS", partners.join(","));

if (process.env.HUB_PASSWORDS) {
  const map = JSON.parse(process.env.HUB_PASSWORDS);
  for (const [partner, password] of Object.entries(map)) {
    if (String(password).length < 10) fail(`La password di ${partner} deve avere almeno 10 caratteri.`);
    set(hashVar(partner), hash(String(password)));
  }
} else if (process.env.HUB_PASSWORD) {
  if (process.env.HUB_PASSWORD.length < 10) fail("La password deve avere almeno 10 caratteri.");
  set("MASTER_PASSWORD_HASH", hash(process.env.HUB_PASSWORD));
}

set("SESSION_SECRET", randomBytes(48).toString("base64url"), true);
set("CRON_SECRET", randomBytes(32).toString("base64url"), true);
set("APPLICATION_WEBHOOK_SECRET", randomBytes(32).toString("base64url"), true);
if (process.env.HUB_URL) set("APP_URL", process.env.HUB_URL);
set("INTERNAL_SCHEDULER", "true", true);
writeFileSync(file, text);
console.log(`Configurazione salvata in ${file}`);
