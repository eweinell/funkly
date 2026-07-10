# Design: PTT-Aufnahme und Sprachübertragung im Frontend

**Stand:** 2026-07-10
**Betroffene Dateien:** `frontend/src/components/radio/PttBar.tsx`, `frontend/src/state/turnActions.ts`,
`frontend/src/audio/{pttRecorder,resample,pcmQueue,transcribe}.ts`

Dieses Dokument beschreibt, wie das Drücken der Sprechtaste zu einem Transkript und einer Antwort der
Gegenstelle wird — und vor allem, **welche Probleme der Code dabei lösen muss**. Es erklärt Absicht und
Randbedingungen, nicht jede Zeile; für Details gilt der Code samt seiner Kommentare.

## 1. Leitidee

Die Sprechtaste ist eine *Halten-zum-Sprechen*-Bedienung wie am echten Seefunkgerät. Beim Drücken
öffnen **zwei Dinge gleichzeitig**: die Mikrofonaufnahme und ein Streaming-Transkriptionsstrom zu
Amazon Transcribe. Audio fließt bereits *während* des Sprechens zum Dienst, nicht erst nach dem
Loslassen. Beim Loslassen wird der Strom abgeschlossen, das Transkript an `api.turn()` geschickt und
die Antwort der Gegenstelle abgespielt.

Der Grund für den Echtzeit-Ansatz ist Wahrnehmung: Ein Funkgespräch mit mehreren Sekunden Pause nach
jeder Meldung fühlt sich nicht wie Funk an. Die Aufnahme *ist* Echtzeit, also darf die Übertragung
nicht künstlich dahinter zurückbleiben.

## 2. Die Kette

| Stufe | Datei | Aufgabe |
|---|---|---|
| Eingabe | `PttBar.tsx` | Zeiger- und Tastaturereignisse zu `onDown`/`onUp` |
| Ablaufsteuerung | `turnActions.ts` | Turn-Zyklus, Fehler- und Abbruchpfade |
| Aufnahme | `pttRecorder.ts` | Mikrofon → AudioWorklet → PCM16-Frames |
| Ratenwandlung | `resample.ts` | native Rate (meist 48 kHz) → 16 kHz |
| Brücke | `pcmQueue.ts` | synchrone Callbacks → async iterable |
| Erkennung | `transcribe.ts` | AWS-Streaming-Session, Transkript |

Ein Zyklus (`pttDown` → sprechen → `pttUp`) durchläuft die Statuswerte
`rx` → `stt` → `station` → `tx-play` → `idle`.

## 3. Aufnahmepfad

`PttRecorder.start()` fordert das Mikrofon an, baut einen `AudioContext` und lädt einen minimalen
`AudioWorkletProcessor`, dessen einzige Aufgabe es ist, jeden ~128-Sample-Block zu kopieren und an den
Hauptthread zu posten. Dort wird er auf 16 kHz PCM16 gewandelt, zu 100-ms-Frames gebündelt und über
einen `onPcm`-Callback ausgeliefert. `stop()` baut den Graphen ab und liefert die Gesamtaufnahme.

Der Worklet-Quelltext lebt als String im Modul und wird über eine (einmalig erzeugte) Blob-URL
geladen. Das erspart eine separate Asset-Datei im Build und hält Aufnahmelogik und Worklet zusammen.

## 4. Probleme, die der Code lösen muss

### 4.1 Browser-Eigenheiten der Web-Audio-API

**Der Graph läuft nicht, wenn er nicht bei den Lautsprechern ankommt.** Der Renderer zieht den Graphen
rückwärts von `ctx.destination`; ein Worklet ohne Pfad dorthin bekommt `process()` nie aufgerufen. Die
Lösung ist ein `GainNode` mit Verstärkung 0 — verbunden, aber stumm, damit das Mikrofon nicht
mithörbar wird.

**Firefox resampelt nicht für uns.** Weicht die Rate des `AudioContext` von der des MediaStreams ab,
liefert ein `MediaStreamAudioSourceNode` in Firefox überhaupt keine Samples. Der Kontext läuft deshalb
bewusst mit seiner nativen Rate, und die Wandlung auf 16 kHz passiert in JS.

**Autoplay-Sperren.** Ein `AudioContext` startet unter Umständen `suspended`; sowohl der Aufnahme- als
auch der Wiedergabekontext werden beim ersten Tastendruck entsperrt.

