import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { packageMoney, recentPayments } from "@/lib/business";
import { fmtDate, fmtEur, today } from "@/lib/format";
import { Card, Empty, PageHead, Stat } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deletePaymentAction } from "../actions";

export const metadata = { title: "Incassi" };

const METHOD: Record<string, string> = { bonifico: "Bonifico", contanti: "Contanti", pos: "POS / carta" };

export default async function IncassiPage() {
  await requireSession();
  const money = packageMoney();
  const t = today();
  const receivables = money.filter((m) => m.outstanding > 0).sort((a, b) => b.daysLate - a.daysLate || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const outstanding = receivables.reduce((a, m) => a + m.outstanding, 0);
  const late = receivables.filter((m) => m.daysLate > 0);
  const prepaid = money.filter((m) => m.prepaidOwed > 0 && !m.archived).sort((a, b) => b.prepaidOwed - a.prepaidOwed);
  const prepaidTotal = prepaid.reduce((a, m) => a + m.prepaidOwed, 0);
  const payments = recentPayments(15);
  const monthPaid = payments.filter((p) => p.date.slice(0, 7) === t.slice(0, 7)).reduce((a, p) => a + p.amount_cents, 0);

  return (
    <>
      <PageHead
        eyebrow="Acconti, saldi e crediti"
        title="Incassi"
        intro="Cosa vi devono gli artisti e cosa avete già incassato ma dovete ancora erogare. I pagamenti si registrano dalla scheda di ogni pacchetto in Artisti."
        actions={<Link className="btn btn-chrome" href="/artisti">Registra un pagamento</Link>}
      />

      <div className="grid cols-4">
        <Stat label="Crediti da incassare" value={fmtEur(outstanding)} sub={`${receivables.length} ${receivables.length === 1 ? "pacchetto" : "pacchetti"} con saldo aperto`} />
        <Stat label="In ritardo" value={<span className={late.length ? "delta-down" : ""}>{fmtEur(late.reduce((a, m) => a + m.outstanding, 0))}</span>} sub={late.length ? `${late.length} ${late.length === 1 ? "pacchetto" : "pacchetti"} oltre la scadenza` : "Nessun ritardo"} />
        <Stat label="Servizi prepagati da erogare" value={fmtEur(prepaidTotal)} sub="già incassati, lavoro ancora da fare" />
        <Stat label="Incassato da pacchetti questo mese" value={fmtEur(monthPaid)} />
      </div>

      <div className="grid cols-3 mt" style={{ alignItems: "start" }}>
        <Card className="span-2" flush title="Chi deve ancora pagare">
          {receivables.length === 0 ? (
            <Empty glyph="✓" title="Nessun credito aperto">Tutti i pacchetti sono saldati.</Empty>
          ) : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Artista · pacchetto</th><th className="right">Prezzo</th><th className="right">Pagato</th><th className="right">Da incassare</th><th>Scadenza</th></tr></thead>
                <tbody>
                  {receivables.map((m) => (
                    <tr key={m.packageId}>
                      <td>
                        <Link href={`/artisti#artista-${m.artistId}`} style={{ fontWeight: 600 }}>{m.artistName}</Link>
                        <div className="xs faint">{m.packageName}</div>
                        <div className="meter" style={{ marginTop: 6, maxWidth: 220 }}><i style={{ width: `${m.price ? (m.paid / m.price) * 100 : 0}%` }} /></div>
                      </td>
                      <td className="right num">{fmtEur(m.price)}</td>
                      <td className="right num muted">{fmtEur(m.paid)}</td>
                      <td className="right num" style={{ fontWeight: 600 }}>{fmtEur(m.outstanding)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {m.dueDate ? (
                          m.daysLate > 0 ? <span className="badge critical">{m.daysLate} gg di ritardo</span> : <span className="small muted">{fmtDate(m.dueDate)}</span>
                        ) : (
                          <span className="xs faint">Non fissata</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Lavoro già pagato da erogare">
          <p className="small muted" style={{ marginTop: -6 }}>Soldi in cassa che corrispondono a servizi non ancora fatti: non vanno considerati utile disponibile.</p>
          {prepaid.length === 0 ? (
            <div className="small faint">Nessun servizio prepagato in sospeso.</div>
          ) : (
            <div className="stack small">
              {prepaid.map((m) => (
                <div key={m.packageId}>
                  <div className="row between"><span><strong style={{ fontWeight: 600 }}>{m.artistName}</strong> <span className="faint xs">· {m.done}/{m.total} erogati</span></span><span className="num">{fmtEur(m.prepaidOwed)}</span></div>
                  <div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${(m.prepaidOwed / prepaidTotal) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt" flush title="Ultimi pagamenti registrati">
        {payments.length === 0 ? (
          <Empty glyph="€" title="Nessun pagamento registrato" />
        ) : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="table">
              <thead><tr><th>Data</th><th>Artista · pacchetto</th><th>Metodo</th><th className="right">Importo</th><th></th></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="num muted">{fmtDate(p.date)}</td>
                    <td><div style={{ fontWeight: 600 }}>{p.artist_name}</div><div className="xs faint">{p.package_name}{p.created_by ? ` · registrato da ${p.created_by}` : ""}</div></td>
                    <td className="small">{METHOD[p.method] ?? p.method}</td>
                    <td className="right num amount-in" style={{ fontWeight: 600 }}>+{fmtEur(p.amount_cents)}</td>
                    <td className="right">
                      <form action={deletePaymentAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmButton message="Eliminare questo pagamento? Se era in contanti viene tolto anche dai movimenti.">✕</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
