import Link from "next/link";
import { requireSession } from "@/lib/auth";
import {
  availableYears,
  balances,
  categoryBreakdown,
  CATEGORIES_IN,
  CATEGORIES_OUT,
  listTransactions,
  monthlySummary,
} from "@/lib/finance";
import { lastSync } from "@/lib/db";
import { bankConfigured, currentBankLink } from "@/lib/integrations/gocardless";
import { fmtDate, fmtEur, fmtPct, MONTHS_IT, today } from "@/lib/format";
import { breakEven, channelRevenue, fiscalYear } from "@/lib/business";
import { getSettings } from "@/lib/settings";
import { Card, Empty, PageHead, Stat } from "@/components/ui";
import { Finance3DLazy } from "@/components/Finance3DLazy";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { addCashAction, deleteTransactionAction, importCsvAction, syncBankAction, updateCategoryAction } from "../actions";

export const metadata = { title: "Finanza" };

const SOURCE_LABEL: Record<string, string> = { bank: "Banca", cash: "Contanti", import: "Estratto CSV" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string; source?: string }> }) {
  await requireSession();
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const month = Math.min(12, Math.max(1, Number(sp.month) || (year === now.getFullYear() ? now.getMonth() + 1 : 12)));
  const source = ["bank", "cash", "import"].includes(sp.source ?? "") ? sp.source : undefined;

  const months = monthlySummary(year);
  const totals = months.reduce(
    (a, r) => ({ income: a.income + r.income, expenses: a.expenses + r.expenses, profit: a.profit + r.profit }),
    { income: 0, expenses: 0, profit: 0 },
  );
  const txs = listTransactions({ year, month, source });
  const cats = categoryBreakdown(year, month);
  const bal = balances();
  const bank = currentBankLink();
  const bankSync = lastSync("bank");
  const settings = getSettings();
  const fisc = fiscalYear(settings);
  const be = breakEven(settings);
  const channels = channelRevenue();
  const maxChannel = Math.max(1, ...channels.map((c) => c.paid));
  const q = (p: Record<string, string | number | undefined>) => {
    const s = new URLSearchParams();
    const merged = { year, month, source, ...p };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") s.set(k, String(v));
    return `/finanza?${s}`;
  };

  return (
    <>
      <PageHead
        eyebrow="Controllo di gestione"
        title="Finanza"
        intro="Conto aziendale e contanti in un unico registro: profitti, perdite, margini e flusso di cassa mese per mese."
        actions={
          <>
            <div className="segmented">
              {availableYears().map((y) => (
                <Link key={y} href={q({ year: y, month: undefined })} aria-current={y === year}>{y}</Link>
              ))}
            </div>
            {bank.accounts.length > 0 ? (
              <ActionButton action={syncBankAction} className="btn btn-chrome">Sincronizza banca</ActionButton>
            ) : (
              <Link className="btn btn-chrome" href="/impostazioni">Collega la banca</Link>
            )}
          </>
        }
      />

      <div className="grid cols-4">
        <Stat label={`Entrate ${year}`} value={fmtEur(totals.income)} />
        <Stat label={`Uscite ${year}`} value={fmtEur(totals.expenses)} />
        <Stat label={`Utile netto ${year}`} value={fmtEur(totals.profit)} sub={totals.income ? `Margine ${fmtPct(totals.profit / totals.income)}` : undefined} />
        <Stat label="Saldo registrato" value={fmtEur(bal.total)} sub={`Banca ${fmtEur(bal.bank)} · Contanti ${fmtEur(bal.cash)}`} />
      </div>

      <Card title={`Andamento mensile ${year}`} className="mt">
        <Finance3DLazy data={months} />
      </Card>

      <div className="grid cols-3 mt" style={{ alignItems: "start" }}>
        <Card title={`Tasse ${fisc.year} · regime forfettario`} actions={<a className="btn btn-sm btn-ghost" href="/impostazioni#parametri">Parametri</a>}>
          <div className="stat"><div className="label">Da accantonare finora</div><div className="value">{fmtEur(fisc.estimate.total)}</div>
            <div className="sub">Ogni 100 € incassati mettete da parte circa <strong style={{ color: "var(--text)" }}>{fisc.estimate.per100.toFixed(0)} €</strong></div></div>
          <div className="stack small mt">
            <div className="row between"><span className="muted">Ricavi incassati</span><span className="num">{fmtEur(fisc.revenue)}</span></div>
            <div className="row between"><span className="muted">Reddito ({Math.round(settings.tax.coefficient * 100)}% dei ricavi)</span><span className="num">{fmtEur(fisc.estimate.taxableIncome)}</span></div>
            <div className="row between"><span className="muted">Contributi INPS ({(settings.tax.inpsRate * 100).toFixed(2).replace(".", ",")}%)</span><span className="num">{fmtEur(fisc.estimate.contributions)}</span></div>
            <div className="row between"><span className="muted">Imposta sostitutiva ({Math.round(settings.tax.substituteRate * 100)}%)</span><span className="num">{fmtEur(fisc.estimate.tax)}</span></div>
          </div>
          <div className="mt">
            <div className="row between small"><span className="muted">Soglia {settings.tax.threshold.toLocaleString("it-IT")} € per partita IVA</span><span className="num">{fmtPct(fisc.perVat / fisc.thresholdCents)}</span></div>
            <div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, (fisc.perVat / fisc.thresholdCents) * 100)}%`, background: fisc.perVat / fisc.thresholdCents > 0.85 ? "var(--critical)" : undefined }} /></div>
            <div className="xs faint" style={{ marginTop: 6 }}>{fmtEur(fisc.perVat)} a testa su {settings.tax.vatNumbers} partite IVA. Stima indicativa: verificatela con il commercialista.</div>
          </div>
        </Card>

        <Card title={`Punto di pareggio · ${MONTHS_IT[new Date().getMonth()]}`}>
          <div className="stat"><div className="label">{be.missing > 0 ? "Mancano per coprire i costi fissi" : "Costi fissi coperti"}</div>
            <div className="value">{be.missing > 0 ? fmtEur(be.missing) : "✓"}</div>
            <div className="sub">{be.missing > 0 ? `≈ ${be.sessionsNeeded} sessioni da ${fmtEur(be.avgSession)} (media ultimi 6 mesi)` : `Oltre il pareggio di ${fmtEur(be.income - be.fixed)}`}</div></div>
          <div className="meter mt"><i style={{ width: `${Math.min(100, be.rate * 100)}%` }} /></div>
          <div className="row between small" style={{ marginTop: 6 }}><span className="muted">Incassato {fmtEur(be.income)}</span><span className="muted">Costi fissi {fmtEur(be.fixed)}</span></div>
          <div className="stack xs faint mt">
            {settings.fixedCosts.map((c) => <div key={c.label} className="row between"><span>{c.label}</span><span className="num">{fmtEur(c.cents)}</span></div>)}
          </div>
        </Card>

        <Card title="Fatturato per canale di acquisizione">
          {channels.length === 0 ? (
            <div className="small faint">Indica il canale di provenienza degli artisti per vedere da dove arrivano i soldi.</div>
          ) : (
            <div className="stack small">
              {channels.map((c) => (
                <div key={c.channel}>
                  <div className="row between"><span>{c.channel} <span className="faint xs">· {c.clients} {c.clients === 1 ? "cliente" : "clienti"}</span></span><span className="num">{fmtEur(c.paid)}</span></div>
                  <div className="meter" style={{ marginTop: 6 }}><i style={{ width: `${(c.paid / maxChannel) * 100}%`, background: "var(--series-income)" }} /></div>
                  <div className="xs faint" style={{ marginTop: 3 }}>Valore medio per cliente {fmtEur(c.avg)}{c.leads ? ` · ${c.leads} contatti in CRM` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid cols-3 mt">
        <Card title="Movimento in contanti">
          <ActionForm action={addCashAction} className="stack">
            <div className="segmented" style={{ width: "100%" }}>
              <label style={{ flex: 1, textAlign: "center" }}><input type="radio" name="direction" value="in" defaultChecked /><span>Entrata</span></label>
              <label style={{ flex: 1, textAlign: "center" }}><input type="radio" name="direction" value="out" /><span>Uscita</span></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Importo (€)</span><input className="input num" name="amount" inputMode="decimal" placeholder="150,00" required /></label>
              <label className="field"><span>Data</span><input className="input" type="date" name="date" defaultValue={today()} required /></label>
            </div>
            <label className="field"><span>Descrizione</span><input className="input" name="description" placeholder="Sessione 3h — nome artista" required /></label>
            <label className="field">
              <span>Categoria</span>
              <select className="input" name="category" defaultValue="Sessioni">
                <optgroup label="Entrate">{CATEGORIES_IN.map((c) => <option key={`in-${c}`} value={c}>{c}</option>)}</optgroup>
                <optgroup label="Uscite">{CATEGORIES_OUT.filter((c) => c !== "Altro").map((c) => <option key={`out-${c}`} value={c}>{c}</option>)}</optgroup>
              </select>
            </label>
            <SubmitButton pendingLabel="Registro…">Registra movimento</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Conto economico mensile" className="span-2" flush>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="table">
              <thead>
                <tr><th>Mese</th><th className="right">Entrate</th><th className="right">Uscite</th><th className="right">Utile</th><th className="right">Margine</th></tr>
              </thead>
              <tbody>
                {months.map((r) => (
                  <tr key={r.month} style={r.month === month ? { background: "rgba(255,255,255,.04)" } : undefined}>
                    <td><Link href={q({ month: r.month })} style={{ fontWeight: r.month === month ? 600 : 400 }}>{MONTHS_IT[r.month - 1]}</Link></td>
                    <td className="right num">{r.income ? fmtEur(r.income) : "—"}</td>
                    <td className="right num">{r.expenses ? fmtEur(r.expenses) : "—"}</td>
                    <td className={`right num ${r.profit < 0 ? "delta-down" : ""}`}>{r.income || r.expenses ? fmtEur(r.profit) : "—"}</td>
                    <td className="right num muted">{r.margin === null ? "—" : fmtPct(r.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid cols-3 mt">
        <Card
          className="span-2"
          flush
          title={`Movimenti · ${MONTHS_IT[month - 1]} ${year}`}
          actions={
            <div className="segmented">
              <Link href={q({ source: undefined })} aria-current={!source}>Tutti</Link>
              <Link href={q({ source: "bank" })} aria-current={source === "bank"}>Banca</Link>
              <Link href={q({ source: "cash" })} aria-current={source === "cash"}>Contanti</Link>
              <Link href={q({ source: "import" })} aria-current={source === "import"}>CSV</Link>
            </div>
          }
        >
          {txs.length === 0 ? (
            <Empty glyph="€" title="Nessun movimento in questo mese" />
          ) : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th className="right">Importo</th><th></th></tr></thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id}>
                      <td className="num muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                      <td>
                        <div style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.description}>
                          {t.counterparty ? <strong style={{ fontWeight: 600 }}>{t.counterparty} · </strong> : null}
                          {t.description || "—"}
                        </div>
                        <div className="xs faint">{SOURCE_LABEL[t.source]}{t.created_by ? ` · ${t.created_by}` : ""}</div>
                      </td>
                      <td>
                        <form action={updateCategoryAction} className="row" style={{ gap: 6 }}>
                          <input type="hidden" name="id" value={t.id} />
                          <select className="input" name="category" defaultValue={t.category} style={{ height: 30, fontSize: 12.5, minWidth: 130 }}>
                            {[...new Set([...(t.amount_cents > 0 ? CATEGORIES_IN : CATEGORIES_OUT), t.category])].map((c) => <option key={c}>{c}</option>)}
                          </select>
                          <SubmitButton className="btn btn-ghost btn-sm" aria-label="Salva categoria">✓</SubmitButton>
                        </form>
                      </td>
                      <td className={`right num ${t.amount_cents > 0 ? "amount-in" : "amount-out"}`} style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {t.amount_cents > 0 ? "+" : "−"}{fmtEur(Math.abs(t.amount_cents))}
                      </td>
                      <td className="right">
                        {t.source !== "bank" && (
                          <form action={deleteTransactionAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <ConfirmButton message="Eliminare questo movimento?" aria-label="Elimina">✕</ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="stack" style={{ gap: 16 }}>
          <Card title={`Per categoria · ${MONTHS_IT[month - 1]}`}>
            {cats.length === 0 ? (
              <div className="small faint">Nessun dato.</div>
            ) : (
              <div className="stack small">
                {cats.map((c) => {
                  const max = Math.max(...cats.map((x) => Math.abs(x.total)));
                  return (
                    <div key={c.category}>
                      <div className="row between">
                        <span>{c.category} <span className="faint xs">({c.n})</span></span>
                        <span className={`num ${c.total < 0 ? "" : "amount-in"}`}>{fmtEur(c.total)}</span>
                      </div>
                      <div className="meter" style={{ marginTop: 6 }}>
                        <i style={{ width: `${(Math.abs(c.total) / max) * 100}%`, background: c.total < 0 ? "var(--series-expense)" : "var(--series-income)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Conto bancario">
            <div className="small stack">
              {bank.link ? (
                <>
                  <div className="row between"><span className="muted">Banca</span><span>{bank.link.institutionName}</span></div>
                  <div className="row between"><span className="muted">Conti</span><span>{bank.accounts.length}</span></div>
                </>
              ) : (
                <div className="muted">{bankConfigured() ? "Nessun conto collegato." : "Integrazione bancaria non configurata."}</div>
              )}
              {bankSync && (
                <div className={`xs ${bankSync.ok ? "faint" : "delta-down"}`}>
                  Ultimo sync {fmtDate(bankSync.at)}: {bankSync.message}
                </div>
              )}
            </div>
            <details className="disclosure mt">
              <summary className="small muted"><span className="chev">›</span> Importa estratto conto (CSV)</summary>
              <ActionForm action={importCsvAction} className="stack mt">
                <input className="input" type="file" name="file" accept=".csv,text/csv" style={{ paddingTop: 7 }} required />
                <div className="xs faint">Colonne riconosciute: Data, Importo (oppure Entrate/Uscite, Dare/Avere), Descrizione/Causale. Le righe già importate vengono saltate.</div>
                <SubmitButton className="btn" pendingLabel="Importo…">Importa</SubmitButton>
              </ActionForm>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
