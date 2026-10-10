import { requireSession } from "@/lib/auth";
import { listArtists, PACKAGE_PRESETS, SERVICES, type Artist } from "@/lib/crm";
import { fmtDate, fmtEur, today } from "@/lib/format";
import { CHANNELS, paymentsByPackage, TRACK_STAGES, tracksByArtist } from "@/lib/business";
import { partners } from "@/lib/partners";
import { Card, Empty, PageHead, Ring, Stat } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PackagePresetPicker } from "@/components/PackagePresetPicker";
import { OpenDetailsButton } from "@/components/OpenDetailsButton";
import {
  addPaymentAction,
  addTrackAction,
  moveTrackAction,
  packageDueAction,
  addArtistAction,
  addPackageAction,
  archivePackageAction,
  deleteArtistAction,
  deletePackageAction,
  toggleItemAction,
} from "../actions";

export const metadata = { title: "Artisti" };

const UPSELL_COPY = {
  esaurito: { badge: "critical", label: "Pacchetto esaurito", hint: "Tutti i servizi sono stati erogati: è il momento di proporre un nuovo pacchetto." },
  "in-esaurimento": { badge: "warn", label: "In esaurimento", hint: "Mancano pochi servizi: prepara la proposta per il prossimo pacchetto." },
  attivo: { badge: "good", label: "Attivo", hint: "" },
  "nessun-pacchetto": { badge: "plain", label: "Nessun pacchetto", hint: "" },
} as const;

