# Preparazione prima dell'installazione ufficiale

Tutto quello che si può fare **prima** di avere il computer definitivo. Alla fine avrete un elenco di valori da incollare in `.env.local` sul PC finale: l'installazione vera diventa una questione di 15 minuti.

> **Dove salvare i valori raccolti:** in un gestore di password condiviso tra i soci (Bitwarden è gratis) o in una nota protetta. **Mai** in chat, email o in un file su Drive non protetto: sono chiavi d'accesso ai vostri account.

Ordine consigliato e tempo stimato:

| # | Cosa | Tempo | Difficoltà |
|---|---|---|---|
| 1 | Decisioni di base | 5 min | — |
| 2 | Tailscale (accesso da telefono) | 10 min | Facile |
| 3 | Google Drive (CRM) + Google Analytics (sito) | 30 min | Media |
| 4 | Instagram | 20 min | Media |
| 5 | Banca: formato dell'estratto conto | 10 min | Facile |
| 6 | Sito web: form candidature | dipende dal sito | — |
| 7 | TikTok (facoltativo, il più lungo) | 1 ora + attesa revisione | Alta |

---

## 1 · Decisioni di base

- [ ] **Nomi dei tre soci**, come compariranno al login (es. `Luca,Marco,Andrea`).
- [ ] **Master password** condivisa: almeno 12 caratteri, meglio una frase (es. tre parole + numeri). Salvatela nel gestore di password. Verrà digitata solo durante l'installazione.
- [ ] **Computer finale**: Windows, deve restare acceso con l'alimentazione collegata.
- [ ] **Accesso a GitHub** dal PC finale: chi installa deve poter accedere all'account `lucacappe0912-lang` (o essere aggiunto come collaboratore del repository: *Settings → Collaborators*).

## 2 · Tailscale — accesso dai telefoni

Si può preparare tutto adesso, tranne l'ultimo comando che va lanciato sul PC finale.

1. [ ] Create un account gratuito su <https://login.tailscale.com/start> (accesso con Google o Microsoft).
2. [ ] Console Tailscale → **Users → Invite users**: invitate gli altri due soci.
3. [ ] Ogni socio installa l'app **Tailscale** sul telefono (App Store / Play Store) e accede.
4. [ ] Console → **DNS**: verificate che *MagicDNS* sia attivo e attivate **HTTPS Certificates**.

Sul PC finale, dopo l'installazione, basterà: installare Tailscale, fare login e lanciare `tailscale serve --bg 3000` (vedi `GUIDA-WINDOWS.md`).

**Da salvare:** niente (l'indirizzo dell'hub nascerà sul PC finale).

## 3 · Google: Drive (anagrafiche clienti) + Analytics (sito)

Un unico "account di servizio" Google legge sia la cartella clienti sia le statistiche del sito. Gratis, non serve inserire carte.

### 3a · Cartella clienti su Drive

1. [ ] Su Google Drive create una cartella, es. **"Backrooms – CRM"**.
2. [ ] Dentro, un Foglio Google (o CSV) con la prima riga di intestazioni. L'hub riconosce queste colonne (le altre vengono ignorate):

   | Nome | Email | Telefono | Instagram | Genere | Note |
   |---|---|---|---|---|---|

   Vanno bene anche varianti come "Nome e cognome", "Cellulare", "E-mail". Se avete già fogli clienti, spostateli nella cartella.
3. [ ] Aprite la cartella e copiate l'ID dall'indirizzo: `drive.google.com/drive/folders/`**`QUESTO_È_L_ID`**

**Da salvare:** `GOOGLE_DRIVE_FOLDER_ID`

### 3b · Account di servizio Google Cloud

1. [ ] Andate su <https://console.cloud.google.com> con l'account Google dello studio → in alto **Seleziona progetto → Nuovo progetto** → nome `backrooms-hub` → Crea. (Se chiede la fatturazione, ignoratela: queste API sono gratuite.)
2. [ ] Menu → **API e servizi → Libreria**: cercate e **abilitate** entrambe:
   - *Google Drive API*
   - *Google Analytics Data API*
