import "server-only";
import { kvGet, kvSet } from "../db";
import { fetchJson, IntegrationError } from "./http";

// TikTok Display API v2. Access tokens last 24h → refreshed automatically with the stored refresh token.
const BASE = "https://open.tiktokapis.com/v2";

type Tokens = { access: string; expiresAt: number; refresh: string };

export function tiktokAppConfigured() {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

export function tiktokRedirectUri() {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/api/tiktok/callback`;
}

export function tiktokAuthorizeUrl(state: string) {
  return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    scope: "user.info.basic,user.info.stats,video.list",
    response_type: "code",
    redirect_uri: tiktokRedirectUri(),
    state,
  })}`;
}

/** Exchanges the OAuth code from the consent screen for access + refresh tokens. */
export async function tiktokExchangeCode(code: string) {
  const res = await fetchJson<{ access_token?: string; expires_in: number; refresh_token: string; error_description?: string }>(
    `${BASE}/oauth/token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: tiktokRedirectUri(),
      }),
    },
    "TikTok OAuth",
  );
  if (!res.access_token) throw new IntegrationError(`TikTok: ${res.error_description ?? "autorizzazione non riuscita"}`);
  kvSet("tiktok.tokens", { access: res.access_token, expiresAt: Date.now() + res.expires_in * 1000, refresh: res.refresh_token });
}

export function tiktokConfigured() {
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && (kvGet<Tokens>("tiktok.tokens") || process.env.TIKTOK_REFRESH_TOKEN),
  );
}

async function accessToken(): Promise<string> {
  const stored = kvGet<Tokens>("tiktok.tokens");
  if (stored && stored.expiresAt > Date.now() + 60_000) return stored.access;
  const refresh = stored?.refresh ?? process.env.TIKTOK_REFRESH_TOKEN;
  if (!refresh || !process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) {
    throw new IntegrationError("TikTok non configurato.");
  }
  const res = await fetchJson<{ access_token: string; expires_in: number; refresh_token: string }>(
    `${BASE}/oauth/token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refresh,
      }),
    },
    "TikTok OAuth",
  );
  if (!res.access_token) throw new IntegrationError("TikTok: refresh token non valido o scaduto.");
  kvSet("tiktok.tokens", { access: res.access_token, expiresAt: Date.now() + res.expires_in * 1000, refresh: res.refresh_token });
  return res.access_token;
}

type Video = { id: string; view_count?: number; like_count?: number; comment_count?: number; share_count?: number };

/** Returns cumulative account totals; daily values are derived from the difference with the previous snapshot. */
export async function fetchTikTokTotals() {
  const token = await accessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const user = await fetchJson<{ data: { user: { follower_count: number; likes_count: number; video_count: number } } }>(
    `${BASE}/user/info/?fields=follower_count,likes_count,video_count`,
    { headers },
    "TikTok user",
  );

  let cursor: number | undefined;
  const totals = { views_total: 0, likes_total: 0, comments_total: 0, shares_total: 0 };
  for (let page = 0; page < 25; page++) {
    const res = await fetchJson<{ data: { videos: Video[]; cursor: number; has_more: boolean } }>(
      `${BASE}/video/list/?fields=id,view_count,like_count,comment_count,share_count`,
      { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: 20, cursor }) },
      "TikTok video",
    );
    for (const v of res.data.videos ?? []) {
      totals.views_total += v.view_count ?? 0;
      totals.likes_total += v.like_count ?? 0;
      totals.comments_total += v.comment_count ?? 0;
      totals.shares_total += v.share_count ?? 0;
    }
    if (!res.data.has_more) break;
    cursor = res.data.cursor;
  }
  return { followers: user.data.user.follower_count, ...totals };
}
