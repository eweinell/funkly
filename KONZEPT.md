# Funkly — Konzept: Trainingssystem für Funkprotokolle (Seefunk SRC, später Flugfunk)

Stand: 2026-07-05 · Zielplattform: Web-App/PWA · Hosting: AWS · Start: Eigenbedarf, ausbaufähig

---

## 1. Produktidee

Interaktiver Funksprech-Trainer mit echter Sprachein- und -ausgabe. Der Nutzer bedient ein
nachgebildetes UKW-Funkgerät im Browser, drückt die Sprechtaste (PTT), spricht seinen Funkspruch —
das System (Claude in der Rolle der Küstenfunkstelle, eines anderen Schiffs oder des Prüfers)
antwortet per Sprache mit realistischem Funk-Sound und bewertet die Phraseologie.

**Modul 1 (V1): Seefunk SRC** — UKW-Sprechfunk + DSC, Phraseologie nach IMO Standard Marine
Communication Phrases (SMCP), Prüfungsvorbereitung auf das deutsche SRC.

**Modul 2 (später): Flugfunk** — Sprechfunk für Privatpiloten (BZF I/II), gleiche technische
Basis, eigenes Content-Paket (ICAO-Phraseologie, SERA.14001 ff.).

**Sprachen:** Englisch primär, Deutsch als zweiter Modus (für SRC-Prüfung werden beide gebraucht:
Notverkehr auf Englisch ist Pflichtteil, Übersetzung DE↔EN ist Prüfungsteil).

---

## 2. Trainingsmodi

| Modus | Beschreibung |
|---|---|
| **Geführte Standardverfahren** | Schritt-für-Schritt-Drills: Routineanruf Küstenfunkstelle, Ship-to-Ship, Radio Check, Buchstabieralphabet & Zahlen, Positionsangaben, MAYDAY / MAYDAY RELAY, PAN PAN, SÉCURITÉ, DSC-Routine-/Distress-Alert (Kanal 70 → Folgekommunikation Kanal 16). Das System korrigiert nach jedem Durchgang: Struktur, Prowords (OVER/OUT/THIS IS/RECEIVED), Callsign-Wiederholungen, Kanalwechsel-Disziplin. |
| **Freies Szenariotraining** | Claude generiert ein Szenario (Schiffsname, Rufzeichen, MMSI, Position, Situation — z. B. Maschinenausfall vor Fehmarn, Anmeldung Schleuse, medizinischer Notfall) und spielt alle Gegenstellen. Schwierigkeit skalierbar: langsames, lehrbuchhaftes Gegenüber bis hin zu schnellem, verrauschtem Realverkehr mit Nebenstationen. |
| **Prüfungssimulation SRC** | Nachbildung der praktischen Prüfungsteile: (1) Notmeldung absetzen (Pflichtaufgabe, EN), (2) Aufnahme einer Notmeldung nach Gehör (Diktat — Nutzer füllt Formular aus), (3) sonstige Fertigkeiten (PAN PAN, SÉCURITÉ, Routineverkehr), (4) Übersetzungsaufgaben DE↔EN. Bewertung mit bestanden/nicht bestanden nach Prüfungsmaßstab + detailliertem Feedback. |
| **Theorie-Quiz** | Offizieller SRC-Fragenkatalog (Multiple Choice) mit Spaced Repetition; falsche Antworten kommen häufiger wieder. Fragenkatalog als statisches JSON-Content-Paket. |
| **Hörverständnis** | Nur-Hören-Übungen: verrauschte Funksprüche abspielen, Nutzer notiert MMSI/Position/Inhalt. Trainiert den schwierigsten Prüfungsteil. |

---

## 3. UI/UX — angelehnt an reale Hardware

Kernidee: Der Bildschirm zeigt ein generisches DSC-UKW-Funkgerät (Anlehnung an übliche Geräte
wie ICOM/Standard Horizon, ohne Markennachbildung):

