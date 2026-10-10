import "server-only";
import { kvGet, kvSet } from "../db";
import { fetchJson, IntegrationError } from "./http";

// Supports both Meta flows:
//  - "Instagram API with Instagram Login" (tokens starting with "IG", host graph.instagram.com):
//    no Facebook Page needed; long-lived tokens last 60 days and are refreshed automatically here.
//  - "Instagram API with Facebook Login" (tokens starting with "EAA", host graph.facebook.com).
const DAILY_METRICS = ["views", "reach", "total_interactions", "saves", "shares"] as const;
const REFRESH_AFTER_MS = 20 * 24 * 3600 * 1000;

type StoredToken = { token: string; refreshedAt: number; seed: string };

export function instagramConfigured() {
  return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN);
}

/** Current token: the one in .env, or a newer one obtained by refreshing it. */
async function accessToken(): Promise<string> {
  const seed = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!seed) throw new IntegrationError("Instagram non configurato.");
  if (!seed.startsWith("IG")) return seed; // Facebook Login tokens: managed on Meta's side

  let stored = kvGet<StoredToken>("instagram.token");
  if (!stored || stored.seed !== seed) stored = { token: seed, refreshedAt: 0, seed };
  if (Date.now() - stored.refreshedAt > REFRESH_AFTER_MS) {
    try {
      const res = await fetchJson<{ access_token: string }>(
        `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
          grant_type: "ig_refresh_token",
          access_token: stored.token,
        })}`,
        {},
        "Instagram token",
      );
      stored = { token: res.access_token, refreshedAt: Date.now(), seed };
      kvSet("instagram.token", stored);
    } catch (err) {
      // A token younger than 24h can't be refreshed yet: keep using it.
      if (stored.refreshedAt === 0) kvSet("instagram.token", { ...stored, refreshedAt: Date.now() - REFRESH_AFTER_MS + 86_400_000 });
      else throw err;
    }
  }
  return stored.token;
}

type InsightsResponse = { data: { name: string; total_value?: { value: number } }[] };

export async function fetchInstagramDay(date: string) {
  const token = await accessToken();
  const base = token.startsWith("IG") ? "https://graph.instagram.com/v23.0" : "https://graph.facebook.com/v23.0";
  // With Instagram Login "me" resolves to the account; with Facebook Login the IG user id is required.
  const id = process.env.INSTAGRAM_USER_ID || (token.startsWith("IG") ? "me" : "");
  if (!id) throw new IntegrationError("INSTAGRAM_USER_ID mancante (necessario con il login Facebook).");
  const since = Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000);
  const until = since + 86_400;

  const profile = await fetchJson<{ followers_count: number }>(
    `${base}/${id}?${new URLSearchParams({ fields: "followers_count", access_token: token })}`,
    {},
    "Instagram",
  );

  // Query metrics one by one: Meta deprecates metrics regularly and one bad name fails the whole batch.
  const values: Record<string, number> = {};
  const errors: string[] = [];
  for (const metric of DAILY_METRICS) {
    try {
      const res = await fetchJson<InsightsResponse>(
        `${base}/${id}/insights?${new URLSearchParams({
          metric,
          period: "day",
          metric_type: "total_value",
          since: String(since),
          until: String(until),
          access_token: token,
        })}`,
        {},
        `Instagram ${metric}`,
      );
      values[metric] = res.data[0]?.total_value?.value ?? 0;
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  if (errors.length === DAILY_METRICS.length) throw new IntegrationError(errors[0]);

  return {
    metrics: {
      followers: profile.followers_count,
      ...(values.views !== undefined && { views: values.views }),
      ...(values.reach !== undefined && { reach: values.reach }),
      ...(values.total_interactions !== undefined && { interactions: values.total_interactions }),
      ...(values.saves !== undefined && { saves: values.saves }),
      ...(values.shares !== undefined && { shares: values.shares }),
    },
    warnings: errors,
  };
}
