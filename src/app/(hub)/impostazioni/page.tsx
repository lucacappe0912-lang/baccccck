import { requireSession } from "@/lib/auth";
import { lastSync } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { bankConfigured, currentBankLink, listInstitutions } from "@/lib/integrations/gocardless";
import { googleConfigured } from "@/lib/integrations/google";
import { instagramConfigured } from "@/lib/integrations/instagram";
import { tiktokConfigured } from "@/lib/integrations/tiktok";
import { lastDailyRun } from "@/lib/sync";
import { Card, PageHead } from "@/components/ui";
import { ActionButton } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { connectBankAction, disconnectBankAction, runDailyAction } from "../actions";

export const metadata = { title: "Integrazioni" };

function Status({ on, label }: { on: boolean; label?: string }) {
  return <span className={`badge ${on ? "good" : "plain"}`}>{label ?? (on ? "Configurato" : "Non configurato")}</span>;
}

function SyncLine({ job }: { job: string }) {
  const s = lastSync(job);
  if (!s) return <div className="xs faint">Mai sincronizzato</div>;
  return <div className={`xs ${s.ok ? "faint" : "delta-down"}`}>Ultimo sync {fmtDate(s.at)} — {s.message}</div>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ bank?: string; msg?: string }> }) {
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

  return (
    <>
      <PageHead
        eyebrow="Connessioni"
        title="Integrazioni"
        intro="Stato delle sorgenti dati collegate all'hub. Le credenziali si impostano nelle variabili d'ambiente del server (vedi README)."
        actions={<ActionButton action={runDailyAction} className="btn btn-chrome">Esegui sincronizzazione completa</ActionButton>}
      />

      {sp.bank === "ok" && <div className="notice good" style={{ marginBottom: 16 }}>Conto collegato e movimenti sincronizzati.</div>}
      {sp.bank === "sync-error" && <div className="notice warn" style={{ marginBottom: 16 }}>Conto collegato, ma la prima sincronizzazione non è riuscita: riprova da Finanza.</div>}
      {sp.bank === "error" && <div className="notice critical" style={{ marginBottom: 16 }}>Collegamento non riuscito: {sp.msg}</div>}

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
            <div className="small faint">Imposta <code>GOCARDLESS_SECRET_ID</code> e <code>GOCARDLESS_SECRET_KEY</code>. In alternativa puoi importare l&apos;estratto conto CSV da Finanza.</div>
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
