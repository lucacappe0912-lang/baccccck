import { requireSession } from "@/lib/auth";
import { lastSync } from "@/lib/db";
import { getMetric, latestMetricDate, METRIC_DEFS, recentApplications, series, type Source } from "@/lib/metrics";
import { addDays, fmtDate, fmtNum, fmtPct, today } from "@/lib/format";
import { Card, Delta, Empty, PageHead } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { manualMetricsAction, runDailyAction } from "../actions";

export const metadata = { title: "Analytics" };

const SOURCES: { id: Source; name: string; blurb: string }[] = [
  { id: "instagram", name: "Instagram", blurb: "Visualizzazioni, crescita follower ed engagement" },
  { id: "tiktok", name: "TikTok", blurb: "Visualizzazioni, crescita follower ed engagement" },
  { id: "web", name: "Sito web", blurb: "Traffico unico, interazioni e candidature" },
];
const DAYS = 30;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireSession();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : (latestMetricDate() ?? addDays(today(), -1));
  const prev = addDays(date, -1);
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(date, i - DAYS + 1));
  const apps = recentApplications(12);

  return (
    <>
      <PageHead
        eyebrow="Report giornaliero"
        title="Analytics"
        intro={`Social e sito web del ${fmtDate(date)}, con il confronto sul giorno precedente e il trend degli ultimi ${DAYS} giorni.`}
        actions={
          <>
            <form className="row" style={{ gap: 8 }}>
              <input className="input" type="date" name="date" defaultValue={date} max={today()} style={{ width: 160 }} aria-label="Giorno del report" />
              <button className="btn" type="submit">Vai</button>
            </form>
            <ActionButton action={runDailyAction} className="btn btn-chrome">Aggiorna report</ActionButton>
          </>
        }
      />

      <div className="stack-l">
        {SOURCES.map((src) => {
          const sync = lastSync(src.id);
          const followers = getMetric(date, src.id, "followers");
          const followersPrev = getMetric(prev, src.id, "followers");
          return (
            <section key={src.id}>
              <div className="row-wrap between" style={{ marginBottom: 12 }}>
                <div>
                  <h2 className="title-l">{src.name}</h2>
                  <div className="small muted">{src.blurb}</div>
                </div>
                <div className="row-wrap">
                  {followers !== null && followersPrev !== null && (
                    <span className={`badge ${followers - followersPrev >= 0 ? "good" : "critical"}`}>
                      {followers - followersPrev >= 0 ? "+" : ""}{fmtNum(followers - followersPrev)} follower nel giorno
                    </span>
                  )}
                  <span className={`badge ${sync ? (sync.ok ? "plain" : "critical") : "plain"}`} title={sync?.message}>
                    {sync ? `${sync.ok ? "Sync" : "Errore"} ${fmtDate(sync.at)}` : "Mai sincronizzato"}
                  </span>
                </div>
              </div>
              <div className="grid cols-4">
                {METRIC_DEFS[src.id].map((def) => {
                  const v = getMetric(date, src.id, def.key);
                  const p = getMetric(prev, src.id, def.key);
                  return (
                    <div key={def.key} className="card stat">
                      <div className="label">{def.label}</div>
                      <div className="value">{v === null ? <span className="faint">—</span> : def.kind === "pct" ? fmtPct(v) : fmtNum(v)}</div>
                      <div className="sub">{v !== null ? <Delta current={v} previous={p} /> : "Nessun dato per questo giorno"}{v !== null && p ? <span className="faint"> vs giorno prima</span> : null}</div>
                      <Sparkline values={series(src.id, def.key, DAYS, date)} dates={dates} label={def.label} pct={def.kind === "pct"} />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div className="grid cols-3">
          <Card className="span-2" flush title="Ultime candidature dal sito">
            {apps.length === 0 ? (
              <Empty glyph="✉" title="Nessuna candidatura ricevuta">
                Il form del sito invia le richieste a <code>/api/webhooks/application</code> (vedi Integrazioni).
              </Empty>
            ) : (
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead><tr><th>Ricevuta</th><th>Nome</th><th>Tipo</th><th>Messaggio</th></tr></thead>
                  <tbody>
                    {apps.map((a) => (
                      <tr key={a.id}>
                        <td className="muted num" style={{ whiteSpace: "nowrap" }}>{fmtDate(a.received_at)}</td>
                        <td><div style={{ fontWeight: 600 }}>{a.name || "—"}</div><div className="xs faint">{a.email}</div></td>
                        <td><span className={`badge ${a.kind === "prenotazione" ? "info" : "plain"}`}>{a.kind}</span></td>
                        <td className="small muted" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.message}>{a.message || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Inserimento manuale">
            <p className="small muted" style={{ marginTop: -6 }}>Per le sorgenti non ancora collegate, o per correggere un dato.</p>
            {SOURCES.map((src) => (
              <details key={src.id} className="disclosure" style={{ marginTop: 10 }}>
                <summary className="small"><span className="chev">›</span> {src.name}</summary>
                <ActionForm action={manualMetricsAction} className="stack mt">
                  <input type="hidden" name="source" value={src.id} />
                  <label className="field"><span>Giorno</span><input className="input" type="date" name="date" defaultValue={date} max={today()} /></label>
                  <div className="form-grid">
                    {METRIC_DEFS[src.id].map((d) => (
                      <label key={d.key} className="field">
                        <span>{d.label}{d.kind === "pct" ? " (%)" : ""}</span>
                        <input className="input num" name={d.key} inputMode="decimal" />
                      </label>
                    ))}
                  </div>
                  <SubmitButton className="btn" pendingLabel="Salvo…">Salva</SubmitButton>
                </ActionForm>
              </details>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