- **Kanalwahl** (16, 70 nur DSC, Arbeitskanäle), großes Kanaldisplay, Dual-Watch-Anzeige
- **PTT-Taste**: am Desktop = Leertaste gedrückt halten, am Touchscreen = Bildschirmtaste halten.
  Loslassen beendet die Aufnahme („over") — das entspricht exakt dem Halbduplex-Funkbetrieb
- **DISTRESS-Taste mit Klappabdeckung** für DSC-Übungen (3-Sekunden-Druck, Nature of Distress wählen)
- **Display** mit eigener MMSI, GPS-Position (simuliert), empfangenen DSC-Alerts
- Squelch-/Volume-Drehknöpfe (funktional: Rauschpegel/Lautstärke der Simulation)
- **Funk-Audioeffekt** über Web Audio API: Bandpass ~300–3000 Hz, leichtes Rauschen, Squelch-Tail
  beim Loslassen der Gegenstelle. Wichtig für realistisches Hörtraining — und maskiert nebenbei
  TTS-Artefakte, sodass günstige Stimmen genügen
- Zweiter Bereich: **Logbuch/Feedback-Panel** (Transkript des eigenen Spruchs, Soll-Phraseologie,
  Bewertung, nächster Schritt) — einklappbar für „Prüfungsmodus ohne Hilfen"

Flugfunk-Modul später: gleiche Engine, UI wechselt auf COM-Panel (8,33-kHz-Frequenzen, Standby/Active-Flip).

---

## 4. Technische Architektur (AWS)

### 4.1 Grundsatzentscheidung TTS/STT: Claude API vs. AWS

**Die Claude API bietet kein TTS und kein STT** — sie verarbeitet Text (und Bilder), keine
Audio-Ein-/Ausgabe. Die Arbeitsteilung ist daher:

| Aufgabe | Dienst | Begründung |
|---|---|---|
| Dialoglogik, Rollenspiel, Szenariogenerierung, Phraseologie-Bewertung | **Claude** (Haiku 4.5 für Dialog-Turns, Sonnet für Bewertung/Prüfungsauswertung) | Kernkompetenz; per Amazon Bedrock nutzbar → eine AWS-Rechnung |
| Spracherkennung (STT) | **Amazon Transcribe** (Streaming, DE + EN) | AWS-nativ, Custom Vocabulary für Callsigns/Prowords/„MAYDAY" kostenlos konfigurierbar |
| Sprachausgabe (TTS) | **Amazon Polly** (Neural-Stimmen DE/EN) | AWS-nativ; Funk-Effekt maskiert Qualitätsunterschiede → Neural statt Generative reicht |

Geprüfte Alternative **Amazon Nova Sonic** (Speech-to-Speech auf Bedrock, ~0,015–0,06 $/min):
integrierte Sprachdialoge in einem Modell — aber wir brauchen das Transkript ohnehin für die
Phraseologie-Bewertung, und das PTT-Modell (klar abgegrenzte Turns) passt perfekt zur klassischen
Pipeline STT → LLM → TTS. Zudem weniger Kontrolle über die Rollen-/Bewertungslogik. **Empfehlung:
klassische Pipeline.**

Kostenloser Fallback: **Web Speech API des Browsers** (SpeechRecognition in Chrome/Edge) als
„Sparmodus" — Qualität und Browser-Support schwanken, aber für Theorie-/Textmodi brauchbar.

### 4.2 Turn-Ablauf (das Halbduplex-Geschenk)

Funk ist Halbduplex mit PTT — es gibt **keine** Anforderung an Echtzeit-Duplex-Audio. Das macht
die Architektur einfach und billig:

```
PTT drücken ──▶ Mikrofon-Aufnahme (Browser)
PTT loslassen ─▶ Audio-Clip → Amazon Transcribe (Streaming-WebSocket direkt vom
                 Browser mit präsignierter SigV4-URL, oder kurzer Batch-Job)
              ─▶ Transkript + Szenario-Zustand → Claude (Bedrock): Antwort der
                 Gegenstelle + strukturierte Bewertung (JSON)
              ─▶ Antworttext → Polly → Audio → Abspielen mit Funk-Effekt
```

Latenz 2–4 s ist akzeptabel — beim echten Funk vergeht zwischen OVER und Antwort auch Zeit.

### 4.3 Komponenten

| Komponente | Umsetzung (V1, Eigenbedarf) | Ausbaustufe |
|---|---|---|
| Frontend | React + Vite, PWA (installierbar, Mikrofon-Zugriff), Web Audio API | unverändert |
| Hosting Frontend | S3 + CloudFront | unverändert |
| Backend | Wenige Lambda-Funktionen hinter API Gateway: `/session` (Szenario anlegen), `/turn` (Transkript→Claude→Polly), `/presign-transcribe` (SigV4-URL für Browser-Streaming) | ECS/Fargate erst bei Bedarf |
| Dialog-LLM | Bedrock: `anthropic.claude-haiku-4-5` (Turns), `anthropic.claude-sonnet-…` (Bewertung) — mit Prompt Caching für den Phraseologie-Systemprompt | Modell-Upgrade transparent |
| STT | Transcribe Streaming (de-DE, en-GB/en-US) + Custom Vocabulary | Custom Language Model |
| TTS | Polly Neural; **generierte Standardansagen in S3 cachen** (wiederholte Prüfungssprüche kosten dann nichts mehr) | mehrere Stimmen pro Szenario |
| Daten | DynamoDB on-demand: Nutzerfortschritt, Session-Logs. Content-Pakete (Szenarien, Fragenkatalog, Phraseologie-Regeln) als versionierte JSON/YAML im Frontend-Bundle bzw. S3 | Cognito-Auth, Mandanten |
| Auth (V1) | einfacher Shared-Secret/Basic-Schutz | Amazon Cognito |

### 4.4 Content-Modell

Szenarien und Prüfungsaufgaben sind **Daten, nicht Code** — pro Domäne ein Content-Paket:

```yaml
# scenario: routine-call-coast-station.yaml
domain: src
language: en
role_ai: "Lyngby Radio"          # Gegenstelle(n), die Claude spielt
setup: { vessel: random, position: random-baltic, channel_work: [26, 27] }
phases:
  - expect: call            # Anruf: Station x2–3, THIS IS, eigenes Schiff x2–3, OVER
  - expect: switch-channel  # Arbeitskanal bestätigen und wechseln
  - expect: message         # Anliegen absetzen
  - expect: closing         # OUT
rubric:                     # Bewertungskriterien für Claude (strukturierte Ausgabe)
  - prowords_correct
  - callsign_repetitions
  - phonetic_alphabet
  - channel_discipline
```

Die Bewertung liefert Claude als **Structured Output** (JSON-Schema): Score je Kriterium,
konkrete Abweichungen, Musterlösung. Damit ist das Flugfunk-Modul später nur ein weiteres
Content-Paket + anderes UI-Skin — die Engine bleibt identisch.

---

## 5. Kostenschätzung (Eigenbedarf)

Annahme „1 Stunde aktives Training": ~40 Funkspruch-Wechsel, davon ~10 min eigene Sprechzeit,
~40 Systemantworten à ~150 Zeichen, Bewertung je Turn.

| Posten | Rechnung | Kosten/h |
|---|---|---|
| Transcribe (STT) | 10 min × 0,024 $ | 0,24 $ |
| Polly Neural (TTS) | ~6.000 Zeichen × 16 $/1 M | 0,10 $ |
| Claude Haiku 4.5 (Dialog + Bewertung) | ~80 k Input (großteils Cache-Reads) / ~8 k Output | ~0,10–0,15 $ |
| **Summe** | | **≈ 0,50 $/Trainingsstunde** |

- Bei z. B. 10 h/Monat: **~5 $/Monat** + Hosting < 1 $ (S3/CloudFront/Lambda/DynamoDB im Kleinstbereich).
- **AWS Free Tier (12 Monate)** deckt vieles ab: 1 Mio. Polly-Neural-Zeichen/Monat, 60 Transcribe-Minuten/Monat — das erste Jahr kostet real fast nur die Claude-Tokens.
- TTS-Caching der Standardsprüche und Prompt Caching des Systemprompts drücken die Kosten weiter.
- Theorie-Quiz und Text-Modi kosten praktisch nichts (kein Audio, Haiku-Tokens minimal).

Referenzpreise (Juli 2026): Transcribe 0,024 $/min (Tier 1, Batch = Streaming); Polly Standard
4 $ / Neural 16 $ / Generative 30 $ je 1 Mio. Zeichen; Claude Haiku 4.5 1 $/5 $ je 1 Mio.
Input-/Output-Tokens, Sonnet 3 $/15 $.

---

## 6. Roadmap

| Meilenstein | Inhalt |
|---|---|
| **M1 — Durchstich** | PWA-Grundgerüst, Funkgeräte-UI mit PTT, Pipeline Transcribe→Claude→Polly, Funk-Audioeffekt, 3 Standardverfahren (Routineanruf, Radio Check, MAYDAY) auf Englisch |
| **M2 — Training** | Bewertungs-Engine mit Rubrics + Feedback-Panel, Deutsch-Modus, DSC-Simulation (Distress-Taste, Kanal-70-Ablauf), Szenario-Generator |
| **M3 — Prüfung** | Kompletter SRC-Prüfungsmodus (4 Praxisteile + Fragenkatalog), Hörverständnis-Diktate, Fortschrittsspeicherung (DynamoDB), Spaced Repetition |
| **M4 — Ausbau** | Flugfunk-Content-Paket (BZF), Cognito-Mehrbenutzer, Lehrer-/Auswertungsansicht — Architektur ist darauf vorbereitet, wird aber erst hier umgesetzt |

---

## 7. Risiken & offene Punkte

- **STT-Genauigkeit bei Funksprache**: Rufzeichen, Buchstabieralphabet und Prowords sind für
  Standard-STT ungewohnt. Gegenmittel: Transcribe Custom Vocabulary; zusätzlich toleriert die
  Bewertungslogik (Claude) plausible Transkriptionsfehler („Delta Echo" vs. „delta eco").
  Früh mit echten Aufnahmen testen — das ist das größte technische Risiko.
- **Fragenkatalog-Lizenz**: Der offizielle SRC-Fragenkatalog (ELWIS/BMDV) ist öffentlich,
  Nutzungsbedingungen für eine spätere Kommerzialisierung prüfen. Für Eigenbedarf unkritisch.
- **Mikrofonrechte/HTTPS**: PWA benötigt HTTPS (CloudFront erledigt das) und einmalige
  Mikrofon-Freigabe.
- **Kein Ersatz für amtliche Prüfung**: Disclaimer, dass das Training die Prüfungsordnung
  nachbildet, aber keine amtliche Aussage über Bestehen trifft.
