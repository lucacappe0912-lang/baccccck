// Edge-safe: used by both middleware and server code. No Node-only imports here.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "br_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type Session = { partner: string };

function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET mancante o troppo corto (minimo 32 caratteri).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({ partner: session.partner })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("backrooms-hub")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "backrooms-hub", algorithms: ["HS256"] });
    return typeof payload.partner === "string" ? { partner: payload.partner } : null;
  } catch {
    return null;
  }
}
