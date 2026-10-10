import { requireSession } from "@/lib/auth";
import { listArtists, PACKAGE_PRESETS, SERVICES, type Artist } from "@/lib/crm";
import { fmtDate, fmtEur, today } from "@/lib/format";
import { Card, Empty, PageHead, Ring, Stat } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PackagePresetPicker } from "@/components/PackagePresetPicker";
import { OpenDetailsButton } from "@/components/OpenDetailsButton";
import {
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
                    </div>
                  );
                })}

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
            <label className="field"><span>Note</span><textarea className="input" name="notes" /></label>
            <SubmitButton pendingLabel="Salvo…">Aggiungi artista</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
