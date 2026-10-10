import "server-only";
import { importPKCS8, SignJWT } from "jose";
import { kvGet, kvSet } from "../db";
import { fetchJson, IntegrationError } from "./http";

// Service-account auth (JWT bearer flow) without pulling the whole googleapis SDK.
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/analytics.readonly"];

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export async function googleToken(): Promise<string> {
  const cached = kvGet<{ access: string; expiresAt: number }>("google.token");
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.access;
  if (!googleConfigured()) throw new IntegrationError("Service account Google non configurato.");
  const pem = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPES.join(" ") })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetchJson<{ access_token: string; expires_in: number }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    },
    "Google OAuth",
  );
  kvSet("google.token", { access: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 });
  return res.access_token;
}

// ─── Drive ──────────────────────────────────────────────────────────────────

type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string };

/** Finds client spreadsheets/CSVs in the configured folder and returns their CSV contents. */
export async function fetchDriveClientSheets(): Promise<{ file: DriveFile; csv: string }[]> {
  const folder = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folder) throw new IntegrationError("GOOGLE_DRIVE_FOLDER_ID non configurato.");
  const access = await googleToken();
  const headers = { Authorization: `Bearer ${access}` };
  const q = [
    `'${folder.replace(/'/g, "")}' in parents`,
    "trashed = false",
    "(mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'text/csv')",
  ].join(" and ");
  const list = await fetchJson<{ files: DriveFile[] }>(
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
      q,
      fields: "files(id,name,mimeType,modifiedTime)",
      pageSize: "50",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    })}`,
    { headers },
    "Google Drive",
  );
  const out: { file: DriveFile; csv: string }[] = [];
  for (const file of list.files ?? []) {
    const url =
      file.mimeType === "text/csv"
        ? `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`
        : `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`;
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (res.ok) out.push({ file, csv: await res.text() });
  }
  return out;
}

// ─── GA4 ────────────────────────────────────────────────────────────────────

type ReportRow = { metricValues: { value: string }[] };

export async function fetchGa4Day(date: string) {
  const property = process.env.GA4_PROPERTY_ID;
  if (!property) throw new IntegrationError("GA4_PROPERTY_ID non configurato.");
  const access = await googleToken();
  const run = (body: object) =>
    fetchJson<{ rows?: ReportRow[] }>(
      `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dateRanges: [{ startDate: date, endDate: date }], ...body }),
      },
      "Google Analytics",
    );
  const totals = await run({ metrics: [{ name: "totalUsers" }, { name: "sessions" }, { name: "engagementRate" }] });
  // "click" = outbound clicks (enhanced measurement); add custom CTA events to the list if the site sends them.
  const clicks = await run({
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: { fieldName: "eventName", inListFilter: { values: ["click", "cta_click", "whatsapp_click", "phone_click"] } },
    },
  });
  const v = totals.rows?.[0]?.metricValues ?? [];
  return {
    users: Number(v[0]?.value ?? 0),
    sessions: Number(v[1]?.value ?? 0),
    engagement_rate: Number(v[2]?.value ?? 0),
    clicks: Number(clicks.rows?.[0]?.metricValues[0]?.value ?? 0),
  };
}