### 4.2 Ratenwandlung

**Chunkweise muss bitgenau dasselbe liefern wie am Stück.** `createStreamResampler()` hält über
Chunk-Grenzen hinweg das letzte Eingangssample (`carry`) als Stützstelle sowie einen
Fließkomma-Phasenakkumulator, der *nicht* pro Chunk zurückgesetzt wird. `flush()` bildet am Stromende
das Klemmverhalten der Ein-Schuss-Referenz nach. Beide Varianten stehen nebeneinander in `resample.ts`,
und `frontend/scripts/test-resampler.mjs` prüft ihre Äquivalenz (bit-exakt, auch bei 1-Sample-Chunks,
44,1 kHz und 24 kHz).

**Worklet-Blöcke sind zu klein zum Streamen.** ~2,7 ms je Block ergäben ~375 Netzwerkereignisse pro
Sekunde. Frames werden deshalb auf 1600 Samples (100 ms) gebündelt. Der letzte, unvollständige Frame
muss beim `stop()` dennoch ausgeliefert werden — sonst fehlen die letzten Silben jeder Meldung.

### 4.3 Latenz

**Der Credential-Roundtrip säße sonst zwischen Tastendruck und erstem Audioframe.**
`warmupTranscribeClient()` holt STS-Credentials schon beim Laden des Szenarios und frischt sie alle
60 s nach. Credentials gelten 900 s und werden unter 120 s Restlaufzeit erneuert; ohne periodisches
Nachfassen könnte die Erneuerung genau dann fällig werden, wenn eine Aufnahme läuft.

**Die Session steht später als das Mikrofon.** Beide starten parallel (`Promise.allSettled`); Frames,
die vor dem Zustandekommen der Session anfallen, werden gepuffert statt verworfen.

### 4.4 Nebenläufigkeit und Lebenszyklus

**Kurzes Antippen.** `pttUp` kann feuern, während `pttDown` noch in `getUserMedia()` hängt. Ohne
Absicherung sähe `endTurn` `recording === false`, kehrte früh zurück — und `pttDown` öffnete danach
eine Session, die niemand mehr schließt: laufendes Mikrofon, offener Strom. Ein `startup`-Versprechen,
das auf *jedem* Pfad aufgelöst wird, lässt `endTurn` den Startvorgang abwarten, statt einen
halbfertigen Zustand zu inspizieren.

> **Merksatz:** Zustand, der über `await`-Grenzen hinweg gesetzt wird, darf nicht von einem parallelen
> Event-Handler gelesen werden.

**Barge-in.** Die Sprechtaste während der Antwort der Gegenstelle zu drücken ist erlaubt und
erwünscht. Ein `turnToken` versioniert jeden Zyklus: Wiedergabe wird gestoppt, eine überholte Session
abgebrochen, und das `finally` setzt den Status nur dann auf `idle` zurück, wenn inzwischen kein
neuerer Zyklus begonnen hat.

**Ein offen gelassener Transcribe-Strom läuft — und kostet — weiter.** Jeder Fehlerpfad ruft
`session.abort()`. Clips unter 0,4 s werden sofort abgebrochen, statt für den Stille-Nachlauf zu
zahlen; ein brauchbares Transkript wäre daraus ohnehin nicht zu erwarten.

**Kosmetik darf die Aufnahme nie verhindern.** Quittungstöne laufen in einem eigenen `try`/`catch` —
ein fehlschlagender Piepton würde sonst den Status auf `idle` lassen und `pttUp` verwürfe den Turn
stillschweigend.

### 4.5 Eigenheiten von Amazon Transcribe

**Ohne Stille erkennt der Dienst das Ende der Äußerung nicht.** `finish()` schiebt ~1 s Stille nach,
bevor der Strom geschlossen wird.

**Zwischenergebnisse verdrängen einander.** Je Segment kommen erst Fassungen mit `IsPartial=true`,
später die finale — beide unter derselben `ResultId`. Gesammelt wird deshalb pro Segment die *zuletzt
gesehene* Fassung; würde man nur die finalen einsammeln, ginge das am Stromende noch unfinalisierte
Segment (typisch: das Ende der Meldung) verloren.

### 4.6 Synchron trifft asynchron