3. [ ] Menu → **IAM e amministrazione → Account di servizio → Crea account di servizio** → nome `hub-reader` → Crea e continua → (nessun ruolo) → Fine.
4. [ ] Aprite `hub-reader` → scheda **Chiavi → Aggiungi chiave → Crea nuova chiave → JSON**. Si scarica un file `.json`: custoditelo, è la chiave d'accesso.
   - Se compare un errore tipo *"creazione di chiavi disattivata dal criterio dell'organizzazione"* (succede con Google Workspace), scrivetemi: si sblocca dalla console amministratore.
5. [ ] Dal file JSON copiate due valori:
   - `client_email` (tipo `hub-reader@backrooms-hub.iam.gserviceaccount.com`)
   - `private_key` (inizia con `-----BEGIN PRIVATE KEY-----`): copiatelo **così com'è**, con i `\n` dentro.
6. [ ] Su Drive: tasto destro sulla cartella CRM → **Condividi** → incollate il `client_email` → ruolo **Visualizzatore** → togliete la spunta "Invia notifica" → Condividi.

**Da salvare:** `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

### 3c · Google Analytics del sito

1. [ ] Il sito ha già **Google Analytics 4**? Verificate su <https://analytics.google.com>.
   - Se **no**: create una proprietà GA4 e installate il tag sul sito (dipende dalla piattaforma: vedi punto 6, vi aiuto io).
2. [ ] Analytics → **Amministrazione** (ingranaggio) → **Gestione accessi alla proprietà** → **+** → aggiungete il `client_email` del punto 3b con ruolo **Visualizzatore**.
3. [ ] **Amministrazione → Dettagli proprietà**: copiate l'**ID proprietà** (solo numeri, es. `412345678`).
4. [ ] (Consigliato) **Amministrazione → Stream di dati → web → Misurazione avanzata**: attiva, così vengono contati i clic in uscita.

**Da salvare:** `GA4_PROPERTY_ID`

## 4 · Instagram

Si usa il "login Instagram" di Meta: **non serve una Pagina Facebook** e, trattandosi del vostro account, **non serve la revisione dell'app**.

1. [ ] L'account Instagram dello studio deve essere **professionale**: app Instagram → Impostazioni → *Tipo di account e strumenti* → *Passa a un account professionale* (Creator o Business, gratis). Se lo è già, saltate.
2. [ ] Andate su <https://developers.facebook.com> → accedete con Facebook → registratevi come sviluppatori (gratis, chiede conferma via telefono/email).
3. [ ] **Le mie app → Crea app** → caso d'uso **"Gestisci messaggi e contenuti su Instagram"** (Instagram API) → tipo *Business* → nome `Backrooms Hub` → Crea.
4. [ ] Nell'app: **Instagram → Configurazione API con login Instagram** → sezione *Genera token d'accesso* → **Aggiungi account** → accedete con l'account Instagram dello studio e accettate i permessi (devono includere gli insight: `instagram_business_basic`, `instagram_business_manage_insights`).
5. [ ] Premete **Genera token** e copiatelo: inizia con **`IG`**. L'hub lo rinnoverà da solo prima che scada (60 giorni).

**Da salvare:** `INSTAGRAM_ACCESS_TOKEN`

## 5 · Banca

**Situazione:** il collegamento automatico gratuito al conto non è più disponibile. GoCardless, il servizio previsto, [non accetta nuove iscrizioni da luglio 2025](https://bankaccountdata.gocardless.com/new-signups-disabled). L'alternativa gratuita, Enable Banking, [nei suoi termini esclude i conti aziendali](https://enablebanking.com/terms) in modalità gratuita. Gli aggregatori bancari professionali sono a pagamento.

**Soluzione a costo zero, già pronta nell'hub:** una volta a settimana (o al mese) si scarica l'estratto conto dall'home banking e lo si carica in *Finanza → Importa estratto conto (CSV)*. I movimenti già importati vengono saltati, quindi si può ricaricare un periodo che si sovrappone senza doppioni. I contanti si inseriscono a mano come previsto.

1. [ ] Dite qual è la **banca** dello studio.
2. [ ] Dall'home banking provate a esportare i movimenti: verificate se c'è il formato **CSV** (a volte si chiama "Esporta in Excel/CSV").
   - Se c'è solo **Excel (.xlsx)**: ditemelo e aggiungo l'import diretto da Excel.
3. [ ] Mandatemi **solo la riga delle intestazioni** del file (es. `Data contabile;Data valuta;Importo;Descrizione`), senza movimenti reali: verifico che l'hub legga le colonne giuste.

**Da salvare:** niente.

## 6 · Sito web: form candidature

L'hub può ricevere automaticamente ogni candidatura o prenotazione inviata dal sito (finisce nel report e nel CRM). Per prepararlo mi servono:

- [ ] **Con cosa è fatto il sito?** (WordPress, Wix, Squarespace, Webflow, codice su misura…)
- [ ] **Com'è fatto il form oggi?** (plugin tipo Contact Form 7 / WPForms, form nativo di Wix, Typeform, Google Form…)
- [ ] Chi ha l'accesso di amministratore al sito.

Il collegamento si attiva dopo l'installazione, perché richiede l'indirizzo pubblico del PC finale (*Tailscale Funnel*, gratis, che espone **solo** l'indirizzo che riceve le candidature).

Nel frattempo, se le candidature vi arrivano già su un Foglio Google (es. da Google Form), mettetelo nella cartella CRM del punto 3a: l'hub le importerà già così.

## 7 · TikTok (facoltativo)

È il collegamento più laborioso: TikTok richiede la **revisione dell'app** (qualche giorno) e un indirizzo web con privacy policy. Finché non è attivo, le metriche TikTok si possono inserire a mano in *Analytics → Inserimento manuale* (un minuto al giorno, dati presi dall'app TikTok → Strumenti per creator → Analisi).

Se volete farlo:
1. [ ] Account TikTok dello studio: **Business** o **Creator**.
2. [ ] <https://developers.tiktok.com> → accedete → **Manage apps → Connect an app**.
3. [ ] Aggiungete i prodotti **Login Kit** e **Display API**; scope: `user.info.basic`, `user.info.stats`, `video.list`.
4. [ ] Servono: icona (usate il logo), descrizione, **URL privacy policy** e **termini** (posso scriverveli io come pagine pubbliche).
5. [ ] Redirect URI: si inserisce dopo l'installazione (sarà `https://<indirizzo-tailscale>/api/tiktok/callback`), poi si invia l'app in revisione.
6. [ ] Ad app approvata: in *Integrazioni* dell'hub → **Collega account TikTok**.

**Da salvare:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`

---

## Riepilogo valori da avere pronti il giorno dell'installazione

| Valore | Da dove | Obbligatorio |
|---|---|---|
| Nomi dei soci | punto 1 | sì |
| Master password | punto 1 (la digitate voi nell'installer) | sì |
| `GOOGLE_DRIVE_FOLDER_ID` | 3a | per il CRM da Drive |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 3b | per Drive + Analytics |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | 3b | per Drive + Analytics |
| `GA4_PROPERTY_ID` | 3c | per le metriche del sito |
| `INSTAGRAM_ACCESS_TOKEN` | 4 | per Instagram |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | 7 | facoltativo |

Tutto ciò che manca si può aggiungere anche dopo: si scrive in `C:\BackroomsHub\.env.local` e si riavvia l'hub. Le sezioni non configurate restano semplicemente disattivate.

Il giorno dell'installazione: seguite `GUIDA-WINDOWS.md` dal punto 1, poi incollate i valori qui sopra in `.env.local`.
