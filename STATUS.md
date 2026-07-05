# Funkly — Status & Fortsetzungsplan

Stand: **2026-07-05** · Phase: **M1 (Durchstich)** · Code steht vollständig, Verifikation pausiert.

Dieses Dokument ist der Wiedereinstiegspunkt für spätere Sessions (Mensch oder Agent).
Erst [KONZEPT.md](KONZEPT.md) und [USE-CASES.md](USE-CASES.md) lesen, dann hier fortsetzen.

---

## 1. Was fertig ist

| Bereich | Stand | Dateien |
|---|---|---|
| Konzept & Use-Case-Katalog V1.0 | ✅ | `KONZEPT.md`, `USE-CASES.md` |
| CDK-Infrastruktur (S3+CloudFront, HTTP API, Lambda, STT-Rolle, Bedrock/Polly-IAM, Tag `app=funkly` auf App-Ebene) | ✅ geschrieben, **nicht synthetisiert** | `infra/` |
| Backend-Lambda: `/api/scenarios`, `/api/session`, `/api/turn` (Bedrock→Polly), `/api/stt-credentials` (STS) | ✅ geschrieben, `npm install` erledigt, **tsc-Check offen** | `backend/` |
| 3 Szenarien mit Rubrics + System-Prompt (UC-01 Radio Check, UC-02 Routineanruf, UC-07 MAYDAY) | ✅ | `backend/src/scenarios.ts` |
| Frontend-PWA: Funkgeräte-UI, PTT (Maus/Leertaste), Worklet-PCM-Aufnahme, Transcribe-Streaming-Client, Funk-Audioeffekt, Feedback-Panel, EN/DE | ✅ geschrieben, **npm install + build offen** | `frontend/` |
| README mit Build-/Deploy-Anleitung | ✅ | `README.md` |

**Umgebung:** Node 24 / npm 11 / CDK 2.1128 vorhanden. AWS-Credentials aktiv:
Account `261023731911` (IAM-User `admin`), Default-Region `eu-west-1`.

## 2. Offene Schritte (in dieser Reihenfolge abarbeiten)

Jeder Schritt hat ein Abnahmekriterium — erst weiter, wenn erfüllt.

- [ ] **S1 — Backend type-checken:** `cd backend && npm run build` → keine TS-Fehler.
      Erwartbare Baustellen: Typen des `@anthropic-ai/bedrock-sdk` (Message-Content-Blocks),
      `@types/aws-lambda`-Importe.
- [ ] **S2 — Frontend installieren & bauen:** `cd frontend && npm install && npm run build`
      → `frontend/dist/` existiert. Erwartbare Baustellen: Browser-Bundling des
      `@aws-sdk/client-transcribe-streaming` unter Vite (ggf. `define: { global: "globalThis" }`
      in `vite.config.ts` nötig).
- [ ] **S3 — Infra installieren & synthen:** `cd infra && npm install && npx cdk synth`
      → Template ohne Fehler; Warnung „frontend/dist fehlt" darf nach S2 nicht mehr erscheinen.
- [ ] **S4 — Bedrock-Modellzugriff prüfen:** In der Bedrock-Konsole (eu-west-1) Anthropic-Modelle
      freischalten, falls noch nicht geschehen. Test:
      `aws bedrock list-foundation-models --region eu-west-1 --by-provider anthropic`.
- [ ] **S5 — Bootstrap & Deploy:** `npx cdk bootstrap` (einmalig), dann `npx cdk deploy`
      → Outputs `SiteUrl` + `ApiEndpoint`. **Vor Deploy Rückfrage an Nutzer, ob Account/Region stimmen.**
- [ ] **S6 — Smoke-Test API:** `GET {SiteUrl}/api/scenarios` liefert 3 Szenarien;
      `POST /api/session` liefert Setup; `POST /api/turn` mit Dummy-Transkript
      (`{"scenarioId":"radio-check","language":"en","setup":<aus session>,"history":[],"transcript":"Lyngby Radio Lyngby Radio this is sailing yacht Albatros ..."}`)
      liefert `reply`, `evaluation`, `audioBase64`.
      Falls Bedrock-Fehler: `MODEL_ID` auf `eu.anthropic.claude-haiku-4-5` umstellen (siehe Risiken R1/R2).
- [ ] **S7 — End-to-End im Browser:** `SiteUrl` öffnen, Mikro freigeben, UC-01 durchspielen.
      Prüfen: PTT-Aufnahme, Transkript erscheint, Antwort-Audio mit Funk-Effekt, Bewertung im Panel.
- [ ] **S8 — Feinschliff nach Test:** STT-Qualität bei Callsigns/Prowords bewerten; falls schwach →
      Transcribe **Custom Vocabulary** anlegen (CDK: `CfnVocabulary`) und im Frontend-Command referenzieren.

## 3. Bekannte Risiken / Entscheidungen für die Fortsetzung

| # | Risiko / offene Frage | Plan B |
|---|---|---|
| R1 | `AnthropicBedrockMantle` (Bedrock-Mantle-Endpunkt) in eu-west-1 ungetestet; IAM-Actions evtl. unvollständig | Auf `@aws-sdk/client-bedrock-runtime` (Converse API) umstellen — nur `backend/src/turn.ts` betroffen |
| R2 | Modell-ID: `anthropic.claude-haiku-4-5` vs. regionales Inference-Profil `eu.anthropic.claude-haiku-4-5` | `MODEL_ID`-Env in `infra/lib/funkly-stack.ts` umstellen, redeploy |
| R3 | Transcribe-Streaming aus dem Browser (WebSocket-Handler des SDK v3 unter Vite) | Fallback: Web Speech API (`SpeechRecognition`) als „Sparmodus" einbauen (ohnehin UC-24) |
| R4 | `AudioContext({sampleRate: 16000})` auf Safari/iOS | Resampling im Worklet ergänzen (48 kHz → 16 kHz Dezimation) |
| R5 | JSON-Parsing der Modellantwort (prompted JSON) | Auf Structured Outputs (`output_config.format`, auf Bedrock GA) umstellen |

## 4. Konventionen (für alle künftigen Arbeiten verbindlich)

- **Deployments ausschließlich über CDK** (`infra/`), keine manuellen Konsolen-Ressourcen.
- **Alle Ressourcen tragen den Tag `app=funkly`** — zentral gesetzt via `cdk.Tags.of(app)` in
  `infra/bin/funkly.ts`; neue Stacks unter derselben App anlegen, dann greift der Tag automatisch.
- Region **eu-west-1**, Modell/Stimmen/Sprachen nur über die in README.md dokumentierten Stellschrauben ändern.
- Neue Übungen = neue Einträge in `backend/src/scenarios.ts` + Use-Case-Status in `USE-CASES.md` pflegen.
- Konversationszustand bleibt clientseitig (stateless Lambda), bis UC-23 (DynamoDB) umgesetzt wird.

## 5. Danach: nächste Ausbaustufe (M2, Auszug aus USE-CASES.md)

1. UC-04 Buchstabieralphabet-Drill, UC-05 Positionsangaben (reine Content-Erweiterung)
2. UC-22-Ausbau: Feedback einklappbar („Prüfungsmodus ohne Hilfen")
3. UC-13 DSC-Distress-Simulation (Distress-Taste aktivieren, Controller-Ablauf)
4. UC-25 TTS-Cache (S3) + UC-23 Fortschritt (DynamoDB-Tabelle im selben Stack)
