// Creates/updates .env.local with the master password hash and fresh secrets.
// Reads the password from the HUB_PASSWORD environment variable (never from argv,
// so it doesn't show up in the process list). Used by the Windows installer.
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const password = process.env.HUB_PASSWORD ?? "";
if (password.length < 12) {
  console.error("La master password deve avere almeno 12 caratteri.");
  process.exit(1);
}
const N = 2 ** 15;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 });
const secret = () => randomBytes(32).toString("base64url");

const file = ".env.local";
let text = existsSync(file) ? readFileSync(file, "utf8") : readFileSync(".env.example", "utf8");
const set = (key, value, onlyIfEmpty = false) => {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = text.match(re);
  if (m && onlyIfEmpty && m[1].trim()) return;
  text = m ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
};
set("MASTER_PASSWORD_HASH", `scrypt:${N}:${salt.toString("base64")}:${hash.toString("base64")}`);
set("SESSION_SECRET", randomBytes(48).toString("base64url"), true);
set("CRON_SECRET", secret(), true);
set("APPLICATION_WEBHOOK_SECRET", secret(), true);
if (process.env.HUB_PARTNERS) set("PARTNERS", process.env.HUB_PARTNERS);
if (process.env.HUB_URL) set("APP_URL", process.env.HUB_URL);
set("INTERNAL_SCHEDULER", "true", true);
writeFileSync(file, text);
console.log(`Configurazione salvata in ${file}`);
