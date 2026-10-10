# Backrooms Studio · Hub

Hub gestionale interno e riservato ai tre soci di Backrooms Studio: finanza, CRM, pacchetti artisti con trigger di upsell, report social/web giornalieri e bacheca strategica, in un'unica app.

Stack: Next.js 15 (App Router, server actions) · React 19 · SQLite integrato in Node (`node:sqlite`, nessuna dipendenza nativa) · Three.js / React Three Fiber per i grafici 3D.

## Moduli

| Sezione | Cosa fa |
|---|---|
| **Accesso** | Master password condivisa (hash scrypt), selezione del socio al login, sessione firmata HS256 in cookie `httpOnly` + `SameSite=Strict` (12 h), blocco di 15 min dopo 5 tentativi errati, `noindex` ovunque. |
| **Finanza** | Movimenti bancari via open banking PSD2 (GoCardless Bank Account Data), registrazione rapida dei contanti, import di estratti CSV come alternativa, categorie automatiche modificabili. Dashboard con grafico 3D (Entrate / Uscite / Utile per mese, e flusso di cassa cumulato), conto economico mensile con margini, ripartizione per categoria. |
| **CRM** | Pipeline contatti (nuovo → contattato → in trattativa → convertito/perso). Sincronizzazione da Google Drive (Google Sheet o CSV nella cartella indicata); se non trova file la sezione resta vuota e pronta per l'inserimento manuale. Le candidature dal sito entrano qui in automatico. Un contatto si converte in artista con un clic. |
| **Artisti** | Pacchetti di servizi per artista (preset o personalizzati), checklist da spuntare man mano che i servizi vengono erogati, anello con i servizi rimanenti. **Upsell**: "In esaurimento" quando resta ≤ 25 % (min. 1) dei servizi, "Esaurito" a 0; entrambi evidenziati in Artisti e nella Panoramica. |
| **Analytics** | Report giornaliero Instagram (visualizzazioni, account raggiunti, follower, interazioni, salvataggi, condivisioni), TikTok (visualizzazioni, follower, interazioni, condivisioni, commenti) e sito (visitatori unici, sessioni, tasso di interazione, clic da GA4, candidature). Confronto col giorno prima e trend a 30 giorni. Inserimento manuale per le sorgenti non collegate. |
| **Consigli & Insights** | Bacheca condivisa: categorie, note fissate in alto, scadenze, "fatto", autore. |

## Avvio rapido

```bash
npm install
npm run hash-password -- "la-vostra-master-password"   # stampa MASTER_PASSWORD_HASH e SESSION_SECRET
cp .env.example .env.local                              # incolla i due valori + PARTNERS
npm run seed                                            # facoltativo: dati demo fittizi
npm run dev                                             # http://localhost:3000
```

Serve Node.js ≥ 22.13 (per `node:sqlite`). Il database è in `data/hub.db` (o in `DATA_DIR`).

## Produzione

L'hub tiene i dati su SQLite, quindi va eseguito su un server con disco persistente (VPS, NAS, Docker), non su piattaforme serverless.

```bash
cp .env.example .env    # compila i valori
docker compose up -d --build
```

Mettilo dietro un reverse proxy HTTPS (es. Caddy) e imposta `APP_URL` con l'URL pubblico. Fai il backup periodico del volume `/data`.

### Sincronizzazione giornaliera

Con `INTERNAL_SCHEDULER=true` l'hub esegue da solo, ogni giorno dopo `SYNC_HOUR`: sync bancario, sync Drive, report Instagram/GA4 del giorno precedente e istantanea TikTok. In alternativa:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://hub.example.com/api/cron/daily
```

Ogni sezione ha anche un pulsante per sincronizzare subito.

## Collegare le sorgenti

**Banca (PSD2).** Crea le credenziali su GoCardless Bank Account Data, imposta `GOCARDLESS_SECRET_ID/KEY`, poi in *Integrazioni* scegli la banca e dai il consenso: il redirect torna su `/api/bank/callback`. Il consenso dura 180 giorni; le banche limitano le letture a poche al giorno, quindi i movimenti si aggiornano a ogni sync (non al secondo). Se il provider non è disponibile per il vostro account, usate l'import CSV in *Finanza*: le righe già importate vengono saltate. Il client è isolato in `src/lib/integrations/gocardless.ts` per poterlo sostituire con un altro aggregatore (es. Enable Banking, Salt Edge).

**Google Drive + GA4.** Crea un service account su Google Cloud, abilita *Drive API* e *Google Analytics Data API*, condividi con la sua email la cartella clienti (lettura) e aggiungilo come *Visualizzatore* nella proprietà GA4. Imposta `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (con `\n` letterali), `GOOGLE_DRIVE_FOLDER_ID`, `GA4_PROPERTY_ID`.

**Instagram.** Account Business/Creator collegato a una Pagina Facebook; token di lunga durata con `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`. Imposta `INSTAGRAM_USER_ID` e `INSTAGRAM_ACCESS_TOKEN`.

**TikTok.** App su TikTok for Developers con scope `user.info.stats` e `video.list`; esegui una volta il login OAuth per ottenere il refresh token e impostalo in `TIKTOK_REFRESH_TOKEN` (poi l'hub lo rinnova da solo). Le metriche giornaliere sono differenze tra istantanee consecutive, quindi partono dal secondo giorno.

**Candidature dal sito.** Dal backend del form (non dal browser, per non esporre il segreto):

```http
POST /api/webhooks/application
x-webhook-secret: <APPLICATION_WEBHOOK_SECRET>
Content-Type: application/json

{ "name": "…", "email": "…", "phone": "…", "instagram": "…", "genre": "…",
  "kind": "candidatura" | "prenotazione", "message": "…" }
```

## Logo

Il logo nell'header e nel login è `public/logo.svg`, oggi un segnaposto cromato. Sostituisci il file con quello ufficiale (stesso nome). Se è un PNG, salvalo come `public/logo.png` e cambia il percorso in `src/components/Logo.tsx`.

## Struttura

```
src/
  middleware.ts              protezione di tutte le pagine
  lib/                       dati (SQLite), finanza, CRM, metriche, sync
  lib/integrations/          GoCardless, Google (Drive + GA4), Instagram, TikTok
  app/login/                 accesso
  app/(hub)/                 pagine dell'hub + server actions
  app/api/                   cron, webhook candidature, callback banca
  components/                UI, grafico 3D, sparkline
scripts/                     hash password, dati demo
```
