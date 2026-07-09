# Briefing: STT-Übermittlung auf Nahe-Echtzeit umbauen

**Auftragnehmer:** `funkly-frontend`
**Stand:** 2026-07-09
**Status:** ✅ **erledigt** — umgesetzt und gegen die produktive Umgebung verifiziert (2026-07-09)

## Ergebnis

Alle fünf Schritte umgesetzt. Neu: `frontend/src/audio/resample.ts` (Ein-Schuss-Referenz +
zustandsbehafteter `createStreamResampler()`), `frontend/src/audio/pcmQueue.ts` (Producer/Consumer-
Queue ohne Backpressure — PCM-Frames sind ~3 KB je 100 ms, ein PTT-Zyklus dauert Sekunden),
`frontend/scripts/test-resampler.mjs`. Geändert: `pttRecorder.ts`, `transcribe.ts`,
`turnActions.ts`, `SessionContext.tsx`. `radioFx.ts` unangetastet.

Der Äquivalenztest aus Schritt 1 besteht **bit-exakt** (`maxDiff=0`) in allen fünf Fällen, inklusive
1-Sample-Chunks, 44,1 kHz und 24 kHz.

### Nachträglich gefundener fünfter Abbruchfall

Schritt 4 nennt vier Fälle, in denen `abort()` greifen muss. Es gibt einen fünften, der beim
Schreiben dieses Briefings übersehen wurde:

**Kurzes Antippen der Sprechtaste.** `pttDown` setzte `activeSession` erst nach
`await Promise.allSettled(...)`, während `pttUp` bereits feuern durfte, sobald der Status auf `"rx"`
stand. `endTurn` sah dann `recording === false` (der `AudioContext` entsteht erst nach
`getUserMedia()`) und kehrte vor dem `try` zurück, also ohne `finally`. Danach öffnete `pttDown` die
Session — zurück blieben laufendes Mikrofon, offener Transcribe-Stream und ein auf `"rx"`
festhängender Status.

Behoben: `pttDown` legt ein Versprechen ab, das im `finally` auf **jedem** Pfad aufgelöst wird;
`endTurn` wartet es ab, bevor es Recorder und Session beurteilt. Niemand inspiziert mehr einen
halbfertigen Startvorgang. Merksatz für künftige Pakete: Zustand, der über `await`-Grenzen hinweg
gesetzt wird, darf nicht von einem parallelen Event-Handler gelesen werden.

---

<details>
<summary>Ursprüngliches Briefing (zur Nachvollziehbarkeit)</summary>

## Ausgangslage

Der Transcribe-Stream wird heute erst **nach** dem Loslassen der Sprechtaste geöffnet und mit dem
fertig aufgenommenen Clip gefüttert (`frontend/src/audio/transcribe.ts`, `transcribeClip()`).

Amazon Transcribe verarbeitet einen Stream in Echtzeit nach Wanduhrzeit, nicht so schnell, wie die
Frames hereinkommen. Frames schneller zu senden staut sie auf; beim Stream-Ende verwirft der Dienst
den unverarbeiteten Rest. Ein 7,2-s-Clip mit dem früheren 4×-Pacing lieferte deshalb nur die ersten
ein bis zwei Sekunden als Transkript (`events: 9, segments: 1, unfinalized: 1, final: "1234"`).

Behoben wurde das durch Pacing auf exakt Echtzeit (`FRAME_MS` pro Frame), einen Nachlauf aus
Stille-Frames und Segment-Tracking über `ResultId`. Der Text ist damit vollständig — der Preis ist
Latenz: ein 7-s-Clip braucht nach dem Loslassen gut 8 Sekunden, bis das Transkript steht.

**Diese Latenz ist der Grund für dieses Arbeitspaket.** Sie ist kein Optimierungsdetail, sondern die
unvermeidliche Folge davon, den Clip erst nach der Aufnahme zu streamen.

## Ziel

Der Transcribe-Stream öffnet beim **Drücken** der Sprechtaste und wird live gefüttert. Die Wartezeit
nach `pttUp` sinkt von *Cliplänge + 1 s* auf *~1 s* (Stille-Nachlauf + Flush), unabhängig von der
Länge der Meldung.

## Ausnahme von den Leitplanken (ausdrücklich erteilt)

Deine Leitplanke „Audio-Pipeline (`pttRecorder`, `transcribe`, `radioFx`) nur erweitern, nicht
umschreiben" ist für dieses Paket **aufgehoben**, soweit es `pttRecorder.ts` und `transcribe.ts`
betrifft. `radioFx.ts` bleibt unangetastet. Alle übrigen Leitplanken gelten unverändert — insbesondere:
Schreiben nur unter `frontend/`, `contracts.ts` read-only, kein Deploy, PTT-Bedienverhalten
(Leertaste/Touch halten) darf nicht regressieren.

## Betroffene Dateien

`frontend/src/audio/transcribe.ts`, `frontend/src/audio/pttRecorder.ts`,
`frontend/src/state/turnActions.ts`, dazu vermutlich ein kleines neues Modul für die Queue.

## Schritt 1 — Zustandsbehafteter Resampler (zuerst, isoliert testen)

**Hier liegt das einzige echte Fachrisiko. Fang hier an.**

`resampleToPcm16()` läuft heute genau einmal über den kompletten Puffer. Chunk-weise aufgerufen
bricht die lineare Interpolation an jeder Chunk-Grenze ab: der Phasen-Offset (`pos = i * ratio`)
beginnt jedes Mal wieder bei null, und das letzte Sample des Vorgänger-Chunks fehlt als Stützstelle.
Ergebnis wären periodische Knackser alle 2,7 ms (Worklet-Blockdauer bei 48 kHz) und ein langsam
auflaufender Zeitversatz.

