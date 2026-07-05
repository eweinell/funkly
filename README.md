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
Fortschrittsspeicherung (UC-23, DynamoDB) folgt.

## Build & Deploy

```powershell
# 1. Abhängigkeiten
cd backend;  npm install
cd ../frontend; npm install
cd ../infra;    npm install

# 2. Frontend bauen (landet via CDK-BucketDeployment im Site-Bucket)
cd ../frontend; npm run build

# 3. Deploy (einmalig vorher: npx cdk bootstrap)
cd ../infra; npx cdk deploy
```

Ausgaben: `SiteUrl` (CloudFront) und `ApiEndpoint`. Die App unter `SiteUrl` öffnen,
Mikrofon freigeben, Übung wählen, PTT (Maus oder Leertaste) halten und sprechen.

### Lokale Frontend-Entwicklung

```powershell
cd frontend
$env:VITE_API_BASE = "https://<cloudfront-domain>"   # Proxy für /api
npm run dev
```

## Konfiguration

| Stellschraube | Ort | Default |
|---|---|---|
| Claude-Modell | Lambda-Env `MODEL_ID` (infra/lib/funkly-stack.ts) | `anthropic.claude-haiku-4-5` |
| TTS-Stimmen | `backend/src/turn.ts` (`VOICES`) | Amy (en-GB), Vicki (de-DE), neural |
| STT-Sprachen | `frontend/src/audio/transcribe.ts` | en-GB / de-DE |
| Region | AWS-Profil (`CDK_DEFAULT_REGION`) | eu-west-1 |

Hinweis Bedrock: Der Modellzugriff (Anthropic-Modelle) muss im Ziel-Account/Region einmalig in der
Bedrock-Konsole freigeschaltet sein. Falls das Modell nur über ein regionales Inference-Profil
verfügbar ist, `MODEL_ID` auf `eu.anthropic.claude-haiku-4-5` setzen.
