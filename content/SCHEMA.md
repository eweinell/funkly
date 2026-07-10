# Funkly Content-Schema v2

Stand: Welle 0 (funkly-prompt-engineer). **Vertrag** — Änderungen nur nach
Absprache über die Hauptsession.

Szenarien sind **Daten, nicht Code** (KONZEPT.md §4.4). Sie wandern aus
`backend/src/scenarios.ts` in `content/scenarios/*.yaml` und werden gegen das
JSON-Schema `content/schema/scenario.schema.json` validiert. Das Schema muss
UC-03…20 tragen, nicht nur die M1-Fälle.

Zugehörige Verträge:
- `content/schema/scenario.schema.json` — maschinelle Validierung (JSON Schema Draft-07)
- `backend/src/contracts.ts` — Turn-API v2 (TypeScript-Typen)
- `content/prompts/dialog-system.md` — Dialog-Prompt (Haiku)
- `content/prompts/evaluation-system.md` — Bewertungs-Prompt (Sonnet)

---

## 1. Aufbau eines Szenarios

| Feld | Pflicht | Zweck |
|---|---|---|
| `schemaVersion` | ✓ | Konstante `2`. Erlaubt spätere Migrationen. |
| `id` | ✓ | Stabile kebab-case-ID; zugleich Dateiname. |
| `useCase` | ✓ | `UC-NN` aus USE-CASES.md. |
| `module` | ✓ | `src` (Seefunk). `ubi`/`bzf` sind vorgesehen, nicht Teil von V1. |
| `difficulty` | ✓ | `beginner` / `intermediate` / `advanced`. Steuert Default-Rauschen/Tempo. |
| `languagePolicy` | – | `bilingual` (Default), `distress-english`, `session`. |
| `noiseLevel` | – | Mindest-Rauschpegel 0..1 (UI-SPEZIFIKATION §4/§7). Default 0.15. |
| `maxReplays` | – | Max. Wiedergaben (Diktat, UI-SPEZIFIKATION §4). `null` = unbegrenzt (Default). |
| `title` / `briefing` | ✓ | Zweisprachig (`en`+`de`). |
| `stations` | ✓ | Eine oder mehrere Gegenstellen, je mit eigener TTS-Stimme. |
| `setup` | – | Zufallspools (Schiff, Callsign, MMSI, Position, Arbeitskanäle). |
| `phases` | ✓ | Geordnete Ablaufphasen mit `expect`, Sollkanal, Labels, Hints. |
| `rubric` | ✓ | Bewertungskriterien mit stabilen IDs und Gewichten. |
| `sampleSolution` | – | Muster-Funkverkehr, zweisprachig. |
| `dictation` | (bedingt) | Bei Diktat-/Hör-Phasen Pflicht: Sollwerte je Formularfeld. |
| `tags` | – | Freie Schlagworte. |

### Gegenstellen (`stations`) — mehrere mit eigener Stimme

Jede Station hat `id`, `name` (Rufname im Funk), `role` (Charakter fürs Modell,
englisch) und `voice` (Polly `voiceId` + `engine` + `language`). Phasen
referenzieren die aktive Station über `phase.station`. So sind Handoffs (z. B.
Küstenfunkstelle → MRCC, oder Boden → Turm im späteren Flugfunk) modellierbar,
ohne die Engine zu ändern.

### Phasen (`phases`) — Ablauf + Tracking

Jede Phase trägt:
- `id` (stabil, kebab-case) — erscheint in `TurnResponse.phase` und im Stepper.
- `expect` — Phasentyp (siehe §2).
- `label` — Phasenlabel DE/EN für den Stepper (UI-SPEZIFIKATION §3).
- `expectedChannel` — Sollkanal (UI-SPEZIFIKATION §1). Falscher Kanal → keine Antwort.
  `working` = der je Session gezogene Arbeitskanal (siehe §3).
- `hints` — Coaching-Zeile „Als Nächstes: …" (nur Trainingsmodus, UI-SPEZIFIKATION §3).
- optional `direction` (Regie fürs Modell), `station`, `sampleSolution`, `optional`.

### Rubric — stabile IDs, Gewichte

`rubric[]` mit `id` (kebab-case, **API-Vertrag**), `weight` (>0, für den
Gesamtscore normalisiert), `criterion` (DE/EN), optional `appliesTo` (Phasen).
Verdicts/Scores je ID gehen an das Feedback-Panel (UI-SPEZIFIKATION §3) und die
Fortschrittsspeicherung (UC-23).

### Diktat/Hörverständnis (`dictation`) — Sollwerte je Feld

Für UC-09/20. `messageAudioText` ist der (verrauschte) vorgelesene Spruch;
`fields[]` bildet das amtliche Notmeldeschema ab (UI-SPEZIFIKATION §4):
- `type`: `text` | `mmsi` | `position` | `number` | `enum` — bestimmt Eingabe-
  Teilstruktur (`MmsiInput`, `PositionInput`) und Auswertungsart.
- `expected`: Sollwert (String, Zahl oder strukturierte Position).
- `evalMode`: `exact` (strukturierte Felder, deterministisch) oder `tolerant`
  (Freitext über `EVAL_MODEL_ID`).
- `tolerance`: `{ minutes }` für Position (±0,5′ typisch) bzw. `{ absolute }` für Zahlen.

---

## 2. Phasentypen (`expect`)