Der Resampler muss deshalb Zustand halten: den Phasenakkumulator als Fließkommazahl über Chunks
hinweg fortschreiben und das letzte Eingangssample als Übergabewert für die erste Interpolation des
Folge-Chunks aufbewahren.

**Akzeptanz:** Ein synthetischer Sinus, in viele kleine Chunks zerlegt und durch den neuen Resampler
geschickt, ergibt sample-genau (bis auf Rundung) dasselbe wie derselbe Sinus in einem Rutsch durch
den heutigen Ein-Schuss-Resampler. Diesen Vergleich als Testskript schreiben, nicht nur behaupten.

## Schritt 2 — Transcribe: Session statt Einmalaufruf

`transcribeClip(chunks, language)` wird ersetzt durch ein Session-Objekt:

```ts
startTranscription(language) → { pushPcm(Int16Array), finish(): Promise<string>, abort(): void }
```

- Der `AudioStream`-Generator zieht seine Frames nicht mehr aus einem fertigen Array, sondern aus
  einer Promise-basierten Queue, die die Worklet-Callbacks mit dem Generator verbindet.
- `finish()` schiebt die Stille-Frames nach (`TAIL_SILENCE_FRAMES`), schließt die Queue und wartet
  auf die letzten Events.
- Die Segment-Map über `ResultId` bleibt **unverändert** bestehen: sie rettet den Text, falls ein
  Segment beim Stream-Ende unfinalisiert bleibt.
- Das künstliche Pacing (`sleep(FRAME_MS)` im Sprach-Teil) entfällt ersatzlos — die Aufnahme *ist*
  Echtzeit. Im Stille-Nachlauf bleibt es nötig.
- `abort()` ist **nicht optional**: Transcribe-Streaming wird nach gesendeter Audiosekunde
  abgerechnet, ein Stream, den niemand schließt, läuft weiter.

## Schritt 3 — Recorder: Chunks live herausreichen

`PttRecorder.start()` bekommt einen `onPcm`-Callback, der pro Worklet-Nachricht das resampelte PCM16
liefert. Das Puffern bleibt erhalten, weil `durationSeconds()` und die Peak-Diagnose in `stop()`
daran hängen.

Der Recorder sammelt die ~128-Sample-Blöcke des Worklets (bei 48 kHz alle 2,7 ms) zu 100-ms-Frames
auf, bevor er sie weiterreicht. Sonst entstehen pro Sekunde ~375 Stream-Events statt zehn.

## Schritt 4 — Turn-Engine verdrahten

In `pttDown` starten Recorder und Transcribe-Session gemeinsam; in `pttUp` wird nur noch `finish()`
abgewartet. Vier Fälle müssen sauber bleiben:

- **Kanal 70 / Voice-blocked:** öffnen **gar keinen** Stream. Der Check in `pttDown` liegt heute
  schon vor dem Recorder-Start — das bleibt so.
- **Zu kurzer Clip** (`seconds < 0.4`): ruft `abort()` statt `finish()`.
- **Barge-in:** der `turnToken`-Vergleich verwirft heute nur das Ergebnis; künftig muss er die
  überholte Session aktiv abbrechen.
- **Mikrofon-Fehler** in `recorder.start()`: darf keine offene Session zurücklassen.

## Schritt 5 — Credentials vorwärmen

`getClient()` holt beim ersten Aufruf STS-Credentials über `/api/stt-credentials`. Heute passiert das
nach dem Loslassen und fällt in der Wartezeit nicht auf. Künftig säße dieser Roundtrip zwischen
Tastendruck und erstem Audio-Frame — die ersten Silben wären weg.

Der Cache muss beim Laden des Szenarios gefüllt werden, nicht beim ersten PTT. Da die Credentials
900 s gültig sind und `getClient()` bei unter 120 s Restlaufzeit erneuert, braucht es zusätzlich
einen Erneuerungspfad für den Fall, dass die Gültigkeit **während** einer laufenden Aufnahme abläuft.

## Reihenfolge

Resampler (1) → Session-API (2) → Recorder-Callback (3) → Verdrahtung (4) → Vorwärmen (5).

Jeder Schritt außer dem letzten ist für sich lauffähig: der alte `transcribeClip`-Pfad kann bis
Schritt 4 unangetastet daneben bestehen bleiben.

## Verifikation

Ein Typecheck beweist hier nichts. Der Beweis ist ein langer Clip gegen den **echten**
Transcribe-Endpunkt — der Dev-Mock fasst diesen Pfad nicht an, weil `transcribeClip` dort nicht läuft.

Eine Meldung von ~15 Sekunden sprechen und im Log prüfen:

- `segments` passt zur Länge der Meldung, `unfinalized: 0`
- Zeitspanne zwischen `pttUp` und `[turn] transcript` liegt bei rund **einer** Sekunde statt bei
  fünfzehn
- Gegenprobe auf Resampler-Artefakte: keine hörbaren Knackser beim lokalen Zurückspielen des Clips,
  keine erfundenen Silben im Transkript

## Abschlussbericht

Geänderte Dateien, die gewählte Queue-/Backpressure-Lösung (kurz begründet), das Testskript aus
Schritt 1 mit seinem Ergebnis, gemessene Latenz vor/nach dem Umbau, und was noch echten
Backend-Test durch die Hauptsession braucht.

</details>
