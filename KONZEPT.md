# Funkly — Konzept: Trainingssystem für Funkprotokolle (Seefunk SRC, Flugfunk, Binnenfunk)

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
Basis, eigenes Content-Paket (ICAO-Phraseologie, SERA.14001 ff.). Ausarbeitung: Abschnitt 5.

**Modul 3 (später): Binnenschifffahrtsfunk (UBI)** — UKW-Sprechfunk auf Binnenwasserstraßen
nach RAINWAT; inhaltlich der kleinste Schritt vom SRC aus (gleiche Funkwelt, kein DSC/GMDSS,
deutschsprachig). Ausarbeitung: Abschnitt 6. Weitere Modulkandidaten: Abschnitt 7.

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

## 5. Modul 2: Flugfunk (BZF II / BZF I)

**Zielzeugnisse:** BZF II (Sprechfunk nur deutsch, VFR in Deutschland) und BZF I (deutsch +
englisch, VFR auch international). Die Prüfung bei der Bundesnetzagentur besteht aus einem
Multiple-Choice-Teil aus dem öffentlichen Fragenkatalog und einer praktischen Prüfung als
**simulierter VFR-Flug** (Abflug — Strecke — Anflug) inklusive Not-/Dringlichkeitsmeldung;
beim BZF I zusätzlich Übersetzung eines flugbetrieblichen Textes EN→DE und Sprechfunkpraxis
auf Englisch. Genau dieses Format ist die Vorlage für die Prüfungssimulation — der simulierte
Prüfungsflug ist praktisch deckungsgleich mit unserem Kern-Gameplay.

### 5.1 Lektionsplan