| Wert | Bedeutung | UC |
|---|---|---|
| `call` | Anruf (Station ×2–3, THIS IS, eigenes Schiff, OVER). | UC-01/02/03 |
| `switch-channel` | Arbeitskanal bestätigen und wechseln. | UC-02 |
| `message` | Anliegen/Meldung absetzen. | UC-02/10/11 |
| `readback` | Wiederholungspflichtige Elemente zurücklesen. | UC-05 (u. a. Flugfunk später) |
| `closing` | Beenden (OUT). | alle |
| `dsc-alert` | DSC-Distress-Alert senden (Distress-Taste). | UC-13 |
| `dsc-ack` | Eingehenden DSC-Alert korrekt behandeln (nicht quittieren als Sportboot). | UC-14 |
| `dsc-individual` | DSC-Individual-Call mit MMSI. | UC-15 |
| `dsc-cancel` | Fehlauslösung stornieren/widerrufen. | UC-13 (Storno) |
| `dictation` | Notmeldung nach Gehör aufnehmen (Formular). | UC-09 |
| `listening` | Hörverständnis: Kerninhalte notieren. | UC-20 |
| `translation` | Funktext DE↔EN übersetzen. | UC-18 |
| `free` | Freies Szenariotraining. | UC-16 |

Die DSC-Phasentypen und Diktat-Sollwerte sind die verbindlichen Zusatzfelder aus
UI-SPEZIFIKATION.md §9.

---

## 3. Kanäle, Rauschen, Wiederholungen

- **Kanal** ist diegetisch (UI-SPEZIFIKATION §1): `expectedChannel` je Phase; bei
  falschem Kanal antwortet die Gegenstelle nicht (`noReplyReason` im API-Vertrag).
  Kanal 70 ist DSC-only. Kanäle sind Zahl (1–88) oder Sonderbezeichner-String.
- **Arbeitskanal**: `expectedChannel: working` ist ein Sentinel, kein Kanal. Er
  löst gegen `SessionSetup.workingChannel` auf — den Kanal, den `randomSetup()`
  je Session aus `setup.workingChannelPool` zieht und den das Dialogmodell in
  Block C genannt bekommt. Phasen, die auf einem zugewiesenen Arbeitskanal
  spielen, tragen `working` statt einer festen Zahl; sonst prüft die Engine gegen
  einen Kanal, den die Station nie zuweist. Wer `working` benutzt, **muss** einen
  `workingChannelPool` haben (die Validierung erzwingt das).
- **`noiseLevel`** ist szenariospezifisch, nicht global — Hörverständnis erzwingt
  darüber ein Mindestrauschen.
- **`maxReplays`** begrenzt Wiedergaben im Diktat; `null` = unbegrenzt (Default),
  der Zähler (`replayCount`) wird trotzdem mitbewertet.

---

## 4. Turn-API v2 (Kurzüberblick)

Vollständig typisiert in `backend/src/contracts.ts`. Kern:

- **Request** (`TurnRequestV2`): zusätzlich zu M1 nun `channel` (eingestellter
  Kanal), `replayCount` (Diktat) und `mode` (Panel-Modus training/compact/exam).
- **Response** (`TurnResponseV2`): `evaluation.rubric[]` liefert je Rubric-ID ein
  **Verdict** (`pass`/`partial`/`fail`/`n-a`) **und** einen Score (nicht nur
  Gesamtscore); dazu `phase` (aktuelle Phase + erledigte Phasen für den Stepper),
  `done`, optional `coaching` und `noReplyReason`.
- **Diktat** (`DictationResultV2`): Verdict + Soll/Ist je Feld-ID.

---

## 5. Validierung

Werkzeug: `content/tooling/` (Node-Skript `validate.mjs`, Abhängigkeiten `ajv`
und `js-yaml`). Einmalig `npm install`, dann validieren. Windows/PowerShell,
Node 20+.

```powershell
cd content\tooling
npm install
npm run validate                       # alle Szenarien unter content/scenarios/
node validate.mjs ..\scenarios\radio-check.yaml   # gezielt eine Datei
```

Das Skript prüft jedes YAML gegen `content/schema/scenario.schema.json` und macht
zusätzlich referentielle Checks, die JSON-Schema allein nicht abdeckt
(`phase.station` verweist auf existierende Station, `rubric.appliesTo` auf
existierende Phasen, keine doppelten Rubric-IDs). Exit-Code ≠ 0 bei Fehlern.

### Nachweis (Beispielszenario)

```
> node validate.mjs

PASS  C:\Users\erhard\dev\funkly\content\scenarios\radio-check.yaml

Alle 1 Szenario-Datei(en) gueltig.
```

Negativer Gegentest (bewusst kaputtes Szenario) meldet u. a. `id` muss Pattern
erfüllen, `useCase` muss `UC-NN` sein, `weight` muss > 0 sein, Diktat-Phase ohne
`dictation`-Block → Exit-Code 1. Die Validierung ist also wirksam, nicht nur
dekorativ.

---

## 6. Migration `radio-check` (M1 → v2)

`content/scenarios/radio-check.yaml` ist die 1:1-Migration von `radio-check` aus
`backend/src/scenarios.ts` (UC-01). Abbildung der alten Felder:

| M1 (`scenarios.ts`) | v2 |
|---|---|
| `title` / `briefing` (en+de) | unverändert übernommen |
| `direction` (eine Rolle) | aufgeteilt auf `stations[0].role` + `phases[].direction` |
| `rubric` (Freitext-Array) | `rubric[]` mit stabilen IDs (`calling-structure`, `prowords`, `phonetic-alphabet`, `brevity-channel-discipline`) + Gewichten |
| Zufallshilfen aus `scenarios.ts` (`VESSELS`, `CALLSIGNS`, MMSI-Präfix, Position) | `setup`-Pools |
| — | neu: `stations[0].voice` (Amy en-GB), `phases[].label/hints/expectedChannel`, `sampleSolution`, `noiseLevel`, `difficulty` |

Der Notverkehr-Sonderfall (MAYDAY immer EN) ist über `languagePolicy` abbildbar
(`distress-english`), für Radio Check nicht relevant (`bilingual`).
