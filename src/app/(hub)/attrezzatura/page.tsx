import { requireSession } from "@/lib/auth";
import { EQUIPMENT_CATEGORIES, equipmentAlerts, listEquipment, nextService, residualValue } from "@/lib/business";
import { fmtDate, fmtEur, today } from "@/lib/format";
import { Card, Empty, PageHead, Stat } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { addEquipmentAction, equipmentOpAction } from "../actions";

export const metadata = { title: "Attrezzatura" };

export default async function AttrezzaturaPage() {
  await requireSession();
  const list = listEquipment();
  const alerts = equipmentAlerts(list);
  const t = today();
  const cost = list.reduce((a, e) => a + e.cost_cents, 0);
  const residual = list.reduce((a, e) => a + residualValue(e), 0);

  return (
    <>
      <PageHead eyebrow="Inventario" title="Attrezzatura" intro="Valore dell'attrezzatura, ammortamento, manutenzioni periodiche e garanzie in scadenza." />

      <div className="grid cols-4">
        <Stat label="Pezzi in inventario" value={list.length} />
        <Stat label="Valore d'acquisto" value={fmtEur(cost)} />
        <Stat label="Valore residuo stimato" value={fmtEur(residual)} sub="ammortamento lineare" />
        <Stat label="Da controllare" value={<span className={alerts.some((a) => a.late) ? "delta-down" : ""}>{alerts.length}</span>} sub="manutenzioni e garanzie in scadenza" />
      </div>

      {alerts.length > 0 && (
        <div className="stack mt">
          {alerts.map((a) => (
            <div key={`${a.id}-${a.kind}`} className={`upsell-banner ${a.late ? "" : "soon"}`}>
              <span aria-hidden>{a.kind === "manutenzione" ? "⚙" : "⏳"}</span>
              <span className="grow"><strong style={{ fontWeight: 600 }}>{a.name}</strong> · {a.kind === "manutenzione" ? (a.late ? `manutenzione scaduta dal ${fmtDate(a.date)}` : `manutenzione entro il ${fmtDate(a.date)}`) : `garanzia fino al ${fmtDate(a.date)}`}</span>
              {a.kind === "manutenzione" && (
                <form action={equipmentOpAction}>
                  <input type="hidden" name="id" value={a.id} /><input type="hidden" name="op" value="serviced" />
                  <SubmitButton className="btn btn-sm btn-chrome">Fatta oggi</SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid cols-3 mt" style={{ alignItems: "start" }}>
        <Card className="span-2" flush title="Inventario">
          {list.length === 0 ? (
            <Empty glyph="◎" title="Inventario vuoto">Aggiungi microfoni, outboard, monitor e strumenti dal modulo qui accanto.</Empty>
          ) : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Attrezzatura</th><th className="right">Acquisto</th><th className="right">Valore oggi</th><th>Prossima manutenzione</th><th>Garanzia</th><th></th></tr></thead>
                <tbody>
                  {list.map((e) => {
                    const ns = nextService(e);
                    return (
                      <tr key={e.id}>
                        <td><div style={{ fontWeight: 600 }}>{e.name}</div><div className="xs faint">{e.category} · dal {fmtDate(e.purchase_date)}</div></td>
                        <td className="right num muted">{fmtEur(e.cost_cents)}</td>
                        <td className="right num">{fmtEur(residualValue(e))}</td>
                        <td className="small">{ns ? <span className={ns < t ? "delta-down" : ""}>{fmtDate(ns)}</span> : <span className="faint">—</span>}</td>
                        <td className="small">{e.warranty_until ? <span className={e.warranty_until < t ? "faint" : ""}>{e.warranty_until < t ? "Scaduta" : fmtDate(e.warranty_until)}</span> : <span className="faint">—</span>}</td>
                        <td className="right" style={{ whiteSpace: "nowrap" }}>
                          {e.service_months && (
                            <form action={equipmentOpAction} style={{ display: "inline" }}>
                              <input type="hidden" name="id" value={e.id} /><input type="hidden" name="op" value="serviced" />
                              <SubmitButton className="btn btn-ghost btn-sm" title="Segna manutenzione fatta oggi">⚙</SubmitButton>
                            </form>
                          )}
                          <form action={equipmentOpAction} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={e.id} /><input type="hidden" name="op" value="delete" />
                            <ConfirmButton message={`Togliere ${e.name} dall'inventario?`}>✕</ConfirmButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Aggiungi attrezzatura">
          <ActionForm action={addEquipmentAction} className="stack">
            <label className="field"><span>Nome *</span><input className="input" name="name" required placeholder="Es. Neumann U87 Ai" /></label>
            <div className="form-grid">
              <label className="field"><span>Categoria</span><select className="input" name="category">{EQUIPMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="field"><span>Costo (€)</span><input className="input num" name="cost" inputMode="decimal" /></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Acquistato il</span><input className="input" type="date" name="purchaseDate" defaultValue={t} /></label>
              <label className="field"><span>Ammortamento (anni)</span><input className="input num" type="number" name="lifeYears" min={1} max={20} defaultValue={5} /></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Garanzia fino al</span><input className="input" type="date" name="warrantyUntil" /></label>
              <label className="field"><span>Manutenzione ogni (mesi)</span><input className="input num" type="number" name="serviceMonths" min={0} max={60} placeholder="—" /></label>
            </div>
            <label className="field"><span>Note</span><input className="input" name="notes" placeholder="Numero di serie, fornitore…" /></label>
            <SubmitButton pendingLabel="Salvo…">Aggiungi</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
