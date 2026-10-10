import { scryptSync, timingSafeEqual, randomBytes } from "node:crypto";

// Format: scrypt:<N>:<saltB64>:<hashB64>  (":" not "$", so .env variable expansion never mangles it)
export function hashPassword(password: string, N = 2 ** 15): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 });
  return `scrypt:${N}:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, nStr, saltB64, hashB64] = stored.split(":");
  if (scheme !== "scrypt" || !nStr || !saltB64 || !hashB64) return false;
  const N = Number(nStr);
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N,
    r: 8,
    p: 1,
    maxmem: 128 * N * 8 * 2,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Simple in-memory brute-force guard: 5 failed attempts per IP → 15 minutes lockout.
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export function isLocked(ip: string): number {
  const entry = attempts.get(ip);
  if (!entry || entry.until < Date.now()) return 0;
  return entry.count >= MAX_ATTEMPTS ? Math.ceil((entry.until - Date.now()) / 60000) : 0;
}

export function registerFailure(ip: string) {
  const entry = attempts.get(ip);
  const now = Date.now();
  if (!entry || entry.until < now) attempts.set(ip, { count: 1, until: now + LOCK_MS });
  else entry.count += 1;
}

export function clearFailures(ip: string) {
  attempts.delete(ip);
}
