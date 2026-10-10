// Usage: npm run hash-password -- "la-master-password"
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error("Usa una master password di almeno 12 caratteri:  npm run hash-password -- \"…\"");
  process.exit(1);
}
const N = 2 ** 15;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 });
console.log(`MASTER_PASSWORD_HASH=scrypt:${N}:${salt.toString("base64")}:${hash.toString("base64")}`);
console.log(`SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
