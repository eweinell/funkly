# Funkly — VHF-Funksprech-Trainer (Seefunk SRC)

Sprachgesteuertes Training für Funkprotokolle: PTT drücken, Funkspruch sprechen, die simulierte
Gegenstelle (Claude) antwortet per Sprache mit Funk-Sound und bewertet die Phraseologie.

- **Konzept:** [KONZEPT.md](KONZEPT.md) · **Use Cases V1.0:** [USE-CASES.md](USE-CASES.md)
- **Stack:** React/Vite-PWA · AWS CDK · Lambda · Amazon Bedrock (Claude) · Transcribe · Polly

## Struktur

| Ordner | Inhalt |
|---|---|
| `infra/` | CDK-App (TypeScript). Alle Ressourcen tragen den Tag `app=funkly`. |
| `backend/` | Lambda-Handler: `/api/scenarios`, `/api/session`, `/api/turn`, `/api/stt-credentials` |
| `frontend/` | PWA mit Funkgeräte-UI (PTT, LCD, Funk-Audioeffekt) |

## Architektur (M1)

```
Browser (PWA) ── PTT-Clip ──▶ Amazon Transcribe Streaming (Temp-Credentials via STS)
   │                                   │ Transkript
   │  POST /api/turn ◀─────────────────┘
   ▼
CloudFront ──▶ /api/* ──▶ HTTP API ──▶ Lambda ──▶ Bedrock (Claude Haiku 4.5): Antwort + Bewertung (JSON)
        └──▶ /       ──▶ S3 (Site)              └─▶ Polly (Neural): Antwort-Audio (MP3, Base64)
```

Konversationszustand hält der Client (History wird pro Turn mitgeschickt) — die Lambda ist stateless.
Fortschrittsspeicherung (UC-23, DynamoDB-Tabelle `ProgressTable`) und TTS-Cache (UC-25, S3-Bucket
`TtsCacheBucket`) sind als Infrastruktur angelegt (`infra/lib/funkly-stack.ts`); die Backend-Anbindung
(Lesen/Schreiben aus `handler.ts`/`turn.ts`) folgt in Welle 2.

## Installation & lokale Entwicklung

Backend und Frontend installieren, bauen und lokal (mit Dev-Mock, ohne AWS) starten:
**siehe [INSTALL.md](INSTALL.md).**

