import { requireSession } from "@/lib/auth";
import { lastSync } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { bankConfigured, currentBankLink, listInstitutions } from "@/lib/integrations/gocardless";
import { googleConfigured } from "@/lib/integrations/google";
import { instagramConfigured } from "@/lib/integrations/instagram";
import { tiktokAppConfigured, tiktokConfigured, tiktokRedirectUri } from "@/lib/integrations/tiktok";
import { lastDailyRun } from "@/lib/sync";
import { Card, PageHead } from "@/components/ui";
import { ActionButton } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { connectBankAction, disconnectBankAction, runDailyAction, saveSettingsAction } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { fixedCostsTotal, getSettings, WEEKDAYS } from "@/lib/settings";
import { partners } from "@/lib/partners";
import { fmtEur } from "@/lib/format";

export const metadata = { title: "Impostazioni" };

function Status({ on, label }: { on: boolean; label?: string }) {
  return <span className={`badge ${on ? "good" : "plain"}`}>{label ?? (on ? "Configurato" : "Non configurato")}</span>;
}

function SyncLine({ job }: { job: string }) {
  const s = lastSync(job);
  if (!s) return <div className="xs faint">Mai sincronizzato</div>;
  return <div className={`xs ${s.ok ? "faint" : "delta-down"}`}>Ultimo sync {fmtDate(s.at)} — {s.message}</div>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ bank?: string; tiktok?: string; msg?: string }> }) {
  await requireSession();
  const sp = await searchParams;
  const bank = currentBankLink();
  let institutions: { id: string; name: string }[] = [];
  let instError = "";
  if (bankConfigured() && !bank.link) {
    try {
      institutions = await listInstitutions();
    } catch (err) {
      instError = (err as Error).message;
    }
  }
  const appUrl = process.env.APP_URL ?? "https://hub.backroomsstudio.it";
  const ga = googleConfigured() && Boolean(process.env.GA4_PROPERTY_ID);
  const drive = googleConfigured() && Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID);
  const daily = lastDailyRun();
  const settings = getSettings();

  return (
    <>
      <PageHead
        eyebrow="Studio & connessioni"
        title="Impostazioni"
        intro="Parametri dello studio (sale, orari, costi fissi, fisco, quote dei soci) e stato delle sorgenti dati collegate."
        actions={<ActionButton action={runDailyAction} className="btn btn-chrome">Esegui sincronizzazione completa</ActionButton>}
      />

      {sp.bank === "ok" && <div className="notice good" style={{ marginBottom: 16 }}>Conto collegato e movimenti sincronizzati.</div>}
      {sp.bank === "sync-error" && <div className="notice warn" style={{ marginBottom: 16 }}>Conto collegato, ma la prima sincronizzazione non è riuscita: riprova da Finanza.</div>}
      {sp.tiktok === "ok" && <div className="notice good" style={{ marginBottom: 16 }}>Account TikTok collegato: la prima istantanea è salvata.</div>}
      {sp.tiktok === "error" && <div className="notice critical" style={{ marginBottom: 16 }}>Collegamento TikTok non riuscito{sp.msg ? `: ${sp.msg}` : "."}</div>}
      {sp.bank === "error" && <div className="notice critical" style={{ marginBottom: 16 }}>Collegamento non riuscito: {sp.msg}</div>}

      <section id="parametri" className="card" style={{ marginBottom: 16, scrollMarginTop: 90 }}>
        <div className="card-head"><h3>Parametri dello studio</h3><span className="xs faint">Valori di esempio: adattateli ai vostri</span></div>
        <ActionForm action={saveSettingsAction} resetOnSuccess={false} className="stack">
          <div className="grid cols-3">
            <div className="stack">
              <div className="eyebrow">Sale e orari</div>
              <label className="field"><span>Sale (separate da virgola)</span><input className="input" name="rooms" defaultValue={settings.rooms.join(", ")} /></label>
              <div className="form-grid">
                <label className="field"><span>Apertura (ora)</span><input className="input num" type="number" min={0} max={23} name="openHour" defaultValue={settings.openHour} /></label>
                <label className="field"><span>Chiusura (ora)</span><input className="input num" type="number" min={1} max={24} name="closeHour" defaultValue={settings.closeHour} /></label>
              </div>
              <div className="field"><span>Giorni di apertura</span>
                <div className="segmented">
                  {WEEKDAYS.map((d, i) => (
                    <label key={d}><input type="checkbox" name={`day:${i + 1}`} defaultChecked={settings.openDays.includes(i + 1)} /><span>{d}</span></label>
                  ))}
                </div>
              </div>
            </div>
            <div className="stack">
              <div className="eyebrow">Costi fissi mensili · {fmtEur(fixedCostsTotal(settings))}</div>
              <label className="field"><span>Una voce per riga: «Voce: importo»</span>
                <textarea className="input mono" name="fixedCosts" rows={7} defaultValue={settings.fixedCosts.map((c) => `${c.label}: ${(c.cents / 100).toLocaleString("it-IT")}`).join("\n")} />
              </label>
            </div>
            <div className="stack">
              <div className="eyebrow">Fisco · regime forfettario</div>
              <div className="form-grid">
                <label className="field"><span>Coefficiente redditività %</span><input className="input num" name="coefficient" inputMode="decimal" defaultValue={String(settings.tax.coefficient * 100).replace(".", ",")} /></label>
                <label className="field"><span>Imposta sostitutiva %</span><input className="input num" name="substituteRate" inputMode="decimal" defaultValue={String(settings.tax.substituteRate * 100).replace(".", ",")} /></label>
                <label className="field"><span>Contributi INPS %</span><input className="input num" name="inpsRate" inputMode="decimal" defaultValue={String(Math.round(settings.tax.inpsRate * 10000) / 100).replace(".", ",")} /></label>
                <label className="field"><span>Soglia ricavi (€)</span><input className="input num" name="threshold" inputMode="numeric" defaultValue={settings.tax.threshold} /></label>
                <label className="field"><span>Partite IVA</span><input className="input num" type="number" min={1} max={10} name="vatNumbers" defaultValue={settings.tax.vatNumbers} /></label>
              </div>
              <div className="eyebrow" style={{ marginTop: 6 }}>Quote soci %</div>
              <div className="form-grid">
                {partners().map((p) => (
                  <label key={p} className="field"><span>{p}</span><input className="input num" name={`share:${p}`} inputMode="decimal" defaultValue={String(settings.shares[p] ?? 0).replace(".", ",")} /></label>
                ))}
              </div>
            </div>
          </div>
          <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
            <span className="xs faint">Coefficiente 67% e INPS 26,07% sono valori tipici ma dipendono dal codice ATECO e dalla gestione previdenziale: verificateli con il commercialista. Imposta al 5% per i primi 5 anni di attività.</span>
            <SubmitButton pendingLabel="Salvo…">Salva parametri</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <div className="grid cols-2">
        <Card title="Conto bancario aziendale" actions={<Status on={Boolean(bank.link)} label={bank.link ? "Collegato" : bankConfigured() ? "Da collegare" : "Non configurato"} />}>
          <p className="small muted" style={{ marginTop: -6 }}>
            Lettura dei movimenti tramite open banking PSD2 (GoCardless Bank Account Data): accesso in sola lettura, consenso rinnovabile ogni 180 giorni.
          </p>
          {bank.link ? (
            <div className="stack small">
              <div className="row between"><span className="muted">Banca</span><span>{bank.link.institutionName}</span></div>
              <div className="row between"><span className="muted">Conti collegati</span><span>{bank.accounts.length}</span></div>
              <div className="row between"><span className="muted">Consenso dal</span><span>{fmtDate(bank.link.createdAt)}</span></div>
              <SyncLine job="bank" />
              <form action={disconnectBankAction}>
                <ConfirmButton message="Scollegare il conto? I movimenti già importati restano.">Scollega conto</ConfirmButton>
              </form>
            </div>
          ) : bankConfigured() ? (
            instError ? (
              <div className="notice critical small">{instError}</div>
            ) : (
              <form action={connectBankAction} className="row-wrap">
                <select className="input grow" name="institution" required defaultValue="" style={{ minWidth: 220 }}>
                  <option value="" disabled>Seleziona la banca…</option>
                  {institutions.map((i) => <option key={i.id} value={`${i.id}|${i.name}`}>{i.name}</option>)}
                </select>
                <SubmitButton pendingLabel="Reindirizzo…">Collega</SubmitButton>
              </form>
            )
          ) : (
            <div className="small faint">Nessun provider bancario configurato: GoCardless non accetta più nuove iscrizioni. Importa l&apos;estratto conto CSV da <a href="/finanza" style={{ textDecoration: "underline" }}>Finanza</a> (i movimenti già presenti vengono saltati).</div>
          )}
        </Card>

        <Card title="Google Drive · anagrafiche clienti" actions={<Status on={drive} />}>
          <p className="small muted" style={{ marginTop: -6 }}>
            Legge i Google Sheet e i CSV nella cartella indicata (colonne tipo Nome, Email, Telefono, Instagram, Genere, Note). Se non trova file, il CRM resta pulito per l&apos;inserimento manuale.
          </p>
          <SyncLine job="drive" />
        </Card>

        <Card title="Instagram" actions={<Status on={instagramConfigured()} />}>
          <p className="small muted" style={{ marginTop: -6 }}>Graph API per account Business/Creator: visualizzazioni, account raggiunti, follower, interazioni, salvataggi, condivisioni.</p>
          <SyncLine job="instagram" />
        </Card>

        <Card title="TikTok" actions={<Status on={tiktokConfigured()} />}>
          <p className="small muted" style={{ marginTop: -6 }}>Display API v2: follower e totali dei video. I valori giornalieri sono calcolati come differenza tra due istantanee consecutive.</p>
          {tiktokAppConfigured() ? (
            <div className="stack small">
              <a className="btn btn-chrome" href="/api/tiktok/connect" style={{ alignSelf: "flex-start" }}>
                {tiktokConfigured() ? "Ricollega account TikTok" : "Collega account TikTok"}
              </a>
              <div className="xs faint">Redirect URI da registrare nell&apos;app TikTok: <code>{tiktokRedirectUri()}</code></div>
            </div>
          ) : (
            <div className="small faint">Imposta <code>TIKTOK_CLIENT_KEY</code> e <code>TIKTOK_CLIENT_SECRET</code>.</div>
          )}
          <SyncLine job="tiktok" />
        </Card>

        <Card title="Sito web · Google Analytics 4" actions={<Status on={ga} />}>
          <p className="small muted" style={{ marginTop: -6 }}>Visitatori unici, sessioni, tasso di interazione e clic (eventi click / cta_click / whatsapp_click / phone_click).</p>
          <SyncLine job="web" />
        </Card>

        <Card title="Candidature dal sito" actions={<Status on={Boolean(process.env.APPLICATION_WEBHOOK_SECRET)} label={process.env.APPLICATION_WEBHOOK_SECRET ? "Attivo" : "Segreto mancante"} />}>
          <p className="small muted" style={{ marginTop: -6 }}>Il backend del form del sito invia ogni candidatura qui. Finisce nel report giornaliero e nel CRM come nuovo contatto.</p>
          <pre className="mono xs" style={{ whiteSpace: "pre-wrap", background: "rgba(0,0,0,.35)", padding: 12, borderRadius: 10, margin: 0, overflowX: "auto" }}>
{`POST ${appUrl}/api/webhooks/application
x-webhook-secret: <APPLICATION_WEBHOOK_SECRET>
Content-Type: application/json

{ "name": "…", "email": "…", "phone": "…",
  "instagram": "…", "genre": "…",
  "kind": "candidatura" | "prenotazione",
  "message": "…" }`}
          </pre>
        </Card>
      </div>

      <Card title="Automazione giornaliera" className="mt">
        <div className="small muted stack">
          <div>
            {process.env.INTERNAL_SCHEDULER === "false"
              ? "Scheduler interno disattivato: chiama l'endpoint cron da uno scheduler esterno."
              : `Scheduler interno attivo: ogni giorno dalle ${process.env.SYNC_HOUR ?? 6}:00 sincronizza banca, Drive e report social/web del giorno precedente.`}
            {daily && <> Ultima esecuzione automatica: {fmtDate(daily)}.</>}
          </div>
          <code className="mono xs">curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; {appUrl}/api/cron/daily</code>
        </div>
      </Card>
    </>
  );
}
