# Backrooms Studio Hub — contesto per chi riprende il lavoro

Hub gestionale interno di **Backrooms Studio** (studio di registrazione) per i tre soci **Plugghe, Freya, Astral**. Interfaccia e testi in **italiano**; il codice ha nomi e commenti in inglese.

## Stato attuale (ottobre 2026)

Il codice è completo e testato. Restano: l'installazione sul PC definitivo dello studio e il collegamento dei servizi esterni con gli account dei soci.

Demo navigabile (dati inventati, password `backrooms-demo`): pubblicata come artifact sull'account claude.ai originale. Si rigenera con `python3 demo/build.py` → `demo/backrooms-hub-demo.html` (un unico file HTML, apribile anche localmente).

## Stack

- Next.js 15 (App Router, server actions), React 19, TypeScript 5
- SQLite integrato in Node (`node:sqlite`, richiede Node ≥ 22.13): `data/hub.db`, o `DATA_DIR`
- Grafico 3D: three.js via React Three Fiber (`src/components/Finance3D.tsx`)
- Nessun CSS framework: design system in `src/app/globals.css` (dark nativo, tipografia Apple, accenti cromati)
- Palette dei grafici validata per daltonismo: entrate `#3987e5`, uscite `#d95926`, utile `#9085e9`

## Comandi

```bash
npm install
npm run dev          # sviluppo
npm run build && npm start
npm run typecheck
npm run seed         # dati demo fittizi (rifiuta se il DB ha già dati; --force per forzare)
npm run hash-password -- "password"
node scripts/create-env.mjs   # genera .env.local (vedi commento nel file)
python3 demo/build.py         # rigenera la demo autonoma
```

Windows: `INSTALLA-WINDOWS.bat` (installazione), `DEMO-WINDOWS.bat` (demo locale), `scripts/windows/aggiorna.ps1`.

## Struttura

```
src/middleware.ts            protegge tutte le pagine (sessione JWT HS256 in cookie)
src/lib/
  schema.ts                  tabelle + COLUMN_MIGRATIONS (colonne aggiunte dopo, applicate all'avvio)
  db.ts                      connessione SQLite, kv store, log sincronizzazioni
  finance.ts                 movimenti, riepiloghi mensili, import CSV estratto conto
  crm.ts                     contatti, follow-up, artisti, pacchetti, servizi
  business.ts                agenda/saturazione, pagamenti/crediti/prepagati, fisco forfettario,
                             pareggio, conto soci, canali, brani, attrezzatura
  settings.ts                parametri dello studio (sale, orari, costi fissi, fisco, quote soci)
  metrics.ts                 metriche social/web giornaliere, candidature
  sync.ts                    job giornaliero (banca, Drive, Instagram, TikTok, GA4)
  integrations/              gocardless, google (Drive + GA4), instagram, tiktok
src/app/(hub)/               pagine: panoramica, agenda, finanza, incassi, crm, artisti,
                             analytics, soci, attrezzatura, insights, impostazioni
src/app/(hub)/actions.ts     tutte le server actions (ognuna richiama requireSession)
src/app/api/                 cron giornaliero, webhook candidature, callback banca e TikTok
demo/                        demo autonoma (template + modulo 3D + build.py)
docs/pagine-legali/          privacy e termini per la revisione dell'app TikTok
```

## Decisioni già prese (non rimettere in discussione senza chiedere)

- **Accesso**: password personale per socio (`PASSWORD_HASH_<NOME>` in `.env.local`, hash scrypt `scrypt:N:salt:hash`, separatore `:` perché `$` viene espanso da dotenv). `MASTER_PASSWORD_HASH` resta come fallback condiviso. Le password **non** sono mai nel repository.
- **Hosting gratuito**: PC Windows dello studio sempre acceso + **Tailscale** (accesso privato dai telefoni dei soci). Niente servizi a pagamento. SQLite → niente serverless.
- **Banca**: GoCardless Bank Account Data ha chiuso le iscrizioni (luglio 2025) ed Enable Banking gratuito esclude i conti aziendali. Soluzione adottata: **import CSV** dell'estratto conto (deduplica con id deterministico). Il client GoCardless resta per chi ha già credenziali.
- **Fisco**: regime **forfettario**, valori di esempio modificabili in Impostazioni: coefficiente 67%, imposta sostitutiva 15% (5% primi 5 anni), INPS 26,07%, soglia 85.000 € per partita IVA, 3 partite IVA. Il calcolo è indicativo, da verificare con il commercialista.
- **Pagamenti**: quelli in **contanti** creano anche il movimento in Finanza; bonifici/POS no (arrivano con l'import dell'estratto conto), per evitare doppi conteggi.
- **Agenda**: una sessione collegata a un servizio del pacchetto, quando segnata "completata", spunta il servizio.
- **Instagram**: "Instagram API with Instagram Login" (token `IG…`, rinnovo automatico, niente Pagina Facebook).
- **TikTok**: collegamento OAuth dal pulsante in Impostazioni; richiede revisione dell'app (pagine legali pronte in `docs/pagine-legali/`).
- Nessuna email personale nelle pagine pubbliche (segnaposto `EMAIL_DELLO_STUDIO`).

## Cosa resta da fare

1. **Installazione sul PC definitivo** seguendo `GUIDA-WINDOWS.md`. Il file `configurazione-hub.env` (hash password e segreti, consegnato a parte, **non** nel repo) va copiato come `C:\BackroomsHub\.env.local` prima di lanciare `INSTALLA-WINDOWS.bat`.
2. **Tailscale** (`GUIDA-WINDOWS.md` §4) e impostare `APP_URL` con l'indirizzo `https://…ts.net`.
3. **Collegamenti** seguendo `PREPARAZIONE.md`: Google (Drive + GA4), Instagram, form del sito (webhook), TikTok (facoltativo).
4. Informazioni ancora attese dai soci:
   - banca dello studio e formato dell'export (CSV o solo Excel → in quel caso aggiungere import `.xlsx`);
   - piattaforma del sito e tipo di form candidature (per collegare il webhook `POST /api/webhooks/application`);
   - se Google Analytics 4 è già installato sul sito.
5. Dopo il primo accesso: i soci cambiano le password (sono state scritte in chiaro in una chat); Freya e Astral avevano la stessa password.

## Convenzioni

- Ogni nuova funzione: logica in `src/lib`, mutazioni in `actions.ts` con `requireSession()`, UI server component; client component solo dove serve interattività.
- Nuove colonne su tabelle esistenti: aggiungerle a `COLUMN_MIGRATIONS` (non modificare i `CREATE TABLE` già distribuiti).
- Se cambi l'interfaccia, aggiorna anche la demo (`demo/demo.template.html`) e rigenera.
- Prima di consegnare: `npm run typecheck`, `npm run build`, prova le pagine toccate (Playwright è comodo).