| Nr. | Lektion | Inhalt |
|---|---|---|
| F1 | Grundlagen | ICAO-Alphabet, Zahlenaussprache (EN: „tree/fife/niner", Frequenz-/Zeit-/Höhenangaben), Rufzeichen von Luftfahrzeugen und Bodenfunkstellen (Turm/Boden/Info/Radar), Rufzeichen-Verkürzung (D-EABC → D-BC nur nach Vorgabe der Bodenstelle), Anruf/Antwort, Prowords |
| F2 | Readback-Disziplin | Wiederholungspflichtige Elemente (Freigaben, Rollanweisungen, Piste, Frequenz, Squawk, QNH, Höhen) vs. „verstanden" — als eigene Lektion, weil hier die meisten Prüfungsfehler passieren; Rubric prüft Readback-Vollständigkeit maschinell |
| F3 | Rollverkehr | ATIS abhören, Anlass-/Rollfreigabe am kontrollierten Platz, Rollen zum Rollhalt, Kreuzen von Pisten |
| F4 | Abflug | Startfreigabe, Verlassen der Kontrollzone über Pflichtmeldepunkte, Frequenzwechsel zum Fluginformationsdienst |
| F5 | Streckenflug / FIS | Anmeldung bei „Langen Information" & Co., Positionsmeldungen, Verkehrs- und Wetterinformationen, Transponder-Codes |
| F6 | Einflug & Landung | Einflug in die Kontrollzone, Platzrunde, Landefreigabe, Durchstarten, Verkehrsinformationen („traffic in sight") |
| F7 | Unkontrollierte Plätze | An-/Abflug ohne Freigaben, Blindmeldungen, Betrieb mit Bodenfunkstelle ohne Kontrollfunktion |
| F8 | Lufträume & Sonderfälle | Durchflug Luftraum C/D, Sonder-VFR, Warteverfahren VFR |
| F9 | Not- und Dringlichkeitsverkehr | MAYDAY / PAN PAN, Squawk 7500/7600/7700, Funkausfallverfahren, Peil-/Radarhilfe („request QDM") |
| F10 | BZF-I-Aufbau | Alle Verfahren auf Englisch, Übersetzungsübungen EN↔DE (Prüfungsteil!), Hörverständnis mit realitätsnahem Sprechtempo |
| F11 | Prüfungssimulation | Kompletter simulierter Prüfungsflug nach BNetzA-Muster + Theorie-Quiz aus dem offiziellen Fragenkatalog |

### 5.2 Engine-Besonderheiten gegenüber Seefunk

- **Mehrstellen-Handoffs**: eine Session durchläuft mehrere Gegenstellen (Boden → Turm → FIS →
  Turm) — entspricht technisch dem Kanalwechsel im Seefunk, braucht aber Szenario-Phasen mit
  Stationswechsel und Frequenz-Rondell im COM-Panel (Active/Standby-Flip, 8,33 kHz)
- **ATIS-Generator**: Polly-generierte ATIS-Schleife (Wetter randomisiert), Nutzer muss Information
  im Erstanruf nennen — gutes Hörverständnistraining, TTS einmalig generiert und gecacht
- **Readback als Rubric-Typ**: Bewertung nicht nur „Phrase korrekt", sondern „alle
  wiederholungspflichtigen Elemente vollständig zurückgelesen"
- **STT-Custom-Vocabulary** um Flugfunk-Aussprache erweitern (niner, fife, tree, decimal,
  Meldepunkt-Namen, Rufzeichen D-Exxx)

### 5.3 Material (öffentliche Quellen)

| Quelle | Inhalt / Nutzen |
|---|---|
| **NfL 2024-1-3266 „Bekanntmachung über die Sprechfunkverfahren"** (BAF/DFS, PDF frei auf dfs.de) | Die maßgebliche deutsche Phraseologie-Sammlung, DE/EN nebeneinander — direkte Grundlage für Rubrics und Musterlösungen des Content-Pakets |
| **Fragenkatalog BZF I/II der Bundesnetzagentur** (PDF frei, bundesnetzagentur.de → Funkzeugnisse → Flugfunk) | Offizieller Katalog für den Theorie-Quiz-Modus; dort auch Prüfungshinweise mit Ablauf der praktischen Prüfung |
| **SERA, VO (EU) 923/2012, Abschnitt 14** + EASA „Easy Access Rules for SERA" (frei, easa.europa.eu) | Rechtsgrundlage der Phraseologie (SERA.14001 ff.), EN-Referenzformulierungen inkl. AMC/GM |
| **UK CAP 413 Radiotelephony Manual** (frei, caa.co.uk) | Umfangreichste frei verfügbare EN-Phraseologie-Referenz (ICAO Doc 9432 selbst ist kostenpflichtig) |
| **SKYbrary** (frei, skybrary.aero) | Hintergrundartikel zu RTF, Kommunikationsfehlern, Loss of Comm — Stoff für Erklärtexte im Feedback-Panel |
| **openAIP** (frei/Community, openaip.net) | Reale Plätze, Frequenzen, Meldepunkte als Szenariodaten; amtlich: AIP VFR über das DFS-AIS-Portal (kostenlose Registrierung) |
| **LiveATC** (liveatc.net) | Reale Funkbeispiele fürs Ohr — für Deutschland kaum Feeds (Rechtslage), daher primär EN-Hörbeispiele aus UK/US |

---

## 6. Modul 3: Binnenschifffahrtsfunk (UBI)

**Zielzeugnis:** UKW-Sprechfunkzeugnis für den Binnenschifffahrtsfunk (UBI). Rechtsrahmen:
BinSchSprFunkV und das regionale Abkommen **RAINWAT**. Prüfung (DSV/DMYV im Auftrag der WSV,
zuständig das Amt für Binnen-Verkehrstechnik ABVT): Theoriefragebogen aus dem öffentlichen
Katalog + praktische Aufgaben (Not-/Dringlichkeitsmeldung absetzen und nach Gehör aufnehmen,
Routineverkehr). **Für SRC-Inhaber gibt es nur eine verkürzte Ergänzungsprüfung** — daraus
folgt das Produktformat „Delta-Kurs": wer Modul 1 abgeschlossen hat, trainiert nur die
Binnen-Besonderheiten.

Fachlich unterscheidet sich der Binnenfunk vom Seefunk vor allem so: **Verkehrskreise** statt
freier Kanalwahl (Schiff–Schiff auf Kanal 10, Nautische Information über Revierzentralen,
Schiff–Hafenbehörde, Funkverkehr an Bord auf 15/17 mit reduzierter Leistung), **ATIS**
(automatische Kennung nach jeder Sendung), **kein DSC/GMDSS**, und als Sprache grundsätzlich
die **Landessprache des Reviers** (in Deutschland deutsch, inkl. deutscher Buchstabiertafel).

### 6.1 Lektionsplan

| Nr. | Lektion | Inhalt |
|---|---|---|
| B1 | Grundlagen Binnenfunk | Verkehrskreise und ihre Kanäle, ATIS, Rangfolge (Not > Dringlichkeit > Sicherheit > Routine), deutsche + internationale Buchstabiertafel, Schiffsname statt Rufzeichen im Alltag |
| B2 | Schiff–Schiff (Kanal 10) | Begegnungs- und Überholabsprachen mit der Berufsschifffahrt (Kernkompetenz auf Rhein/Mosel/Elbe!), Manöverabsprachen, Vorbeifahrt an Baggern/Sondertransporten |
| B3 | Nautische Information | Revierzentralen (z. B. Oberwesel für die Gebirgsstrecke des Rheins), Lagemeldungen mitschreiben, Meldepflichten, Sperrungen/Hochwassermarken |
| B4 | Schleusen, Brücken, Häfen | Anmeldung an der Schleuse, Einfahr-/Ausfahranweisungen, Wartestellen; Verkehrskreis Schiff–Hafenbehörde, Marina-Anruf |
| B5 | Not-, Dringlichkeits- und Sicherheitsverkehr | MAYDAY / PAN PAN / SÉCURITÉ nach RAINWAT — Besonderheit: keine Küstenfunkstelle, Adressat ist Revierzentrale oder „an alle Funkstellen"; Ablauf ohne DSC-Voralarm |
| B6 | Prüfungssimulation UBI | Theoriefragebogen (offizieller Katalog) + praktische Prüfungsaufgaben; separater Kurzpfad „Ergänzungsprüfung" für SRC-Absolventen |

### 6.2 Engine-Besonderheiten

Minimal: gleiches Funkgeräte-UI wie Modul 1, aber ohne DSC-Bedienteil, dafür mit
ATIS-Kennungssignal nach jeder eigenen Sendung (Audio-Detail mit hohem Realismusgewinn),
Kanalraster der Verkehrskreise und 1-W-Umschaltung. Content fast vollständig deutschsprachig —
gut als zweites Modul, um die Deutsch-Pipeline (Transcribe de-DE, Polly-Stimmen) zu härten.

### 6.3 Material (öffentliche Quellen)

| Quelle | Inhalt / Nutzen |
|---|---|
| **ELWIS → Sprechfunkzeugnisse** (elwis.de) | Offizieller UBI-Fragenkatalog (Stand 10/2018) inkl. Ergänzungskatalog und Musterprüfungsbögen; dazu die BinSchSprFunkV mit Prüfungsanforderungen |
| **Handbuch Binnenschifffahrtsfunk** (ABVT/WSV, frei; Allgemeiner Teil + Regionaler Teil Deutschland) | Muss ohnehin an Bord mitgeführt werden — enthält alle Verkehrskreise, Kanäle und Revierzentralen; die Referenz für Szenariodaten (welcher Kanal wo auf welchem Fluss) |
| **RAINWAT-Abkommen** (EN, rainwat.ctu.gov.cz) | Grundlagentext zu Verkehrskreisen, ATIS, Sprachenregelung — für Erklärtexte und Grenzgewässer-Szenarien (NL/F/CH) |
| **ABVT-Seiten der WSV** (abvt.wsv.de) | Prüfungsorganisation, aktuelle Änderungen |

---

## 7. Weitere denkbare Module

Die Engine (PTT-Dialog → Transkript → Rollenspiel + Rubric-Bewertung → TTS) passt auf jedes
Funkverfahren mit definierter Phraseologie. Kandidaten, sortiert nach Nähe zum Bestand:

| Modul | Ziel / Zielgruppe | Aufwand & Anmerkungen |
|---|---|---|
| **LRC** (Long Range Certificate) | GMDSS-Seefunk weltweit: MF/HF, DSC auf Grenzwelle/Kurzwelle, Sat-Kommunikation, NAVTEX/EGC | Direkter Aufbau auf Modul 1; Fragenkatalog öffentlich (ELWIS); braucht simuliertes MF/HF-Bedienteil. Naheliegendster vierter Baustein |
| **AZF** (IFR-Sprechfunk) | Piloten mit Instrumentenflugambitionen | Aufbau auf Modul 2, komplett englisch, IFR-Freigaben (Clearance Delivery, SID/STAR, Holding); BNetzA-Fragenkatalog öffentlich |
| **ICAO Language Proficiency (FCL.055)** | Sprachprüfungs-Vorbereitung Level 4/5 für Piloten | Kein Funkzeugnis, aber die Engine kann Hörverstehen + freies Nacherzählen + Bewertung nach ICAO-Skala; ergänzt Modul 2 natürlich |
| **Törnpraxis / „Funk im echten Leben"** | Skipper nach der Prüfung | Kein Prüfungsbezug: Marina-Anruf im Mittelmeer (EN), NOK-Passage, VTS-Meldungen, Brückenanruf Ostsee, Bunkern — reines Szenariotraining, Content statt neuer Technik |
| **Amateurfunkzeugnis N/E/A** | Funkamateure | BNetzA-Kataloge öffentlich, aber überwiegend Technik-Theorie → nur Quiz-Engine + optional Betriebstechnik-/Contest-Simulation; anderes Publikum |
| **ROC/GOC** (GMDSS-Berufszeugnisse) | Berufsschifffahrt, nautische Schulen | B2B-Nische; fachlich Obermenge von SRC/LRC, Prüfungsformat aufwendiger |
| **BOS-Sprechfunk** | Feuerwehr, THW, Rettungsdienst (Sprechfunkerausbildung) | Großes Publikum über Organisationen (B2B); Ausbildungsunterlagen aber teils organisationsintern/Ländersache — nur mit Partner sinnvoll |
| **Internationalisierung Modul 1** | z. B. RYA SRC (UK), Zeugnisse AT/CH/NL | Gleicher Stoff, andere Prüfungsordnung/Sprache — Content-Varianten statt neuem Modul |

Priorisierung aus heutiger Sicht: **UBI zuerst** (kleinster Aufwand, Delta-Kurs zum SRC), dann
**Flugfunk BZF** (größter eigenständiger Markt), dann **LRC** und **AZF** als natürliche
Vertiefungen der beiden Domänen. Törnpraxis ist jederzeit als reines Content-Paket einschiebbar.

---

## 8. Kostenschätzung (Eigenbedarf)

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

## 9. Roadmap

| Meilenstein | Inhalt |
|---|---|
| **M1 — Durchstich** | PWA-Grundgerüst, Funkgeräte-UI mit PTT, Pipeline Transcribe→Claude→Polly, Funk-Audioeffekt, 3 Standardverfahren (Routineanruf, Radio Check, MAYDAY) auf Englisch |
| **M2 — Training** | Bewertungs-Engine mit Rubrics + Feedback-Panel, Deutsch-Modus, DSC-Simulation (Distress-Taste, Kanal-70-Ablauf), Szenario-Generator |
| **M3 — Prüfung** | Kompletter SRC-Prüfungsmodus (4 Praxisteile + Fragenkatalog), Hörverständnis-Diktate, Fortschrittsspeicherung (DynamoDB), Spaced Repetition |
| **M4 — Ausbau** | UBI-Content-Paket (kleinstes Delta, Abschnitt 6), dann Flugfunk-Content-Paket (BZF, Abschnitt 5), Cognito-Mehrbenutzer, Lehrer-/Auswertungsansicht — Architektur ist darauf vorbereitet, wird aber erst hier umgesetzt |

---

## 10. Risiken & offene Punkte

- **STT-Genauigkeit bei Funksprache**: Rufzeichen, Buchstabieralphabet und Prowords sind für
  Standard-STT ungewohnt. Gegenmittel: Transcribe Custom Vocabulary; zusätzlich toleriert die
  Bewertungslogik (Claude) plausible Transkriptionsfehler („Delta Echo" vs. „delta eco").
  Früh mit echten Aufnahmen testen — das ist das größte technische Risiko.
- **Fragenkatalog-Lizenz**: Die offiziellen Kataloge (SRC/UBI auf ELWIS, BZF/AZF bei der
  Bundesnetzagentur) sind öffentlich abrufbar; Nutzungsbedingungen für eine spätere
  Kommerzialisierung prüfen. Für Eigenbedarf unkritisch.
- **Mikrofonrechte/HTTPS**: PWA benötigt HTTPS (CloudFront erledigt das) und einmalige
  Mikrofon-Freigabe.
- **Kein Ersatz für amtliche Prüfung**: Disclaimer, dass das Training die Prüfungsordnung
  nachbildet, aber keine amtliche Aussage über Bestehen trifft.