Worklet-Nachrichten kommen als Callbacks, das AWS-SDK will ein async iterable. `PcmQueue` verbindet
beides über einen gespeicherten Resolver — bewusst **ohne** Backpressure: Frames sind ~3 KB, ein
PTT-Zyklus dauert Sekunden, nicht Minuten.

### 4.7 Bedienung

`setPointerCapture` statt `onPointerLeave`: ein verrutschender Finger darf die Sendung nicht abbrechen.
`onPointerCancel` beendet den Turn dennoch sauber. Die Leertaste ignoriert `e.repeat` (Autorepeat
löste sonst fortwährend `pttDown` aus), und das Kontextmenü ist unterdrückt, damit ein langer Druck auf
Mobilgeräten kein Menü öffnet.

### 4.8 Fachliche Sperren

Kanal 70 ist am echten Gerät für Sprechfunk gesperrt (nur DSC): `pttDown` löst dort einen Fehlerton
und einen LCD-Hinweis aus, statt aufzunehmen. Während `stt` und `station` ist die Sprechtaste gesperrt,
während `tx-play` dagegen frei — genau das ist Barge-in.

### 4.9 Stille Fehlschläge sichtbar machen

Der Recorder protokolliert, wenn das Worklet **null** Samples geliefert hat (der Graph lief nie) und
wenn zwar Samples vorliegen, die Spitzenamplitude aber unter 0,001 bleibt (falsches Eingabegerät).
Beides sähe für Nutzende sonst identisch aus: „es passiert nichts“.

## 5. Bewusste Nicht-Ziele

- **Kein Backpressure** in der PCM-Queue (siehe 4.6).
- **Keine hochwertige Ratenwandlung.** Lineare Interpolation genügt für Sprache bei 16 kHz; ein
  Polyphase-Filter wäre Aufwand ohne hörbaren Gewinn für die Erkennungsgüte.
- **Kein Voice-Activity-Detection.** Die Sprechtaste *ist* die Aktivitätserkennung — so wie am Gerät.

---

## Anhang: Prompt zur Erzeugung einer Infografik

> Erstelle eine Infografik im Querformat (16:9) mit dem Titel **„PTT-Sprachpfad im Funkly-Frontend“**.
>
> **Hauptelement** ist ein horizontales Flussdiagramm mit sechs Stufen von links nach rechts, jede als
> abgerundete Kachel mit Symbol, Kurztitel und Dateiname in Monospace:
>
> 1. 🎙 **Sprechtaste** — `PttBar.tsx` — Pointer-Capture, Leertaste
> 2. 🔀 **Turn-Steuerung** — `turnActions.ts` — Token, Abbruchpfade
> 3. 📼 **Aufnahme** — `pttRecorder.ts` — AudioWorklet, 48 kHz
> 4. 📐 **Ratenwandlung** — `resample.ts` — 48 → 16 kHz, PCM16
> 5. 🧵 **Queue** — `pcmQueue.ts` — sync → async
> 6. ☁️ **Amazon Transcribe** — `transcribe.ts` — Streaming-Transkript
>
> Zwischen Stufe 3 und 6 verläuft ein durchgehender, hervorgehobener Pfeil mit der Beschriftung
> **„100-ms-Frames, live während des Sprechens“** — er ist der visuelle Kern des Bildes.
>
> **Unterhalb** des Flusses eine Reihe von vier kleineren „Stolperstein“-Karten, jeweils mit
> Warndreieck-Symbol, Problem in fett und Lösung in einer Zeile darunter:
>
> - **Graph läuft nicht ohne Ziel** → GainNode mit Gain 0 zur Destination
> - **Firefox liefert keine Samples** → nativer Kontext, Resampling in JS
> - **Kurzes Antippen verwaist den Stream** → `startup`-Promise vor der Auswertung
> - **Offener Stream kostet weiter** → `abort()` auf jedem Fehlerpfad
>
> **Rechts oben** eine kompakte Statusleiste als Kette von Pillen:
> `rx → stt → station → tx-play → idle`, mit einem geschwungenen Rückpfeil von `tx-play` nach `rx`,
> beschriftet **„Barge-in“**.
>
> **Stil:** dunkler Hintergrund im Look eines Seefunkgeräts (Anthrazit, #1a2025), Akzentfarbe
> bernsteinfarben wie ein LCD-Display (#f2a33c), Text hell und serifenlos, Dateinamen in Monospace.
> Sachlich und technisch, keine verspielten Illustrationen, keine Personen. Deutsche Beschriftung.
