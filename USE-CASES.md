# Funkly — Use Cases Version 1.0 (Seefunk / SRC)

Status-Legende: **✅ M1** = in diesem ersten Wurf umgesetzt · **🔜** = für V1.0 geplant, noch nicht umgesetzt

Alle Use Cases laufen zweisprachig (EN primär, DE wählbar), sofern nicht anders vermerkt.

## A — Sprechfunk-Standardverfahren (Kern)

| ID | Use Case | Beschreibung / Akzeptanzkriterien | Status |
|----|----------|-----------------------------------|--------|
| UC-01 | **Radio Check** | Nutzer ruft Küstenfunkstelle/anderes Schiff, fordert Radio Check an („How do you read me?"), System antwortet mit Readability-Skala. Bewertet: Anrufstruktur, Prowords, OVER/OUT. | ✅ M1 |
| UC-02 | **Routineanruf Küstenfunkstelle** | Vollständiger Ablauf: Anruf auf Kanal 16, Zuweisung Arbeitskanal, Kanalwechsel, Anliegen absetzen (z. B. Liegeplatz, Wetterbericht), Beenden. Bewertet: Callsign-Wiederholungen, Kanaldisziplin, Struktur. | ✅ M1 |
| UC-03 | Ship-to-Ship-Routineanruf | Anruf eines anderen Schiffs, Wechsel auf Schiff-Schiff-Kanal (z. B. 72/77), Absprache (Überholen, Passieren). | 🔜 |
| UC-04 | Buchstabieralphabet & Zahlen-Drill | Isoliertes Üben: Schiffsnamen/Callsigns buchstabieren (ICAO-Alphabet), Zahlen/Frequenzen/Uhrzeiten sprechen. Sofortkorrektur je Wort. | 🔜 |
| UC-05 | Positionsangaben | Position in allen Prüfungsformaten absetzen: Lat/Lon, Peilung+Abstand zu Landmarke. Bewertet: Format, Reihenfolge, „decimal"-Sprechweise. | 🔜 |
| UC-06 | Kanalwahl & -disziplin | Quiz + Praxis: richtiger Kanal je Zweck (16 Anruf/Not, 70 nur DSC, Arbeits-/Schiff-Schiff-Kanäle), Dual Watch. | 🔜 |

## B — Not-, Dringlichkeits- und Sicherheitsverkehr

| ID | Use Case | Beschreibung / Akzeptanzkriterien | Status |
|----|----------|-----------------------------------|--------|
| UC-07 | **MAYDAY absetzen (geführt)** | Notmeldung nach Schema (MAYDAY ×3, Name/Callsign/MMSI ×3, Position, Art der Not, Personenzahl, Hilfeersuchen, weitere Infos, OVER). Küstenfunkstelle quittiert (MAYDAY RECEIVED). Pflicht-Prüfungsaufgabe, EN. | ✅ M1 |
| UC-08 | MAYDAY RELAY | Weiterleitung einer fremden Notmeldung. Ablauf + korrekte Kennzeichnung. | 🔜 |
| UC-09 | Aufnahme einer Notmeldung (Diktat) | System sendet verrauschte Notmeldung, Nutzer füllt Notmeldeformular aus (MMSI, Position, Art der Not …). Auswertung Feld für Feld. Prüfungsteil „Aufnahme". | 🔜 |
| UC-10 | PAN PAN (Dringlichkeit) | Dringlichkeitsmeldung absetzen (z. B. Maschinenausfall, medizinischer Rat). | 🔜 |
| UC-11 | SÉCURITÉ (Sicherheit) | Sicherheitsmeldung absetzen/aufnehmen (z. B. treibendes Objekt, Sturmwarnung). | 🔜 |
| UC-12 | Funkstille gebieten/aufheben | SEELONCE MAYDAY / SEELONCE FEENEE, Verhalten als Dritter im Notverkehr. | 🔜 |

## C — DSC (Digital Selective Calling)

| ID | Use Case | Beschreibung / Akzeptanzkriterien | Status |
|----|----------|-----------------------------------|--------|
| UC-13 | DSC-Distress-Alert senden | Distress-Taste (mit Abdeckung, 3 s halten), Nature of Distress wählen, danach Folge-Sprechfunk auf Kanal 16 (= UC-07). Simuliertes Controller-Display. | 🔜 |
| UC-14 | DSC-Alert empfangen & quittieren | Eingehender Distress/All-Ships-Alert auf dem Display, korrektes Verhalten (nicht quittieren als Sportboot, mithören, ggf. Relay). | 🔜 |
| UC-15 | DSC-Routineanruf (Individual Call) | Individual Call mit MMSI absetzen, Arbeitskanal-Vorschlag, Folgekommunikation. | 🔜 |

## D — Freies Training & Prüfung

| ID | Use Case | Beschreibung / Akzeptanzkriterien | Status |
|----|----------|-----------------------------------|--------|
| UC-16 | Freies Szenariotraining | Generiertes Szenario (Schiff, Position, Situation, Gegenstellen), freier Funkverkehr mit Schwierigkeitsgrad (Tempo, Rauschen, Nebenstationen). | 🔜 |
| UC-17 | Prüfungssimulation SRC komplett | Alle vier Praxisteile am Stück ohne Hilfen, Bewertung nach Prüfungsmaßstab (bestanden/nicht bestanden je Teil), Abschlussbericht. | 🔜 |
| UC-18 | Übersetzung DE↔EN | Prüfungsteil: vorgegebenen Funktext übersetzen (beide Richtungen), Bewertung fachbegriffsgenau. | 🔜 |
| UC-19 | Theorie-Quiz (Fragenkatalog) | Offizieller SRC-Fragenkatalog als Multiple Choice, Spaced Repetition, Prüfungsbogen-Modus (Zeitlimit, Bestehensgrenze). | 🔜 |
| UC-20 | Hörverständnis-Training | Nur-Hören: verrauschte Funksprüche, Nutzer notiert Kerninhalte (MMSI, Position, Kanal), auto. Auswertung. | 🔜 |

## E — System & Nutzerkomfort

| ID | Use Case | Beschreibung / Akzeptanzkriterien | Status |
|----|----------|-----------------------------------|--------|
| UC-21 | **Sprachpipeline (PTT → STT → Dialog → TTS)** | Halbduplex-Kernschleife: PTT halten = senden, loslassen = Auswertung; Antwort als Sprache mit Funk-Effekt (Bandpass + Rauschen + Squelch). | ✅ M1 |
| UC-22 | **Feedback-Panel** | Nach jedem Funkspruch: eigenes Transkript, Bewertung mit Befunden, Musterlösung. Einklappbar (Prüfungsmodus ohne Hilfen). | ✅ M1 |
| UC-23 | Fortschritt & Statistik | Persistente Historie je Nutzer: geübte Verfahren, Scores über Zeit, Schwachstellen-Auswertung (DynamoDB). | 🔜 |
| UC-24 | Sprach-/Stimmen-Einstellungen | EN/DE-Umschaltung, Auswahl TTS-Stimme, Funk-Rauschpegel, STT-Sparmodus (Browser-Spracherkennung statt Transcribe). | teilw. (EN/DE ✅) |
| UC-25 | TTS-Cache | Wiederkehrende Standardansagen werden in S3 gecacht statt neu synthetisiert (Kostensenkung). | 🔜 |
| UC-26 | PWA-Installation & Offline-Theorie | Installierbare App; Theorie-Quiz offline nutzbar (Fragenkatalog im Cache). | 🔜 |
| UC-27 | Mehrbenutzer-Vorbereitung | Auth-Schicht (Cognito) vorbereitet, aber V1.0 läuft mit einfachem Zugangsschutz. | 🔜 |

## Außerhalb V1.0 (Ausblick)

- Flugfunk-Modul BZF I/II (eigenes Content-Paket + COM-Panel-UI)
- Lehrer-/Auswertungsansicht für Kurs-/Vereinsbetrieb
- Ranglisten/Gamification, geteilte Szenarien
