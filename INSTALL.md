# Funkly — Installation & lokale Entwicklung (Backend & Frontend)

Schrittweise Einrichtung von Backend und Frontend für die lokale Entwicklung (Schritte 0–3)
sowie das produktive Deployment nach AWS (Schritt 4). Die vollständige Referenz der
Konfigurations-/Context-Werte steht in der [README](README.md#konfiguration).

## 0. Voraussetzungen

- **Node.js 20 LTS oder neuer** (Vite 6 braucht ≥ 18, die Lambda-Runtime ist Node 22) + npm
- **Git**

```powershell
node --version   # v20.x oder höher
npm --version
```

> Jedes Paket (`backend/`, `frontend/`, `infra/`) hat sein **eigenes** `package.json` — es gibt
> kein Root-`npm install`. Backend und Frontend sind unabhängig voneinander installierbar.

---

## 1. Backend installieren

```powershell
cd backend
npm install
```

**Bauen** (bündelt zuerst die Szenarien aus `content/` nach `src/generated/`, prüft dann Typen):

```powershell
npm run build      # = build:content (YAML → generated JSON) + tsc --noEmit
```

**Verifizieren** (netzwerkfrei, kein AWS nötig):

```powershell
npm run verify        # Kernfunktionen: Content-Laden, Rubric-Aggregation, Prompt-Cache
npm run verify:auth   # Auth-Guard: 403 / 401 / 200 / OPTIONS / Env-Skip
```

> Das Backend ist eine **stateless Lambda** — es gibt keinen lokalen Server-Start. Lokal übt man
> es über den Frontend-Dev-Mock (Schritt 3) oder nach einem Deploy. Echte Bedrock-/Polly-/
> Transcribe-Aufrufe passieren nur in AWS.

---

## 2. Frontend installieren

```powershell
cd frontend
npm install
```

**Produktions-Build** (Typprüfung + Bundle nach `frontend/dist/`):

```powershell
npm run build      # tsc --noEmit && vite build
```

---

## 3. Frontend lokal starten (mit Dev-Mock, ohne AWS)

Zwei Terminals — der Mock liefert Turn-API-v2-Antworten, damit die UI ohne echtes Backend läuft.

**Terminal A — Mock-Backend (Port 8787):**

```powershell
cd frontend
npm run dev:mock
```

**Terminal B — Vite-Dev-Server:**

```powershell
cd frontend
npm run dev
```

- Vite proxied `/api` automatisch an den Mock (`http://localhost:8787`), solange `VITE_API_BASE`
  **nicht** gesetzt ist.
- Angezeigte URL (i. d. R. `http://localhost:5173`) im Browser öffnen.
- **Zugangs-Gate:** Seit Zugangsschutz V1 erscheint zuerst ein Code-Eingabefeld. Der Mock
  ignoriert den Code — **einen beliebigen Wert eintippen**, dann startet das Funkgerät.
- Mikrofon freigeben, Übung wählen, **PTT** mit gehaltener **Leertaste** oder Maus, sprechen.

---

## 4. Produktives Deployment nach AWS

Die gesamte Infrastruktur entsteht ausschließlich als CDK-Code (`infra/`, Tag `app=funkly`);
deployt wird immer per CDK, nie von Hand in der Konsole.

### 4.1 Voraussetzungen (AWS)

- **AWS-Konto** mit konfigurierten Credentials (AWS-CLI-Profil oder SSO) und Berechtigung, die
  Ressourcen anzulegen. Region über `CDK_DEFAULT_REGION` (Default `eu-west-1`).
- **Bedrock-Modellzugriff** (Anthropic-Modelle) muss im Ziel-Account/Region **einmalig in der
  Bedrock-Konsole freigeschaltet** sein. Ist ein Modell nur als regionales Inference-Profil
  verfügbar, `MODEL_ID`/`evalModelId` entsprechend setzen (Details: [README](README.md#konfiguration)).
- **Infra-Abhängigkeiten** installiert:
  ```powershell
  cd infra
  npm install
  ```
- **CDK-Bootstrap** — einmalig pro Account/Region:
  ```powershell
  npx cdk bootstrap
  ```

### 4.2 Zugangs-Secrets erzeugen

Der V1-Zugangsschutz braucht zwei Werte, die **nie ins Repo** gehören und beim Deploy per `-c`
mitgegeben werden:

- **`accessCode`** — geteilter Code, den die Nutzer:innen ins Zugangs-Gate tippen (kurz, tippbar).
- **`originSecret`** — rein maschinell (nur CloudFront ↔ Lambda), lang und zufällig.

Erzeugung (PowerShell/Node/OpenSSL) und Hintergrund: siehe
[README → Zugangsschutz-Secrets erzeugen](README.md#zugangsschutz-secrets-erzeugen-v1).

### 4.3 Deployen

```powershell
# 1. Frontend bauen — das Bundle wird via CDK-BucketDeployment in den Site-Bucket geladen
cd frontend
npm run build

# 2. Stack deployen (Context-Werte per `-c`; eigene Secrets aus 4.2 einsetzen)
cd ../infra
npx cdk deploy `
  -c accessCode=<dein-code> `
  -c originSecret=<dein-secret> `
  -c budgetNotificationEmail=you@example.com -c budgetLimitEur=15
```

Die vollständige Liste der Context-/Env-Stellschrauben (Modelle, TTS-Cache, Throttling, Budget …)
steht in der [README-Konfigurationstabelle](README.md#konfiguration).

### 4.4 Nach dem Deploy

- **Outputs:** `SiteUrl` (CloudFront) und `ApiEndpoint`. Die App läuft unter **`SiteUrl`** —
  öffnen, Mikrofon freigeben, `accessCode` eingeben, Übung wählen, PTT halten und sprechen.
- Den **`accessCode`** an die Nutzer:innen weitergeben (nicht ins Repo committen).
- **Budget-Alarm:** Damit der Kostenfilter greift, muss der Tag-Schlüssel `app` einmalig in der
  **Billing-Konsole als Cost-Allocation-Tag** aktiviert werden — das kann CDK/CloudFormation
  nicht automatisieren.
- **Direktzugriff:** Ist `originSecret` gesetzt, ist der rohe `ApiEndpoint` ein toter Zugang
  (Backend antwortet ohne CloudFront-Origin-Header mit `403`) — produktiv nur `SiteUrl` nutzen.

> **Ohne** `accessCode`/`originSecret` deployt der Stack bewusst **ohne Schutz** (nur eine
> `cdk synth`-Warnung). Für alles, was über localhost hinausgeht, beide Werte setzen.

---

## Kurzreferenz

| Aufgabe | Verzeichnis | Befehl |
|---|---|---|
| Backend installieren | `backend/` | `npm install` |
| Backend bauen | `backend/` | `npm run build` |
| Backend prüfen | `backend/` | `npm run verify` / `npm run verify:auth` |
| Frontend installieren | `frontend/` | `npm install` |
| Frontend bauen | `frontend/` | `npm run build` |
| Frontend lokal (Mock) | `frontend/` | `npm run dev:mock` **+** `npm run dev` |
