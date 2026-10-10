export class IntegrationError extends Error {}

export async function fetchJson<T>(url: string, init: RequestInit = {}, label = "API"): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === "object" && body ? JSON.stringify(body).slice(0, 300) : String(body).slice(0, 300);
    throw new IntegrationError(`${label}: HTTP ${res.status} — ${detail}`);
  }
  return body as T;
}
