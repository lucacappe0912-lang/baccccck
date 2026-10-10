// Optional in-process scheduler for self-hosted deployments (server always on).
// Runs the daily sync once per day after SYNC_HOUR. Disable with INTERNAL_SCHEDULER=false
// and call /api/cron/daily from an external scheduler instead.
import { kvGet, kvSet } from "./lib/db";
import { runDaily } from "./lib/sync";
import { today } from "./lib/format";

const g = globalThis as unknown as { __hubScheduler?: NodeJS.Timeout };

if (process.env.INTERNAL_SCHEDULER !== "false" && !g.__hubScheduler) {
  const hour = Number(process.env.SYNC_HOUR ?? 6);
  const tick = async () => {
    const day = today();
    if (new Date().getHours() < hour || kvGet<string>("scheduler.lastRun") === day) return;
    kvSet("scheduler.lastRun", day);
    try {
      await runDaily();
    } catch (err) {
      console.error("[scheduler] daily sync failed", err);
    }
  };
  g.__hubScheduler = setInterval(tick, 10 * 60 * 1000);
  setTimeout(tick, 30_000);
}
