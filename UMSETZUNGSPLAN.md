# Funkly — Umsetzungsplan mit Sub-Agent-Briefings

Stand: 2026-07-05 · Status: **Planung — Umsetzung noch nicht gestartet**

Dieser Plan organisiert die weitere Umsetzung (USE-CASES.md, Status 🔜) als Arbeitspakete für
Sub-Agents. Die Briefings liegen als einsatzfertige Agent-Definitionen in `.claude/agents/`;
dieser Text hält Reihenfolge, Schnittstellenverträge und die Modellentscheidungen fest.

---

## 1. Agenten & Modellentscheidungen

| Agent (`.claude/agents/…`) | Auftrag (Kurzform) | Modell | Begründung |
|---|---|---|---|
| `funkly-prompt-engineer` | Content-Schema v2, System-Prompts (Dialog + Bewertung), Turn-API v2 | **Opus** | Bewertungsqualität *ist* das Produkt; Prompt-/Schemafehler fängt kein Test |
| `funkly-content-author` | Szenario-Content (YAML), Rubrics, Musterlösungen, zweisprachig | **Opus** | SMCP-/Prüfungsordnungs-Präzision in DE+EN; Fachfehler sind schwer zu entdecken |
| `funkly-backend` | Lambda-Engine: Phasen, Bewertungs-Split, TTS-Cache, Fortschritt | **Sonnet** | Klar umrissene TypeScript-Arbeit mit definierten Verträgen |
| `funkly-frontend` | Funkgeräte-UI-Ausbau: DSC, Diktatformular, Quiz, Prüfungsmodus | **Sonnet** | dito; visuelle Abnahme macht ohnehin der Mensch |
| `funkly-infra` | CDK: DynamoDB, Cache-Bucket, Budget-Alarm, Cognito-Vorbereitung | **Sonnet** | Wenig Code, aber Fehlerkosten (Kosten/Security) rechtfertigen mehr als Haiku |
| `funkly-data-pipeline` | Fragenkatalog → JSON, Custom-Vocabulary-Listen, TTS-Vorproduktion | **Haiku** | Mechanische Extraktion/Konvertierung mit Validierungsskript |
| `funkly-qa` | Verifikation je Welle: Builds, `cdk synth`, API-Smoketests, Regression | **Sonnet** | Systematisches Abarbeiten einer Checkliste, kein Tiefendesign |

Orchestrierung, Schnittstellen-Merges und das finale Review vor jedem Deploy bleiben in der
Hauptsession (`/code-review` auf hohem Effort-Level); die Agenten deployen **nie** selbst.

**Laufzeit-Modelle (Bedrock, zur Abgrenzung):** Dialog-Turns weiterhin Haiku 4.5 (`MODEL_ID`);
neu kommt `EVAL_MODEL_ID` (Sonnet) für Prüfungsauswertung/Abschlussberichte (UC-17) und
Diktat-Feldauswertung (UC-09) — nicht für jeden Übungs-Turn. Szenariogenerierung (UC-16):
einmalig pro Session Sonnet, die Turns danach Haiku.

---

## 2. Wellen & Abhängigkeiten

### Welle 0 — Verträge (sequenziell, klein)

`funkly-prompt-engineer` fixiert die beiden Verträge (Abschnitt 3). Blockiert alles Weitere,
daher zuerst und allein.

### Welle 1 — Engine & Content (parallel nach Welle 0)

| Paket | Agent | Use Cases |
|---|---|---|
| Engine-Umbau: Content-Pakete laden, Phasen-Tracking, Bewertungs-Split Haiku/Sonnet | `funkly-backend` | UC-03…12 (Serverseite), UC-16 |
| Szenarien als Content-Paket v2: UC-03, 04, 05, 06, 08, 10, 11, 12 (+ Migration der 3 M1-Szenarien) | `funkly-content-author` | UC-03…12 (Inhalt) |
| **Zuerst:** Frontend-Refactoring nach UI-SPEZIFIKATION §8 (Komponenten, CSS Modules, Tokens, Session-Store) bei identischem M1-Verhalten; **danach:** DSC-Bedienteil, Kanal-Mechanik, Feedback-Panel v2, Audio-Verhalten (UI-SPEZIFIKATION §1–3, 6–7) | `funkly-frontend` | UC-13, 14, 15, 22 |
| DynamoDB-Tabelle, TTS-Cache-Bucket, AWS-Budget-Alarm | `funkly-infra` | UC-23/25 (Unterbau) |
| Verifikation Welle 1 | `funkly-qa` | — |

