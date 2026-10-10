import "server-only";
import { fetchJson, IntegrationError } from "./http";

// Instagram Graph API (Business/Creator account linked to a Facebook Page).
const BASE = "https://graph.facebook.com/v23.0";
const DAILY_METRICS = ["views", "reach", "total_interactions", "saves", "shares"] as const;

export function instagramConfigured() {
  return Boolean(process.env.INSTAGRAM_USER_ID && process.env.INSTAGRAM_ACCESS_TOKEN);
}

type InsightsResponse = { data: { name: string; total_value?: { value: number } }[] };

export async function fetchInstagramDay(date: string) {
  if (!instagramConfigured()) throw new IntegrationError("Instagram non configurato.");
  const id = process.env.INSTAGRAM_USER_ID!;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN!;
  const since = Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000);
  const until = since + 86_400;

  const profile = await fetchJson<{ followers_count: number }>(
    `${BASE}/${id}?${new URLSearchParams({ fields: "followers_count", access_token: token })}`,
    {},
    "Instagram",
  );

  // Query metrics one by one: Meta deprecates metrics regularly and one bad name fails the whole batch.
  const values: Record<string, number> = {};
  const errors: string[] = [];
  for (const metric of DAILY_METRICS) {
    try {
      const res = await fetchJson<InsightsResponse>(
        `${BASE}/${id}/insights?${new URLSearchParams({
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
