import { requireSession } from "@/lib/auth";
import { fiscalYear, listPartnerMoves, packageMoney, partnerStats } from "@/lib/business";
import { monthlySummary } from "@/lib/finance";
import { partners } from "@/lib/partners";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtEur, today } from "@/lib/format";
import { Card, Empty, PageHead, Stat } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { addPartnerMoveAction, deletePartnerMoveAction } from "../actions";

export const metadata = { title: "Soci" };

export default async function SociPage() {
  const { partner } = await requireSession();
  const settings = getSettings();
  const year = new Date().getFullYear();
  const profit = monthlySummary(year).reduce((a, m) => a + m.profit, 0);
  const taxes = fiscalYear(settings).estimate.total;
  const prepaid = packageMoney().filter((m) => !m.archived).reduce((a, m) => a + m.prepaidOwed, 0);
  const distributable = Math.max(0, profit - taxes - prepaid);
  const moves = listPartnerMoves(year);

  const rows = partners().map((p) => {
    const share = (settings.shares[p] ?? 0) / 100;
    const withdrawn = moves.filter((m) => m.partner === p && m.kind === "prelievo").reduce((a, m) => a + m.amount_cents, 0);
    const deposited = moves.filter((m) => m.partner === p && m.kind === "versamento").reduce((a, m) => a + m.amount_cents, 0);
    const due = Math.round(distributable * share);
    return { p, share, due, withdrawn, deposited, balance: due - withdrawn + deposited, stats: partnerStats(p, year) };
  });

  return (
    <>
      <PageHead
        eyebrow={`Conto soci ${year}`}
        title="Soci"
        intro="Quanto spetta a ciascuno, quanto ha già prelevato e cosa ha portato allo studio. Le quote si cambiano in Impostazioni."
      />

      <div className="grid cols-4">
        <Stat label="Utile netto dell'anno" value={fmtEur(profit)} sub="entrate meno uscite registrate" />
        <Stat label="Tasse e contributi stimati" value={fmtEur(taxes)} sub="da accantonare (forfettario)" />
        <Stat label="Lavoro prepagato da erogare" value={fmtEur(prepaid)} sub="già incassato, non ancora guadagnato" />
        <Stat label="Utile distribuibile" value={fmtEur(distributable)} sub="al netto di tasse e prepagati" />
      </div>

      <div className="grid cols-3 mt">
        {rows.map((r) => (
          <section key={r.p} className="card">
            <div className="row" style={{ gap: 12 }}>
              <span className="avatar" style={{ width: 40, height: 40, fontSize: 16 }} aria-hidden>{r.p.slice(0, 1)}</span>
              <div className="grow">
                <h2 className="title-l">{r.p}</h2>
                <div className="xs faint">Quota {(r.share * 100).toLocaleString("it-IT", { maximumFractionDigits: 2 })}%</div>
              </div>
            </div>
            <div className="stack small mt">
              <div className="row between"><span className="muted">Spettante</span><span className="num">{fmtEur(r.due)}</span></div>
              <div className="row between"><span className="muted">Prelievi</span><span className="num">−{fmtEur(r.withdrawn)}</span></div>
              <div className="row between"><span className="muted">Versamenti</span><span className="num">+{fmtEur(r.deposited)}</span></div>
              <div className="row between" style={{ paddingTop: 8, borderTop: "1px solid var(--hairline)" }}>
                <span style={{ fontWeight: 600 }}>{r.balance >= 0 ? "Può ancora prelevare" : "Ha prelevato in più"}</span>
                <span className={`num ${r.balance < 0 ? "delta-down" : ""}`} style={{ fontWeight: 650, fontSize: 17 }}>{fmtEur(Math.abs(r.balance))}</span>
              </div>
            </div>
            <div className="grid mt" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[["Clienti portati", r.stats.clients], ["Ore in sala", Math.round(r.stats.hours)], ["Servizi erogati", r.stats.services]].map(([l, v]) => (
                <div key={l as string} style={{ textAlign: "center", padding: "10px 4px", borderRadius: 10, background: "rgba(255,255,255,.03)", boxShadow: "0 0 0 1px var(--hairline) inset" }}>
                  <div className="num" style={{ fontSize: 18, fontWeight: 650 }}>{v}</div>
                  <div className="xs faint">{l}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="grid cols-3 mt" style={{ alignItems: "start" }}>
        <Card className="span-2" flush title="Prelievi e versamenti">
          {moves.length === 0 ? (
            <Empty glyph="⇄" title="Nessun movimento dei soci quest'anno" />
          ) : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Data</th><th>Socio</th><th>Tipo</th><th>Nota</th><th className="right">Importo</th><th></th></tr></thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.id}>
                      <td className="num muted">{fmtDate(m.date)}</td>
                      <td style={{ fontWeight: 600 }}>{m.partner}</td>
                      <td><span className={`badge ${m.kind === "prelievo" ? "warn" : "info"}`}>{m.kind}</span></td>
                      <td className="small muted">{m.note || "—"}</td>
                      <td className="right num" style={{ fontWeight: 600 }}>{m.kind === "prelievo" ? "−" : "+"}{fmtEur(m.amount_cents)}</td>
                      <td className="right">
                        <form action={deletePartnerMoveAction}>
                          <input type="hidden" name="id" value={m.id} />
                          <ConfirmButton message="Eliminare questo movimento?">✕</ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Registra un movimento">
          <ActionForm action={addPartnerMoveAction} className="stack">
            <div className="segmented" style={{ width: "100%" }}>
              <label style={{ flex: 1, textAlign: "center" }}><input type="radio" name="kind" value="prelievo" defaultChecked /><span>Prelievo</span></label>
              <label style={{ flex: 1, textAlign: "center" }}><input type="radio" name="kind" value="versamento" /><span>Versamento</span></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Socio</span><select className="input" name="partner" defaultValue={partner}>{partners().map((p) => <option key={p}>{p}</option>)}</select></label>
              <label className="field"><span>Importo (€)</span><input className="input num" name="amount" inputMode="decimal" required /></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Data</span><input className="input" type="date" name="date" defaultValue={today()} /></label>
              <label className="field"><span>Nota</span><input className="input" name="note" placeholder="Es. compenso marzo" /></label>
            </div>
            <SubmitButton pendingLabel="Registro…">Registra</SubmitButton>
          </ActionForm>
          <p className="xs faint" style={{ marginBottom: 0 }}>Calcolo indicativo: le regole definitive di ripartizione vanno concordate tra i soci e con il commercialista.</p>
        </Card>
      </div>
    </>
  );
}
