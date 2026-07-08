# Funkly — UI/UX-Spezifikation (V1-Ausbau)

Stand: 2026-07-06 · Status: **Empfehlung, zur Abnahme** — nach Freigabe verbindlich für die
Umsetzungsagenten (referenziert aus den Briefings in `.claude/agents/`).

Leitidee: Das UI ist ein **Trainingsgerät, kein Chat**. Alles, was der Nutzer lernt, soll er
am simulierten Gerät *tun* (Kanal wählen, Klappe öffnen, Taste halten) — Text und Bewertung
sind Beiwerk im Panel daneben. Realismus dort, wo er Trainingswirkung hat; Vereinfachung
dort, wo echte Geräte nur Bedien-Folklore sind.

---

## 1. Kanalwahl als Spielmechanik

**Empfehlung: Der Kanal ist real wirksam („diegetisch"), nicht nur Deko.**

- Der eingestellte Kanal wandert in jeden Turn-Request; jede Szenario-Phase definiert ihren
  Sollkanal (`expectedChannel`).
- **Falscher Kanal:** Die Gegenstelle antwortet nicht — der Nutzer hört nur Squelch-Rauschen,
  das Log zeigt `SYS: keine Antwort auf CH 06`. Im **Trainingsmodus** erscheint nach dem
  zweiten Fehlversuch ein Coaching-Hinweis im Feedback-Panel („Die Gegenstelle wartet auf
  Kanal 26"). Im **Prüfungsmodus** gibt es keinen Hinweis; der Fehler fließt in die Bewertung.
- **Kanal 70:** PTT gesperrt mit kurzem Fehlerton + LCD-Hinweis `CH70 DSC ONLY` — genau wie
  echte Geräte Sprechfunk auf 70 verweigern. Das ist selbst Lernstoff (UC-06).
- Kanaldisziplin bleibt zusätzlich Rubric-Kriterium (Wechsel ohne Bestätigung, Anruf auf
  Arbeitskanal statt 16 etc.) — die Mechanik prüft das „Wo", die Rubric das „Wie".
- Bedienung: ▲/▼ mit Beschleunigung beim Halten (1er-Schritte, nach 1 s schnell); zusätzlich
  Tipp auf die Kanalanzeige → Zifferneingabe (Teilstruktur „Ziffernfeld", s. §8). Dual Watch
  erst mit den DSC-Szenarien.

## 2. DSC-Bedienteil — Prüfungskern statt Menübaum

**Empfehlung: flaches Softkey-Modell (max. 2 Ebenen), orientiert an öffentlich
dokumentierten Class-D-Controllern** (Bedienungsanleitungen z. B. von ICOM/Standard Horizon
sind frei verfügbar und dürfen als Verhaltensvorlage dienen — kein Markenlook, keine Logos,
siehe KONZEPT §3). Kein vollständiger Menübaum; stattdessen wiederverwendbare
**Teilstrukturen**: `MmsiInput` (9-stelliges Ziffernfeld) und `PositionInput`
(Grad/Minuten/Dezimalminuten + N/S, E/W) — beide werden auch vom Diktatformular (§4) genutzt.

**Distress senden (UC-13):**
1. Klappe antippen → klappt auf (Animation, Klappgeräusch)
2. Optional vorher: Nature of Distress aus Liste (Softkey `NATURE`) — ohne Auswahl wird
   `UNDESIGNATED` gesendet, wie am echten Gerät
3. Roten Knopf **3 s halten**: Countdown-Ring 3-2-1 + ansteigender Warnton; Loslassen bricht ab
4. LCD-Overlay: `DISTRESS SENT · WAITING ACK · CH 70`, DSC-Alarmton, nach 2–5 s simulierte
   Acknowledgement → Aufforderung `GO TO CH 16` → Nutzer muss selbst auf 16 wechseln (§1
   greift), dann beginnt der Sprechfunk-Teil (= UC-07-Szenario)
5. **Storno-Fall** (Fehlauslösung, prüfungsrelevant) als eigenes Szenario: `CANCEL`-Softkey
   + Sprechfunk-Widerruf auf 16

**Alert empfangen (UC-14):** Eingehender Alert übernimmt das LCD (Vollbild-Overlay, Alarmton
bis Tastendruck): MMSI, Nature, Position, Zeit. Softkeys `PAUSE ALARM` / `INFO`. Lernziel im
Szenario: als Sportboot **nicht** per DSC quittieren, sondern auf 16 mithören und ggf.
MAYDAY RELAY (UC-08) — das UI bietet die „falsche" ACK-Option bewusst an, die Rubric bewertet.

**Individual Call (UC-15):** Softkey `MENU` → `DSC CALL` → `INDIVIDUAL` → `MmsiInput` →
Arbeitskanal-Vorschlag wählen → senden → ACK der Gegenstelle → Gerät bietet Auto-Wechsel auf
den Arbeitskanal an (Softkey), alternativ manuell.

## 3. Feedback-Panel v2 & Phasen-Stepper

**Empfehlung: Ampel-Verdicts je Kriterium + Phasen-Stepper; drei Anzeigemodi.**

- **Phasen-Stepper** oben im Panel: die Phasen des Szenarios als Kette
  (`Anruf → Kanalwechsel → Anliegen → Abschluss`), aktueller Schritt hervorgehoben, erledigte
  abgehakt. Die Phasenlabels (DE/EN) kommen aus dem Content-Schema.
- **Je Turn:** Gesamtscore 0–100 plus Kriterienliste mit Verdict-Symbol je Rubric-ID —
  ✓ erfüllt · ◐ teilweise · ✗ verfehlt · − nicht anwendbar. Befundtext und Musterspruch
  hinter einem Aufklapper (wie heute `details`), damit das Log kompakt bleibt.
  **Konsequenz für den API-Vertrag:** Die Bewertung liefert je Rubric-ID ein *Verdict*
  (nicht nur Zahlen) — Ampeln aus Zahlen zu raten wäre wackelig.
- **Coaching-Zeile** (nur Trainingsmodus): ein Satz „Als Nächstes: …" unter dem Stepper,
  gespeist aus der aktuellen Phase (`hints` im Schema).
- **Drei Modi**, umschaltbar im Panel-Kopf:
  | Modus | Stepper | Verdicts/Score | Musterspruch/Coaching | Transkript-Log |
  |---|---|---|---|---|
  | Training (Default) | ✓ | ✓ | ✓ | ✓ |
  | Kompakt | ✓ | ✓ | — | ✓ |
  | Prüfung | — | erst am Ende | erst am Ende | ✓ (nur Text) |
  Das Transkript-Log bleibt auch in „Prüfung" sichtbar: Es fängt STT-Fehler-Frust ab
  (der Nutzer sieht, *was* ankam) und entspricht dem Prüfer, der mithört.

## 4. Diktat & Hörverständnis (UC-09/20)

- **Formular = amtliches Notmeldeschema:** Name/Rufzeichen (Text), MMSI (`MmsiInput`),
  Position (`PositionInput`), Art der Not (Freitext **und** Auswahlliste — Liste für schnelle
  Eingabe, Freitext für Details), Personen an Bord (Zahl), erbetene Hilfe / Sonstiges (Freitext).
- **Auswertung Feld für Feld:** strukturierte Felder exakt (MMSI, Position mit Toleranzfenster
  ±0,5′), Freitextfelder tolerant über den Bewertungspfad (`EVAL_MODEL_ID`). Darstellung:
  Ampel je Feld, Soll/Ist nebeneinander.
- **Wiedergabe: unbegrenzt wiederholbar**, aber mit sichtbarem Zähler („2× abgespielt"), der
  mitbewertet/gespeichert wird. Das Schema sieht `maxReplays` vor (Default `null` =
  unbegrenzt) — die Prüfungssimulation kann später begrenzen, ohne UI-Umbau.
- Rauschpegel je Schwierigkeitsgrad aus dem Szenario (`noiseLevel`), nicht global.

## 5. Prüfungsmodus (UC-17) — Dramaturgie

- **Startscreen** rahmt die Simulation: die vier Teile als Liste, Hinweis „ohne Hilfen",
  Disclaimer (KONZEPT §10). Start pro Teil per Button — zwischen den Teilen darf pausiert
  werden (kein Gesamtzeitlimit in V1; Zeitlimit nur im Theoriebogen).
- **Während eines Teils:** Panel im Modus „Prüfung" (§3), Gerät voll bedienbar, keine Hinweise.
- **Abbruch:** jederzeit möglich; gewertet wird nur eine vollständig durchlaufene Simulation.
  Wiederholungen unbegrenzt (Einschränkung ggf. später).
- **Abschlussbericht** als eine Seite: je Teil bestanden/nicht bestanden nach Prüfungsmaßstab,
  darunter die Befunde und Mustersprüche aller Turns (jetzt erst sichtbar), Ampel-Matrix über
  die Rubric-IDs hinweg („Schwachstellen"). Bericht wird für UC-23 gespeichert.

## 6. Mobile & Touch

**Empfehlung: einspaltig unter 900 px, PTT als fixe Bottom-Bar.**

```
┌──────────────────────┐
│ FUNKLY      [EN|DE]  │  Kopfzeile schrumpft
├──────────────────────┤
│  LCD (CH, Status,    │  Funkgerät kompakt:
│  Schiff, Szenario)   │  LCD + Kanal + DISTRESS
│  [▲CH▼]  [DISTRESS]  │
├──────────────────────┤
│  Stepper ○─●─○─○     │
│  Briefing / Log      │  scrollt
│  …                   │
├──────────────────────┤
│ ████  PTT  ████      │  fixe Bottom-Bar, ~72 px,
└──────────────────────┘  volle Breite, daumensicher
```

- **PTT-Robustheit (auch Desktop):** `setPointerCapture` statt `onPointerLeave` — ein
  verrutschender Finger darf die Sendung nicht abbrechen; `touch-action: none`,
  `user-select: none`, `oncontextmenu` unterdrückt (Long-Press!).
- **Wake Lock** (Screen Wake Lock API) während einer aktiven Übung; Fehlen der API stumm
  ignorieren.
- **iOS-Regeln:** AudioContext erst nach erster Nutzergeste entsperren; Mikrofonzugriff erst
  beim ersten PTT anfordern, mit erklärendem Hinweis davor; bei Verweigerung ein Hilfe-Panel
  („So gibst du das Mikrofon wieder frei") statt roher Fehlermeldung.
- **Zielgeräte (Abnahme):** iOS Safari (aktuell), Android Chrome (aktuell), Desktop
  Chrome/Edge/Firefox. Akzeptanzkriterium: eine komplette Übung **einhändig am Telefon**.
- DSC-Overlays (§2) sind auf Mobil Vollbild-Sheets; `PositionInput`/`MmsiInput` nutzen
  eigene große Tasten, kein natives Nummern-Keyboard (Gerätehaptik + keine Viewport-Sprünge).

## 7. Audio-Verhalten & Regler

- **Barge-in statt Sperre:** PTT während die Gegenstelle spricht ist erlaubt und stoppt deren
  Wiedergabe sofort (halbduplex-echt: wer sendet, hört nichts). Das Antwort-Transkript steht
  trotzdem im Log; ob der Nutzer auf Überhörtes nicht eingeht, bewertet die Rubric. Während
  der Verarbeitung (STT/Modell) bleibt PTT kurz gesperrt — das ist die „Gegenstelle denkt
  nach"-Lücke und stört nicht.
- **Latenz-Kaschierung:** Nach PTT-Loslassen sofort Squelch-Tail, danach leises
  Leerlaufrauschen („offener Kanal") bis die Antwort beginnt. Kein „STATION …"-Text mehr als
  Hauptsignal — die LEDs und das LCD zeigen den Status, das Ohr hört einen plausiblen Kanal.
- **Zwei Drehknöpfe** (Drag vertikal / Scrollrad, Werte persistiert):
  - **VOL** — Gesamtlautstärke der Simulation (inkl. Rauschen).
  - **SQL** — invertiert als *Trainings-Schwierigkeit*: weiter auf = mehr Grundrauschen,
    schmaleres Band, gelegentliche Dropouts in Empfangssprüchen (radioFx-Parameter).
    Hörverständnis-Szenarien dürfen ein Mindestrauschen erzwingen (`noiseLevel`, §4).
- **Sound-Inventar** (ein Modul `audio/sounds.ts`): PTT-Klick, Squelch-Tail, Leerlaufrauschen,
  Kanalwechsel-Beep, CH70-Fehlerton, DSC-Alarm (auffälliger Zweiton), Klappen-Klack. Alle
  synthetisch über Web Audio (keine Asset-Dateien nötig).

---

## 8. Frontend-Architektur & Mini-Designsystem (Refactoring vor Feature-Ausbau)

Der Ausbau (§1–7) trifft heute auf eine einzelne `App.tsx` (~280 Zeilen) und eine globale
`styles.css` — das würde „gewachsen". **Empfehlung: Refactoring als erstes
Welle-1-Teilpaket von `funkly-frontend`,** bevor DSC & Co. entstehen:

```
frontend/src/
  components/
    radio/      RadioPanel, Lcd, ChannelSelector, Knob, PttBar, DistressButton,
                DscOverlay (…je eigene Datei + eigenes .module.css)
    training/   ScenarioPicker, Briefing, PhaseStepper, TurnLog, FeedbackCard,
                ExamReport, QuizView (Welle 2)
    forms/      MmsiInput, PositionInput, DictationForm   ← Teilstrukturen, überall wiederverwendet
  state/        session.ts (Context + useReducer: Szenario, Phase, Kanal, Log, Modus)
  audio/        pttRecorder, transcribe, radioFx, sounds  (Bestand + sounds.ts)
  styles/       tokens.css (Design-Tokens), base.css
```

- **CSS Modules** (Vite-Bordmittel, keine neue Abhängigkeit) je Komponente; globale Werte nur
  als **Design-Tokens** in `tokens.css` (CSS Custom Properties): Gehäusegrau, LCD-Grün +
  LCD-Amber, Alarmrot, Mono-Font fürs LCD, Spacing-/Radius-Stufen. V1 bleibt dark-only.
- **State**: React Context + `useReducer`, kein State-Framework. Turn-Ablauf (heute in
  `endTurn`) wird eine Funktion im Session-Store, Komponenten lösen nur Aktionen aus.
- Richtwert: keine Datei über ~250 Zeilen; wer drüber liegt, teilt auf.
- Akzeptanz des Refactorings: identisches M1-Verhalten (drei Szenarien, PTT, Feedback) —
  erst danach beginnen die neuen Features.

## 9. Auswirkungen auf die Welle-0-Verträge (Zulieferung an `funkly-prompt-engineer`)

Damit diese Spezifikation baubar ist, müssen Schema/API vorsehen:

| Vertrag | Ergänzung | Quelle |
|---|---|---|
| Turn-API v2 Request | `channel` (eingestellter Kanal), `replayCount` bei Diktat | §1, §4 |
| Turn-API v2 Response | Verdict je Rubric-ID (`pass/partial/fail/n-a`) zusätzlich zum Score; aktuelle Phase | §3 |
| Content-Schema | `expectedChannel` je Phase; Phasenlabels DE/EN (Stepper); `hints` je Phase (Coaching); `noiseLevel`; `maxReplays` (Default unbegrenzt); DSC-Phasentypen (`dsc-alert`, `dsc-ack`, …); Diktat-Sollwerte je Formularfeld mit Toleranzangabe | §1–4 |
| Bewertungs-Prompt | „Nicht-Eingehen auf überhörte Inhalte" als bewertbarer Befund (Barge-in) | §7 |
