import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { balances, monthlySummary } from "@/lib/finance";
import { followUps, listArtists, listLeads } from "@/lib/crm";
import { breakEven, equipmentAlerts, fiscalYear, listSessions, packageMoney, upcomingDeliveries } from "@/lib/business";
import { getSettings } from "@/lib/settings";
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
  const settings = getSettings();
  const t = today();
  const todaySessions = listSessions(t, t).filter((x) => x.status !== "annullata");
  const money = packageMoney(artists);
  const receivable = money.reduce((a, x) => a + x.outstanding, 0);
  const lateCount = money.filter((x) => x.daysLate > 0).length;
  const fisc = fiscalYear(settings);
  const be = breakEven(settings);
  const todo = [
    ...followUps(leads).slice(0, 4).map((f) => ({ key: `l${f.lead.id}`, href: "/crm", tone: f.due ? "critical" : "warn", label: "Ricontattare", text: `${f.lead.name}${f.due && f.lead.next_action ? ` · ${f.lead.next_action}` : f.stale ? ` · fermo da ${f.daysSince} giorni` : ""}` })),
    ...upcomingDeliveries(10).slice(0, 4).map((d) => ({ key: `t${d.id}`, href: `/artisti#artista-${d.artist_id}`, tone: d.due_date! < t ? "critical" : "warn", label: "Consegna", text: `${d.title} · ${d.artist_name} · ${fmtDate(d.due_date!)}` })),
    ...money.filter((x) => x.daysLate > 0).slice(0, 3).map((x) => ({ key: `p${x.packageId}`, href: "/incassi", tone: "critical", label: "Sollecito", text: `${x.artistName} · ${fmtEur(x.outstanding)} da ${x.daysLate} giorni` })),
    ...equipmentAlerts().slice(0, 3).map((e) => ({ key: `e${e.id}${e.kind}`, href: "/attrezzatura", tone: e.late ? "critical" : "warn", label: e.kind === "manutenzione" ? "Manutenzione" : "Garanzia", text: `${e.name} · ${fmtDate(e.date)}` })),
  ];

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

      <div className="grid cols-4 mt">
        <Stat label="Oggi in sala" value={todaySessions.length} sub={todaySessions.length ? todaySessions.slice(0, 2).map((x) => `${x.start_time} ${x.artist_name ?? x.title}`).join(" · ") : "Nessuna sessione prenotata"}>
          <Link className="xs" href="/agenda" style={{ display: "inline-block", marginTop: 8, textDecoration: "underline", color: "var(--text-2)" }}>Apri agenda</Link>
        </Stat>
        <Stat label="Crediti da incassare" value={fmtEur(receivable)} sub={lateCount ? <span className="delta-down">{lateCount} {lateCount === 1 ? "pagamento" : "pagamenti"} in ritardo</span> : "Nessun ritardo"} />
        <Stat label="Da accantonare per tasse" value={fmtEur(fisc.estimate.total)} sub={`≈ ${fisc.estimate.per100.toFixed(0)} € ogni 100 € incassati`} />
        <Stat label={`Pareggio di ${MONTHS_IT[m]}`} value={be.missing > 0 ? fmtEur(be.missing) : "Raggiunto"} sub={be.missing > 0 ? `mancano ≈ ${be.sessionsNeeded} sessioni` : `costi fissi ${fmtEur(be.fixed)} coperti`}>
          <div className="meter" style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, be.rate * 100)}%` }} /></div>
        </Stat>
      </div>

      {todo.length > 0 && (
        <Card className="mt" title="Da fare">
          <div className="grid cols-2" style={{ gap: 8 }}>
            {todo.map((x) => (
              <Link key={x.key} href={x.href} className={`upsell-banner ${x.tone === "critical" ? "" : "soon"}`}>
                <span className={`badge ${x.tone}`}>{x.label}</span>
                <span className="grow small" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.text}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

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