export default async function ArtistsPage() {
  await requireSession();
  const artists = listArtists();
  const payments = paymentsByPackage();
  const tracks = tracksByArtist();
  const t = today();
  const n = (s: Artist["upsell"]) => artists.filter((a) => a.upsell === s).length;

  return (
    <>
      <PageHead
        eyebrow="Pacchetti & upsell"
        title="Artisti"
        intro="Ogni artista con i servizi acquistati. Spunta ciò che viene completato in studio: l'hub segnala quando proporre il pacchetto successivo."
      />

      <div className="grid cols-4">
        <Stat label="Artisti" value={artists.length} />
        <Stat label="Pacchetti attivi" value={n("attivo") + n("in-esaurimento")} />
        <Stat label="Da proporre subito" value={<span className={n("esaurito") ? "delta-down" : ""}>{n("esaurito")}</span>} sub="pacchetti esauriti" />
        <Stat label="In esaurimento" value={n("in-esaurimento")} sub="≤ 25% dei servizi rimasti" />
      </div>

      <div className="grid cols-3 mt" style={{ alignItems: "start" }}>
        <div className="span-2 stack" style={{ gap: 16 }}>
          {artists.length === 0 && (
            <Card><Empty glyph="♪" title="Nessun artista ancora">Aggiungi un artista qui accanto o converti un contatto dal CRM.</Empty></Card>
          )}
          {artists.map((a) => {
            const copy = UPSELL_COPY[a.upsell];
            const active = a.packages.filter((p) => !p.archived);
            const archived = a.packages.filter((p) => p.archived);
            return (
              <section
                key={a.id}
                id={`artista-${a.id}`}
                className={`card ${a.upsell === "esaurito" ? "upsell-card" : a.upsell === "in-esaurimento" ? "upsell-card soon" : ""}`}
                style={{ scrollMarginTop: 90 }}
              >
                <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
                  <Ring value={a.done} total={a.total} size={64} />
                  <div className="grow">
                    <div className="row-wrap between">
                      <h2 className="title-l">{a.name}</h2>
                      <span className={`badge ${copy.badge}`}>{copy.label}</span>
                    </div>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {a.total ? `${a.done} di ${a.total} servizi completati · ${a.remaining} rimanenti` : "Nessun servizio attivo"}
                      {[a.email, a.phone, a.instagram].filter(Boolean).length > 0 && (
                        <span className="faint"> · {[a.email, a.phone, a.instagram].filter(Boolean).join(" · ")}</span>
                      )}
                    </div>
                    {(a.channel || a.referred_by) && (
                      <div className="row-wrap" style={{ marginTop: 6 }}>
                        {a.channel && <span className="badge plain">Da {a.channel}</span>}
                        {a.referred_by && <span className="badge plain">Seguito da {a.referred_by}</span>}
                      </div>
                    )}
                    {a.total > 0 && (
                      <div className="meter" style={{ marginTop: 10 }}><i style={{ width: `${(a.done / a.total) * 100}%` }} /></div>
                    )}
                  </div>
                </div>

                {copy.hint && (
                  <div className={`upsell-banner mt ${a.upsell === "esaurito" ? "" : "soon"}`}>
                    <span aria-hidden>{a.upsell === "esaurito" ? "●" : "◐"}</span>
                    <span className="grow">{copy.hint}</span>
                    <OpenDetailsButton target={`nuovo-pacchetto-${a.id}`}>Proponi pacchetto</OpenDetailsButton>
                  </div>
                )}

                {active.map((p) => {
                  const done = p.items.filter((i) => i.done_at).length;
                  const pays = payments.get(p.id) ?? [];
                  const paid = pays.reduce((sum, x) => sum + x.amount_cents, 0);
                  const owed = Math.max(0, p.price_cents - paid);
                  const late = owed > 0 && p.due_date !== null && p.due_date < t;
                  return (
                    <div key={p.id} className="mt">
                      <div className="row-wrap between" style={{ marginBottom: 10 }}>
                        <div>
                          <div className="title-m">{p.name}</div>
                          <div className="xs faint">
                            Acquistato il {fmtDate(p.purchased_at)}{p.price_cents ? ` · ${fmtEur(p.price_cents)}` : ""} · {done}/{p.items.length} completati
                          </div>
                        </div>
                        <div className="row" style={{ gap: 4 }}>
                          <form action={archivePackageAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="archived" value="1" />
                            <SubmitButton className="btn btn-ghost btn-sm">Archivia</SubmitButton>
                          </form>
                          <form action={deletePackageAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmButton message={`Eliminare il pacchetto “${p.name}”?`} aria-label="Elimina pacchetto">✕</ConfirmButton>
                          </form>
                        </div>
                      </div>
                      <div className="checklist">
                        {p.items.map((it) => (
                          <form key={it.id} action={toggleItemAction}>
                            <input type="hidden" name="id" value={it.id} />
                            <input type="hidden" name="done" value={it.done_at ? "0" : "1"} />
                            <button
                              type="submit"
                              className={`check ${it.done_at ? "done" : ""}`}
                              role="checkbox"
                              aria-checked={Boolean(it.done_at)}
                              title={it.done_at ? `Completato ${fmtDate(it.done_at)}${it.done_by ? ` da ${it.done_by}` : ""}` : "Segna come completato"}
                            >
                              <span className="box" aria-hidden />
                              <span className="label grow">{it.service}</span>
                            </button>
                          </form>
                        ))}
                      </div>
                      {p.price_cents > 0 && (
                        <details className="disclosure" style={{ marginTop: 10 }}>
                          <summary className="small">
                            <span className="chev">›</span>{" "}
                            {owed === 0 ? (
                              <span className="badge good">Saldato</span>
                            ) : (
                              <>
                                <span className={`badge ${late ? "critical" : "warn"}`}>{late ? "Saldo in ritardo" : "Da saldare"}</span>{" "}
                                <span className="muted">pagato {fmtEur(paid)} · mancano <strong style={{ color: "var(--text)" }}>{fmtEur(owed)}</strong>{p.due_date ? ` · entro il ${fmtDate(p.due_date)}` : ""}</span>
                              </>
                            )}
                          </summary>
                          <div className="stack mt" style={{ gap: 10 }}>
                            {pays.length > 0 && (
                              <div className="stack xs muted" style={{ gap: 4 }}>
                                {pays.map((x) => (
                                  <div key={x.id} className="row between"><span>{fmtDate(x.date)} · {x.method}</span><span className="num">+{fmtEur(x.amount_cents)}</span></div>
                                ))}
                              </div>
                            )}
                            {owed > 0 && (
                              <ActionForm action={addPaymentAction} className="row-wrap">
                                <input type="hidden" name="packageId" value={p.id} />
                                <input className="input num" name="amount" inputMode="decimal" defaultValue={(owed / 100).toFixed(2).replace(".", ",")} aria-label="Importo" style={{ width: 110 }} />
                                <select className="input" name="method" aria-label="Metodo" style={{ width: 120 }}>
                                  <option value="bonifico">Bonifico</option><option value="contanti">Contanti</option><option value="pos">POS</option>
                                </select>
                                <input className="input" type="date" name="date" defaultValue={t} aria-label="Data" style={{ width: 150 }} />
                                <SubmitButton className="btn btn-sm btn-chrome">Registra pagamento</SubmitButton>
                              </ActionForm>
                            )}
                            <form action={packageDueAction} className="row-wrap">
                              <input type="hidden" name="id" value={p.id} />
                              <span className="xs faint">Scadenza saldo</span>
                              <input className="input" type="date" name="dueDate" defaultValue={p.due_date ?? ""} aria-label="Scadenza saldo" style={{ width: 150, height: 30 }} />
                              <SubmitButton className="btn btn-ghost btn-sm">Salva</SubmitButton>
                            </form>
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}

                {(() => {
                  const list = tracks.get(a.id) ?? [];
                  return (
                    <div className="mt">
                      <div className="row between" style={{ marginBottom: 8 }}>
                        <div className="title-m">Brani</div>
                        <span className="xs faint">{list.filter((x) => x.stage === TRACK_STAGES.length - 1).length}/{list.length} consegnati</span>
                      </div>
                      <div className="stack" style={{ gap: 8 }}>
                        {list.map((tr) => (
                          <div key={tr.id} className="track-row">
                            <div style={{ minWidth: 0 }}>
                              <div className="row-wrap" style={{ gap: 8 }}>
                                <strong style={{ fontWeight: 600 }}>{tr.title}</strong>
                                <span className={`badge ${tr.stage === TRACK_STAGES.length - 1 ? "good" : "plain"}`}>{TRACK_STAGES[tr.stage]}</span>
                                {tr.mix_revisions > 0 && <span className="xs faint">{tr.mix_revisions} {tr.mix_revisions === 1 ? "revisione" : "revisioni"} mix</span>}
                                {tr.due_date && tr.stage < TRACK_STAGES.length - 1 && (
                                  <span className={`xs ${tr.due_date < t ? "delta-down" : "faint"}`}>consegna {fmtDate(tr.due_date)}</span>
                                )}
                                {tr.drive_url && <a className="xs" href={tr.drive_url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>File</a>}
                              </div>
                              <div className="stages" style={{ marginTop: 8 }} aria-hidden>
                                {TRACK_STAGES.map((st, i) => <i key={st} className={i <= tr.stage ? "on" : ""} />)}
                              </div>
                            </div>
                            <div className="row" style={{ gap: 2 }}>
                              {[["back", "‹", "Fase precedente"], ["revision", "+rev", "Aggiungi una revisione del mix"], ["next", "›", "Fase successiva"]].map(([op, label, title]) => (
                                <form key={op} action={moveTrackAction}>
                                  <input type="hidden" name="id" value={tr.id} /><input type="hidden" name="op" value={op} />
                                  <SubmitButton className="btn btn-ghost btn-sm" title={title}>{label}</SubmitButton>
                                </form>
                              ))}
                              <form action={moveTrackAction}>
                                <input type="hidden" name="id" value={tr.id} /><input type="hidden" name="op" value="delete" />
                                <ConfirmButton message={`Eliminare il brano “${tr.title}”?`} aria-label="Elimina brano">✕</ConfirmButton>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                      <details className="disclosure" style={{ marginTop: 8 }}>
                        <summary className="small muted"><span className="chev">›</span> Aggiungi brano</summary>
                        <ActionForm action={addTrackAction} className="form-grid mt">
                          <input type="hidden" name="artistId" value={a.id} />
                          <label className="field"><span>Titolo</span><input className="input" name="title" required /></label>
                          <label className="field"><span>Consegna entro</span><input className="input" type="date" name="dueDate" /></label>
                          <label className="field"><span>Link ai file (Drive)</span><input className="input" name="driveUrl" placeholder="https://drive.google.com/…" /></label>
                          <SubmitButton className="btn btn-chrome">Aggiungi</SubmitButton>
                        </ActionForm>
                      </details>
                    </div>
                  );
                })()}

                {archived.length > 0 && (
                  <details className="disclosure mt">
                    <summary className="small muted"><span className="chev">›</span> Storico pacchetti ({archived.length})</summary>
                    <div className="stack mt small">
                      {archived.map((p) => (
                        <div key={p.id} className="row between">
                          <span>{p.name} <span className="faint">· {fmtDate(p.purchased_at)} · {p.items.filter((i) => i.done_at).length}/{p.items.length}</span></span>
                          <form action={archivePackageAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="archived" value="0" />
                            <SubmitButton className="btn btn-ghost btn-sm">Ripristina</SubmitButton>
                          </form>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <details className="disclosure mt" id={`nuovo-pacchetto-${a.id}`}>
                  <summary className="small muted"><span className="chev">›</span> Assegna nuovo pacchetto</summary>
                  <ActionForm action={addPackageAction} className="stack mt">
                    <input type="hidden" name="artistId" value={a.id} />
                    <PackagePresetPicker presets={PACKAGE_PRESETS} services={[...SERVICES]} />
                    <div className="form-grid">
                      <label className="field"><span>Data acquisto</span><input className="input" type="date" name="purchasedAt" defaultValue={today()} /></label>
                      <label className="field"><span>Saldo entro</span><input className="input" type="date" name="dueDate" /></label>
                      <label className="field"><span>Acconto versato (€)</span><input className="input num" name="deposit" inputMode="decimal" placeholder="0" /></label>
                      <label className="field"><span>Metodo acconto</span>
                        <select className="input" name="depositMethod"><option value="bonifico">Bonifico</option><option value="contanti">Contanti</option><option value="pos">POS</option></select>
                      </label>
                    </div>
                    <SubmitButton pendingLabel="Assegno…">Assegna pacchetto</SubmitButton>
                  </ActionForm>
                  <form action={deleteArtistAction} className="mt" style={{ textAlign: "right" }}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmButton message={`Eliminare ${a.name} e tutti i suoi pacchetti?`}>Elimina artista</ConfirmButton>
                  </form>
                </details>
              </section>
            );
          })}
        </div>

        <Card title="Nuovo artista">
          <ActionForm action={addArtistAction} className="stack">
            <label className="field"><span>Nome / nome d&apos;arte *</span><input className="input" name="name" required /></label>
            <label className="field"><span>Email</span><input className="input" type="email" name="email" /></label>
            <div className="form-grid">
              <label className="field"><span>Telefono</span><input className="input" name="phone" /></label>
              <label className="field"><span>Instagram</span><input className="input" name="instagram" /></label>
            </div>
            <div className="form-grid">
              <label className="field"><span>Come ci ha trovati</span>
                <select className="input" name="channel" defaultValue=""><option value="">—</option>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="field"><span>Seguito da</span>
                <select className="input" name="referredBy" defaultValue=""><option value="">—</option>{partners().map((p) => <option key={p}>{p}</option>)}</select>
              </label>
            </div>
            <label className="field"><span>Note</span><textarea className="input" name="notes" /></label>
            <SubmitButton pendingLabel="Salvo…">Aggiungi artista</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