Der **Deploy** (CDK) ist unten unter [Konfiguration](#konfiguration) beschrieben. Nach dem Deploy
gibt der Stack `SiteUrl` (CloudFront) und `ApiEndpoint` aus — App unter `SiteUrl` öffnen,
Mikrofon freigeben, Übung wählen, PTT (Maus oder Leertaste) halten und sprechen.

## Konfiguration

| Stellschraube | Ort | Default |
|---|---|---|
| Claude-Modell (Dialog-Turns) | Lambda-Env `MODEL_ID`; per CDK-Context `modelId` übersteuerbar | `anthropic.claude-haiku-4-5` |
| Claude-Modell (Bewertung/Prüfungsauswertung) | Lambda-Env `EVAL_MODEL_ID`; per CDK-Context `evalModelId` übersteuerbar | `anthropic.claude-sonnet-5` |
| TTS-Stimmen | `backend/src/turn.ts` (`VOICES`) | Amy (en-GB), Vicki (de-DE), neural |
| STT-Sprachen | `frontend/src/audio/transcribe.ts` | en-GB / de-DE |
| Region | Umgebungsvariable `CDK_DEFAULT_REGION` (vor `npx cdk …` setzen, z. B. `$env:CDK_DEFAULT_REGION="eu-west-1"`); ohne gesetzte Variable nimmt CDK die Default-Region aus dem AWS-Profil/SSO | eu-west-1 |
| Fortschritt-Tabelle (UC-23) | DynamoDB `ProgressTable`, Name per Lambda-Env `PROGRESS_TABLE_NAME` | on-demand, PK `userId` (Geräte-UUID), SK `itemKey` (`<ART>#<ID>#<ISO-Zeitstempel>`) |
| TTS-Cache (UC-25) | S3 `TtsCacheBucket`, Name per Lambda-Env `TTS_CACHE_BUCKET_NAME`; Ablauf per CDK-Context `ttsCacheExpirationDays` | 90 Tage |
| Budget-Alarm | CDK-Context `budgetLimitEur` (Betrag), `budgetCurrency` (**muss der Zahlungswährung des AWS-Accounts entsprechen**, sonst `CREATE_FAILED: unit not in supported set`) und `budgetNotificationEmail` (Empfänger, **nie hart codiert**) | 10 USD/Monat; ohne gesetzte E-Mail-Adresse entsteht kein Budget (nur eine `cdk synth`-Warnung) |
| Cognito-Vorbereitung (UC-27) | `infra/lib/auth-prep.ts` (Geräst, nicht instanziiert); Context-Flag `enableCognitoPrep` löst nur einen Hinweis aus, provisioniert nichts | deaktiviert |
| Zugangscode (V1-Zugangsschutz) | CDK-Context `accessCode` → Lambda-Env `ACCESS_CODE`; **nie hart codieren**, per `-c accessCode=…` beim Deploy setzen | ohne Context: unbesetzt, Prüfung entfällt (`cdk synth`-Warnung) |
| Origin-Secret (V1-Zugangsschutz) | CDK-Context `originSecret` → Lambda-Env `ORIGIN_SECRET` + CloudFront-Origin-Header `x-funkly-origin`; **nie hart codieren**, per `-c originSecret=…` beim Deploy setzen | ohne Context: unbesetzt, Prüfung entfällt (`cdk synth`-Warnung) |
| API-Throttling (Schadensdeckel) | CDK-Context `apiRateLimit`/`apiBurstLimit` (Default-Stage der HTTP API); **nie hart codieren**, per `-c apiRateLimit=… -c apiBurstLimit=…` beim Deploy übersteuerbar | 5 req/s, Burst 10 |

Hinweis Bedrock: Der Modellzugriff (Anthropic-Modelle) muss im Ziel-Account/Region einmalig in der
Bedrock-Konsole freigeschaltet sein. Falls ein Modell nur über ein regionales Inference-Profil
verfügbar ist, per CDK-Context `-c modelId=eu.anthropic.claude-haiku-4-5` bzw.
`-c evalModelId=eu.anthropic.claude-sonnet-5` setzen — die bestehende Bedrock-IAM-Policy deckt
Inference-Profile mit beliebigem Namenspräfix bereits ab.

### Zugangsschutz-Secrets erzeugen (V1)

Der V1-Zugangsschutz braucht zwei Werte, die **nie im Code oder in `cdk.context.json` eingecheckt**
werden, sondern beim Deploy per `-c` mitgegeben werden:

- **`originSecret`** — rein maschinell (nur CloudFront und die Lambda kennen ihn). Lang und
  zufällig wählen, muss sich niemand merken.
- **`accessCode`** — wird an die Testerinnen/Familie weitergegeben, die ihn einmal ins
  Zugangs-Gate eintippen. Kurz und tippbar halten; regelmäßig neu setzen und der Runde mitteilen.

Beide erzeugen (Windows PowerShell 5.1, ohne Zusatztools):

```powershell
# originSecret: 32 kryptografisch zufällige Bytes als Hex
$b = New-Object 'byte[]' 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
-join ($b | ForEach-Object { $_.ToString('x2') })

# accessCode: 8 tippbare Zeichen (Sonderzeichen entfernt)
$b = New-Object 'byte[]' 12
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
([Convert]::ToBase64String($b) -replace '[^A-Za-z0-9]','').Substring(0,8)
```

Alternativ plattformunabhängig, falls Node/OpenSSL zur Hand ist:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # originSecret
node -e "console.log(require('crypto').randomBytes(6).toString('base64url'))" # accessCode
# oder:  openssl rand -hex 32   bzw.   openssl rand -base64 9
```

Die Werte gehören **nicht** ins Repo — außerhalb des Deploy-Befehls z. B. im Passwortmanager
ablegen. Ohne die beiden `-c`-Werte deployt der Stack bewusst ohne Schutz (nur eine
`cdk synth`-Warnung, siehe Konfigurationstabelle); für alles, was über localhost hinaus
erreichbar ist, beide setzen.

### Deploy

Der vollständige Ablauf (AWS-Voraussetzungen, Bootstrap, Frontend-Build, `cdk deploy` mit den
Context-Werten, Schritte nach dem Deploy) steht in **[INSTALL.md § 4 — Produktives Deployment
nach AWS](INSTALL.md#4-produktives-deployment-nach-aws)**. Diese Tabelle oben ist die Referenz
für die einzelnen Stellschrauben.