### Welle 2 — Training & Prüfung (parallel nach Welle 1)

| Paket | Agent | Use Cases |
|---|---|---|
| SRC-Fragenkatalog (ELWIS) → `content/quiz/*.json`, Transcribe-Custom-Vocabulary DE/EN | `funkly-data-pipeline` | UC-19 (Daten), STT-Härtung |
| Fortschritt (DynamoDB), TTS-Cache, Diktat-Auswertung, Prüfungsmodus-Auswertung | `funkly-backend` | UC-09, 17, 23, 25 |
| Quiz + Spaced Repetition, Diktat-/Notmeldeformular, Prüfungsmodus, Einstellungen, PWA-Offline | `funkly-frontend` | UC-09, 17, 19, 20, 24, 26 |
| Verifikation Welle 2 + Regressionslauf Welle 1 | `funkly-qa` | — |

Danach (nicht Teil dieses Plans): UC-27 Cognito, Module UBI/BZF laut KONZEPT.md §5–7 —
dieselben Agenten, neue Content-Pakete.

---

## 3. Schnittstellenverträge (Eigentum: `funkly-prompt-engineer`, Welle 0)

Beide Verträge werden in Welle 0 als Dateien angelegt und danach nur noch per Absprache
über die Hauptsession geändert.

**Content-Schema v2** (`content/SCHEMA.md` + JSON-Schema): Szenarien wandern aus
`backend/src/scenarios.ts` in `content/scenarios/*.yaml`. Zielstruktur (Richtschnur, Details
entscheidet Welle 0):

```yaml
id, useCase, module: src, title/briefing (en+de),
stations: [{ name, role, voice }]          # mehrere Gegenstellen möglich
setup: { pools für Schiff/Callsign/MMSI/Position }
phases: [{ id, expect, direction, hints }] # Ablauf mit Phasen-Tracking
rubric: [{ id, weight, criterion }]        # IDs statt Freitext → auswertbare Scores
sampleSolution (en+de), difficulty
```

**Turn-API v2** (`backend/src/` Typen + `content/SCHEMA.md`-Abschnitt): Response enthält
Scores **und Verdicts** je Rubric-ID (nicht nur Gesamtscore), aktuelle Phase, `done`.
Frontend-Feedback-Panel und Fortschrittsspeicherung (UC-23) hängen daran.

Verbindliche Zusatzanforderungen an beide Verträge (Kanal-Mechanik, `maxReplays`,
`noiseLevel`, DSC-Phasentypen, Diktat-Sollwerte, Phasenlabels/Hints):
**UI-SPEZIFIKATION.md §9** — dort gepflegt, hier nicht dupliziert.

---

## 4. Leitplanken für alle Agenten (stehen auch in jedem Briefing)

- **Nichts deployen.** Kein `cdk deploy`, keine AWS-Ressourcen anlegen/ändern — Infrastruktur
  ausschließlich als CDK-Code (Tag `app=funkly`), Deploy macht der Mensch bzw. die Hauptsession.
- Pflichtlektüre vor Arbeitsbeginn: `KONZEPT.md`, `USE-CASES.md`, `README.md`,
  `UI-SPEZIFIKATION.md` (verbindliche UI/UX- und Mechanik-Entscheidungen), dieser Plan.
- Nur im eigenen Pfadbereich schreiben (steht je Briefing); Verträge (Abschnitt 3) sind
  read-only, Änderungswünsche gehen als Bericht an die Hauptsession.
- Keine neuen npm-Abhängigkeiten ohne Begründung im Abschlussbericht; keine Secrets in Code
  oder Config; Umgebung ist Windows/PowerShell, Node 20.
- Abschlussbericht immer: geänderte Dateien, getroffene Annahmen, offene Punkte, wie verifiziert.

---

## 5. Startfreigabe

Die Umsetzung startet erst nach Freigabe. Startkommando ist dann sinngemäß:
„Starte Welle 0" → Hauptsession spawnt `funkly-prompt-engineer` und arbeitet den Plan ab.
