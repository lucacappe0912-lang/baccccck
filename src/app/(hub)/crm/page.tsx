import { requireSession } from "@/lib/auth";
import { followUps, LEAD_STATUSES, listLeads, STALE_DAYS } from "@/lib/crm";
import { CHANNELS } from "@/lib/business";
import { partners } from "@/lib/partners";
import { lastSync } from "@/lib/db";
import { googleConfigured } from "@/lib/integrations/google";
import { fmtDate, today } from "@/lib/format";
import { Card, Empty, PageHead, Stat } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  addLeadAction,
  contactedAction,
  convertLeadAction,
  deleteLeadAction,
  followUpAction,
  leadChannelAction,
  setLeadStatusAction,
  syncDriveAction,
} from "../actions";

export const metadata = { title: "CRM" };

const STATUS_BADGE: Record<string, string> = {
  nuovo: "info",
  contattato: "plain",
  "in trattativa": "warn",
  convertito: "good",
  perso: "critical",
};
const SOURCE_LABEL: Record<string, string> = { drive: "Google Drive", manuale: "Manuale", sito: "Sito web" };

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireSession();
  const { status } = await searchParams;
  const all = listLeads();
  const leads = status ? all.filter((l) => l.status === status) : all;
  const driveSync = lastSync("drive");
  const driveReady = googleConfigured() && Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID);
  const count = (s: string) => all.filter((l) => l.status === s).length;
  const todo = followUps(all);
  const t = today();

  return (
    <>
      <PageHead
        eyebrow="Clienti potenziali"
        title="CRM"
        intro="Anagrafiche sincronizzate dal Google Drive aziendale e dalle candidature del sito, più gli inserimenti manuali."
        actions={driveReady ? <ActionButton action={syncDriveAction} className="btn btn-chrome">Sincronizza Drive</ActionButton> : null}
      />

      <div className="grid cols-4">
        <Stat label="Nuovi" value={count("nuovo")} sub="da contattare" />
        <Stat label="Da ricontattare" value={<span className={todo.length ? "delta-down" : ""}>{todo.length}</span>} sub={`azioni scadute o fermi da più di ${STALE_DAYS} giorni`} />
        <Stat label="Convertiti" value={count("convertito")} sub={all.length ? `${Math.round((count("convertito") / all.length) * 100)}% del totale` : undefined} />
        <Stat
          label="Google Drive"
          value={<span style={{ fontSize: 18 }}>{driveReady ? (driveSync?.ok ? "Sincronizzato" : driveSync ? "Errore" : "In attesa") : "Non collegato"}</span>}
          sub={driveSync ? `${fmtDate(driveSync.at)} · ${driveSync.message}` : driveReady ? "Prima sincronizzazione al prossimo ciclo" : "Configura il service account in Integrazioni"}
        />
      </div>

      {todo.length > 0 && (
        <Card className="mt" title="Da ricontattare oggi">
          <div className="stack">
            {todo.slice(0, 6).map(({ lead, due, stale, daysSince }) => (
              <div key={lead.id} className={`upsell-banner ${due ? "" : "soon"}`}>
                <span aria-hidden>{due ? "●" : "◐"}</span>
                <span className="grow">
                  <strong style={{ fontWeight: 600 }}>{lead.name}</strong>
                  {due && lead.next_action ? ` · ${lead.next_action}` : ""}
                  <span className="xs muted"> · {due ? `previsto ${fmtDate(lead.next_action_date!)}` : ""}{due && stale ? " · " : ""}{stale ? `nessun contatto da ${daysSince} giorni` : ""}</span>
                </span>
                <form action={contactedAction}>
                  <input type="hidden" name="id" value={lead.id} />
                  <SubmitButton className="btn btn-sm btn-chrome">✓ Contattato oggi</SubmitButton>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid cols-3 mt">
        <Card
          className="span-2"
          flush
          title="Contatti"
          actions={
            <div className="segmented">
              <a href="/crm" aria-current={!status}>Tutti</a>
              {LEAD_STATUSES.map((s) => (
                <a key={s} href={`/crm?status=${encodeURIComponent(s)}`} aria-current={status === s} style={{ textTransform: "capitalize" }}>{s}</a>
              ))}
            </div>
          }
        >
          {leads.length === 0 ? (
            <Empty glyph="☺" title={all.length ? "Nessun contatto in questo stato" : "La pipeline è vuota"}>
              {all.length ? null : "Nessun file clienti trovato su Drive: aggiungi i contatti a mano qui accanto."}
            </Empty>
          ) : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Contatto</th><th>Recapiti</th><th>Provenienza</th><th>Follow-up</th><th>Stato</th><th></th></tr></thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{l.name}</div>
                        <div className="xs faint">{[l.genre, fmtDate(l.created_at)].filter(Boolean).join(" · ")}</div>
                        {l.notes && <div className="xs muted" style={{ maxWidth: 280, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.notes}>{l.notes}</div>}
                      </td>
                      <td className="small">
                        {l.email && <div><a href={`mailto:${l.email}`}>{l.email}</a></div>}
                        {l.phone && <div className="muted"><a href={`tel:${l.phone.replace(/\s/g, "")}`}>{l.phone}</a></div>}
                        {l.instagram && (
                          <div className="muted">
                            <a href={`https://instagram.com/${l.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}`} target="_blank" rel="noreferrer">
                              @{l.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "")}
                            </a>
                          </div>
                        )}
                      </td>
                      <td className="small">
                        <details className="disclosure">
                          <summary>
                            <div>{l.channel || <span className="faint">Canale?</span>}</div>
                            <div className="xs faint">{SOURCE_LABEL[l.source] ?? l.source}{l.referred_by ? ` · portato da ${l.referred_by}` : ""}</div>
                          </summary>
                          <form action={leadChannelAction} className="stack" style={{ gap: 6, marginTop: 6, minWidth: 150 }}>
                            <input type="hidden" name="id" value={l.id} />
                            <select className="input" name="channel" defaultValue={l.channel} aria-label="Canale" style={{ height: 30, fontSize: 12.5 }}>
                              <option value="">Canale…</option>
                              {CHANNELS.map((c) => <option key={c}>{c}</option>)}
                            </select>
                            <select className="input" name="referredBy" defaultValue={l.referred_by} aria-label="Portato da" style={{ height: 30, fontSize: 12.5 }}>
                              <option value="">Portato da…</option>
                              {partners().map((p) => <option key={p}>{p}</option>)}
                            </select>
                            <SubmitButton className="btn btn-sm">Salva</SubmitButton>
                          </form>
                        </details>
                      </td>
                      <td className="small" style={{ minWidth: 170 }}>
                        <details className="disclosure">
                          <summary>
                            {l.next_action ? (
                              <div>
                                <div>{l.next_action}</div>
                                {l.next_action_date && <div className={`xs ${l.next_action_date <= t ? "delta-down" : "faint"}`}>{fmtDate(l.next_action_date)}</div>}
                              </div>
                            ) : (
                              <span className="faint">+ Prossima azione</span>
                            )}
                            <div className="xs faint">{l.last_contact ? `Sentito il ${fmtDate(l.last_contact)}` : "Mai contattato"}</div>
                          </summary>
                          <form action={followUpAction} className="stack" style={{ gap: 6, marginTop: 6 }}>
                            <input type="hidden" name="id" value={l.id} />
                            <input className="input" name="nextAction" defaultValue={l.next_action} placeholder="Es. mandare listino" style={{ height: 30, fontSize: 12.5 }} aria-label="Prossima azione" />
                            <input className="input" type="date" name="nextActionDate" defaultValue={l.next_action_date ?? ""} style={{ height: 30, fontSize: 12.5 }} aria-label="Data" />
                            <SubmitButton className="btn btn-sm">Salva</SubmitButton>
                          </form>
                        </details>
                        {l.status !== "convertito" && l.status !== "perso" && (
                          <form action={contactedAction} style={{ marginTop: 4 }}>
                            <input type="hidden" name="id" value={l.id} />
                            <SubmitButton className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>✓ Contattato oggi</SubmitButton>
                          </form>
                        )}
                      </td>
                      <td>
                        <form action={setLeadStatusAction} className="row" style={{ gap: 6 }}>
                          <input type="hidden" name="id" value={l.id} />
                          <span className={`badge ${STATUS_BADGE[l.status] ?? "plain"}`} style={{ textTransform: "capitalize" }}>{l.status}</span>
                          <select className="input" name="status" defaultValue={l.status} aria-label="Cambia stato" style={{ height: 28, width: 120, fontSize: 12.5 }}>
                            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <SubmitButton className="btn btn-ghost btn-sm" aria-label="Aggiorna stato">✓</SubmitButton>
                        </form>
                      </td>
                      <td className="right" style={{ whiteSpace: "nowrap" }}>
                        {l.status !== "convertito" && (
                          <form action={convertLeadAction} style={{ display: "inline" }}>
                            <input type="hidden" name="id" value={l.id} />
                            <SubmitButton className="btn btn-sm">→ Artista</SubmitButton>
                          </form>
                        )}
                        <form action={deleteLeadAction} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={l.id} />
                          <ConfirmButton message={`Eliminare ${l.name} dal CRM?`} aria-label="Elimina">✕</ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Nuovo contatto">
          <ActionForm action={addLeadAction} className="stack">
            <label className="field"><span>Nome / nome d&apos;arte *</span><input className="input" name="name" required /></label>
            <label className="field"><span>Email</span><input className="input" type="email" name="email" /></label>
            <div className="form-grid">
              <label className="field"><span>Telefono</span><input className="input" name="phone" inputMode="tel" /></label>
              <label className="field"><span>Instagram</span><input className="input" name="instagram" placeholder="@artista" /></label>
            </div>
            <label className="field"><span>Genere</span><input className="input" name="genre" placeholder="Rap, R&B, Pop…" /></label>
            <div className="form-grid">
              <label className="field"><span>Come ci ha trovati</span>
                <select className="input" name="channel" defaultValue=""><option value="">—</option>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="field"><span>Portato da</span>
                <select className="input" name="referredBy" defaultValue=""><option value="">—</option>{partners().map((p) => <option key={p}>{p}</option>)}</select>
              </label>
            </div>
            <label className="field"><span>Note</span><textarea className="input" name="notes" placeholder="Cosa cerca, budget, tempistiche…" /></label>
            <SubmitButton pendingLabel="Salvo…">Aggiungi alla pipeline</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
