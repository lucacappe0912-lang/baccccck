# Installare l'hub su Windows (costo zero)

Servono: il PC dello studio che resta acceso, circa 20 minuti, una connessione internet e i valori raccolti seguendo **[PREPARAZIONE.md](PREPARAZIONE.md)**.

## 1 · Scaricare il progetto

1. Apri **Start**, scrivi `PowerShell`, aprilo.
2. Installa Git (una sola volta):
   ```powershell
   winget install --id Git.Git -e
   ```
   Chiudi e riapri PowerShell.
3. Scarica l'hub nella cartella `C:\BackroomsHub`:
   ```powershell
   git clone https://github.com/lucacappe0912-lang/baccccck.git C:\BackroomsHub
   ```
   Se il repository è privato si apre il browser per il login GitHub: accedi e conferma.

## 2 · Installare

1. Apri la cartella `C:\BackroomsHub` in Esplora file.
2. Doppio clic su **`INSTALLA-WINDOWS.bat`**.
   - Se Windows mostra "PC protetto da Windows", clic su *Ulteriori informazioni* → *Esegui comunque*.
   - Se manca Node.js lo installa da solo: in quel caso **rilancia** `INSTALLA-WINDOWS.bat` quando te lo dice.
3. Ti chiede i nomi dei tre soci e la **master password** (min. 12 caratteri, non scriverla da nessuna parte condivisa).
4. Alla fine si apre il browser su `http://localhost:3000`: accedi.

L'hub ora parte da solo a ogni accensione del PC (finestra "Backrooms Hub" ridotta a icona: **non chiuderla**).

## 2b · Inserire le chiavi dei servizi

1. Apri `C:\BackroomsHub\.env.local` con Blocco note (tasto destro → Apri con → Blocco note).
2. Compila le righe con i valori raccolti in PREPARAZIONE.md, ad esempio:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=hub-reader@backrooms-hub.iam.gserviceaccount.com
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
   GOOGLE_DRIVE_FOLDER_ID=1AbC...
   GA4_PROPERTY_ID=412345678
   INSTAGRAM_ACCESS_TOKEN=IGAA...
   ```
   La chiave privata va **tra virgolette** e su una sola riga, come appare nel file JSON.
3. Salva, chiudi la finestra "Backrooms Hub" e riaprila (o riavvia il PC).
4. Nell'hub apri **Integrazioni** → *Esegui sincronizzazione completa*: ogni sorgente mostra "Configurato" e l'esito dell'ultimo sync.

## 3 · Tenere il PC sempre acceso

*Impostazioni → Sistema → Alimentazione → Schermo e sospensione* → "Sospendi il dispositivo dopo": **Mai** (con alimentazione collegata). Lo schermo può spegnersi.

Se Windows si riavvia per gli aggiornamenti, l'hub riparte appena un utente accede: conviene attivare l'accesso automatico o ricordarsi di fare login.

## 4 · Accesso dai telefoni e dai PC dei soci (Tailscale, gratis)

L'hub non è esposto su internet: lo vedono solo i dispositivi dei soci, tramite una rete privata cifrata.

1. Crea un account gratuito su <https://tailscale.com> (piano Personal: gratis fino a 3 utenti).
2. Installa Tailscale **sul PC dello studio** (`winget install tailscale.tailscale`) e accedi.
3. Installa l'app Tailscale **sui telefoni/PC dei tre soci** e accedi (invita gli altri due soci dalla console Tailscale → *Users → Invite*).
4. Sul PC dello studio, in PowerShell:
   ```powershell
   tailscale serve --bg 3000
   ```
   Se chiede di abilitare i certificati HTTPS, apri il link e conferma. Il comando stampa l'indirizzo dell'hub, tipo `https://pc-studio.tail1234.ts.net`.
5. Apri `C:\BackroomsHub\.env.local` con Blocco note e imposta quell'indirizzo:
   ```
   APP_URL=https://pc-studio.tail1234.ts.net
   ```
   Salva, poi chiudi e riapri la finestra "Backrooms Hub" (o riavvia il PC).

Da ora ogni socio apre quell'indirizzo dal telefono (con Tailscale attivo) e accede con la master password. Su iPhone: *Condividi → Aggiungi alla schermata Home* per averla come app.

## 5 · Backup

Tutti i dati sono nel file `C:\BackroomsHub\data\hub.db`. Una volta a settimana copialo in una cartella di Google Drive (o su una chiavetta). `aggiorna.ps1` fa comunque una copia automatica prima di ogni aggiornamento.

## Aggiornare l'hub

Tasto destro su `scripts\windows\aggiorna.ps1` → *Esegui con PowerShell*, poi chiudi e riapri la finestra "Backrooms Hub".

## Prossimi passi

Collegare, una alla volta: Google Drive + Analytics, Instagram, TikTok, il form del sito, la banca. Ogni collegamento si fa scrivendo le chiavi in `.env.local` e riavviando l'hub.
