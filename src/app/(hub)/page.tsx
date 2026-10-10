import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { balances, monthlySummary } from "@/lib/finance";
import { listArtists, listLeads } from "@/lib/crm";
import { listInsights } from "@/lib/insights";
import { getMetric, latestMetricDate } from "@/lib/metrics";
import { lastSync } from "@/lib/db";
import { addDays, fmtCompact, fmtDate, fmtEur, MONTHS_IT, today } from "@/lib/format";
import { Card, Delta, Empty, PageHead, Ring, Stat } from "@/components/ui";

export default async function Overview() {
  const { partner } = await requireSession();
  const now = new Date();
  const year = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const months = monthlySummary(year);
  const cur = months[m];
  const prev = m > 0 ? months[m - 1] : monthlySummary(year - 1)[11];
  const bal = balances();
  const artists = listArtists();
  const upsell = artists.filter((a) => a.upsell === "esaurito" || a.upsell === "in-esaurimento");
  const leads = listLeads();
  const newLeads = leads.filter((l) => l.status === "nuovo").length;
  const notes = listInsights().filter((n) => !n.done && (n.pinned || n.due_date)).slice(0, 4);

  const metricDay = latestMetricDate() ?? addDays(today(), -1);
  const social = [
    { label: "Follower Instagram", v: getMetric(metricDay, "instagram", "followers") },
    { label: "Follower TikTok", v: getMetric(metricDay, "tiktok", "followers") },
    { label: "Visitatori sito", v: getMetric(metricDay, "web", "users") },
    { label: "Candidature", v: getMetric(metricDay, "web", "applications") },
  ];
  const bankSync = lastSync("bank");

  const hour = now.getHours();
  const greeting = hour < 12 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera";

  return (
    <>
      <PageHead
        eyebrow={now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting}, ${partner}.`}
        intro="Lo stato dello studio in un colpo d'occhio: cassa, artisti da seguire, crescita e priorità del team."
      />

      <div className="grid cols-4">
        <Stat label={`Entrate ${MONTHS_IT[m]}`} value={fmtEur(cur.income)} sub={<Delta current={cur.income} previous={prev.income} />} />
        <Stat label={`Uscite ${MONTHS_IT[m]}`} value={fmtEur(cur.expenses)} sub={<Delta current={cur.expenses} previous={prev.expenses} invert />} />
        <Stat
          label={`Utile ${MONTHS_IT[m]}`}
          value={fmtEur(cur.profit)}
          sub={cur.margin === null ? "Nessuna entrata" : `Margine ${(cur.margin * 100).toFixed(1).replace(".", ",")}%`}
        />
        <Stat
          label="Liquidità totale"
          value={fmtEur(bal.total)}
          sub={`Banca ${fmtEur(bal.bank)} · Contanti ${fmtEur(bal.cash)}`}
        />
      </div>

      <div className="grid cols-3 mt">
        <Card
          className="span-2"
          title="Opportunità di upsell"
          actions={<Link className="btn btn-sm" href="/artisti">Tutti gli artisti</Link>}
        >
          {upsell.length === 0 ? (
            <Empty glyph="✓" title="Nessun pacchetto in esaurimento">
              Quando un artista sta per finire i servizi acquistati, comparirà qui.
            </Empty>
          ) : (
            <div className="stack">
              {upsell.slice(0, 5).map((a) => (
                <Link key={a.id} href={`/artisti#artista-${a.id}`} className={`upsell-banner ${a.upsell === "esaurito" ? "" : "soon"}`}>
                  <Ring value={a.done} total={a.total} size={40} />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    <div className="xs muted">
                      {a.upsell === "esaurito"
                        ? "Pacchetto esaurito — proponi un nuovo pacchetto"
                        : `${a.remaining} ${a.remaining === 1 ? "servizio rimasto" : "servizi rimasti"} su ${a.total}`}
                    </div>
                  </div>
                  <span className={`badge ${a.upsell === "esaurito" ? "critical" : "warn"}`}>
                    {a.upsell === "esaurito" ? "Esaurito" : "In esaurimento"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title="Pipeline" actions={<Link className="btn btn-sm" href="/crm">Apri CRM</Link>}>
          <div className="stat">
            <div className="value">{newLeads}</div>
            <div className="sub">nuovi contatti da gestire</div>
          </div>
          <div className="stack mt small">
            <div className="row between"><span className="muted">Contatti totali</span><span className="num">{leads.length}</span></div>
            <div className="row between"><span className="muted">Artisti attivi</span><span className="num">{artists.filter((a) => a.upsell !== "nessun-pacchetto").length}</span></div>
            <div className="row between"><span className="muted">Convertiti</span><span className="num">{leads.filter((l) => l.status === "convertito").length}</span></div>
          </div>
        </Card>
      </div>

      <div className="grid cols-3 mt">
        <Card title="Crescita" actions={<Link className="btn btn-sm" href="/analytics">Report</Link>}>
          <div className="xs faint" style={{ marginTop: -8, marginBottom: 12 }}>Dati del {fmtDate(metricDay)}</div>
          <div className="stack small">
            {social.map((s) => (
              <div key={s.label} className="row between">
                <span className="muted">{s.label}</span>
                <span className="num" style={{ fontWeight: 600 }}>{s.v === null ? "—" : fmtCompact(s.v)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="span-2" title="Priorità del team" actions={<Link className="btn btn-sm" href="/insights">Bacheca</Link>}>
          {notes.length === 0 ? (
            <Empty glyph="✎" title="Nessuna nota in evidenza">Fissa una nota o aggiungi una scadenza nella bacheca.</Empty>
          ) : (
            <div className="grid cols-2">
              {notes.map((n) => (
                <div key={n.id} className="card" style={{ padding: 16 }}>
                  <div className="row between">
                    <span className="badge plain">{n.category}</span>
                    {n.due_date && <span className={`xs ${n.due_date < today() ? "delta-down" : "faint"}`}>Entro {fmtDate(n.due_date)}</span>}
                  </div>
                  <div className="title-m" style={{ marginTop: 10 }}>{n.title}</div>
                  <div className="xs faint" style={{ marginTop: 4 }}>{n.author}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="xs faint mt-l">
        Ultima sincronizzazione bancaria:{" "}
        {bankSync ? `${fmtDate(bankSync.at)} — ${bankSync.ok ? bankSync.message : `errore: ${bankSync.message}`}` : "mai eseguita"}
      </p>
    </>
  );
}
