/**
 * Funkly Turn-API v2 — Schnittstellenvertrag (Welle 0).
 *
 * NUR Typen. Dies bricht die Engine noch nicht um (das ist Welle-1-Arbeit von
 * funkly-backend). Der Vertrag folgt UMSETZUNGSPLAN.md §3 und den verbindlichen
 * Zusatzanforderungen aus UI-SPEZIFIKATION.md §9:
 *   - Request traegt den eingestellten Kanal (`channel`) und `replayCount` (Diktat).
 *   - Response liefert je Rubric-ID ein Verdict (pass/partial/fail/n-a) UND einen
 *     Score, dazu die aktuelle Phase und `done`.
 *
 * Aenderungen an diesem Vertrag nur nach Absprache ueber die Hauptsession.
 */

export type Language = "en" | "de";

/** Anzeigemodus des Feedback-Panels (UI-SPEZIFIKATION §3). Steuert, was der
 *  Server ausliefert (z. B. keine Coaching-Hints im Pruefungsmodus). */
export type PanelMode = "training" | "compact" | "exam";

/** Kanal: Zahl (z. B. 16, 26) oder Sonderbezeichner ("70" = nur DSC). */
export type Channel = number | string;

/** Ergebnis eines einzelnen Rubric-Kriteriums. Das Verdict ist der Vertrag fuer
 *  die Ampel im UI; der Score speist Gesamtscore und Fortschritt (UC-23). */
export type Verdict = "pass" | "partial" | "fail" | "n-a";

/** Zufalls-Stammdaten einer Session (aus setup-Pools des Szenarios gezogen). */
export interface SessionSetup {
  vessel: string;
  callsign: string;
  mmsi: string;
  /** Positionsbeschreibung in der Sessionsprache (Freitext, fachlich korrekt). */
  position: string;
}

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

/**
 * Request an POST /api/turn (v2).
 */
export interface TurnRequestV2 {
  scenarioId: string;
  language: Language;
  /** Anzeigemodus; beeinflusst, welche Coaching-/Musterspruch-Felder befuellt werden. */
  mode: PanelMode;
  setup: SessionSetup;
  history: HistoryEntry[];
  /** STT-Transkript des Nutzerspruchs (kann Erkennungsfehler enthalten). */
  transcript: string;
  /**
   * Aktuell am Geraet eingestellter Kanal (UI-SPEZIFIKATION §1). Wandert in jeden
   * Turn; stimmt er nicht mit `phase.expectedChannel` ueberein, antwortet die
   * Gegenstelle nicht.
   */
  channel: Channel;
  /**
   * ID der Phase, in der sich die Session aus Client-Sicht befindet. Optional;
   * fehlt sie, bestimmt der Server die Phase aus dem Verlauf.
   */
  phaseId?: string;
  /**
   * Anzahl bereits erfolgter Wiedergaben des Empfangsspruchs (Diktat/Hoeren,
   * UI-SPEZIFIKATION §4). Wird mitbewertet/gespeichert. 0, falls nicht relevant.
   */
  replayCount?: number;
}

/** Bewertung eines Rubric-Kriteriums fuer einen Turn. */
export interface RubricResult {
  /** Stabile Rubric-ID aus dem Content-Schema (kebab-case). */
  id: string;
  verdict: Verdict;
  /** Score 0-100 fuer dieses Kriterium (fuer Aggregation/Fortschritt). */
  score: number;
  /** Konkreter Befund/Lob (in der Sessionsprache). */
  finding: string;
}

/** Phasenstand nach dem Turn (fuer den Stepper, UI-SPEZIFIKATION §3). */
export interface PhaseState {
  /** Aktuelle Phasen-ID nach diesem Turn. */
  currentPhaseId: string;
  /** 0-basierter Index der aktuellen Phase in scenario.phases. */
  currentIndex: number;
  /** IDs der als erledigt markierten Phasen (inkl. gerade abgeschlossener). */
  completedPhaseIds: string[];
  /** Gesamtzahl der Phasen des Szenarios. */
  totalPhases: number;
}

/** Ergebnis eines Turns (Dialog + Bewertung zusammengefuehrt). */
export interface TurnResponseV2 {
  /** Funkspruch der Gegenstelle (in character). Leer, wenn keine Antwort erfolgt
   *  (z. B. falscher Kanal — dann `noReplyReason` gesetzt). */
  reply: string;
  /** ID der antwortenden Station (stations[].id) — steuert die TTS-Stimme. */
  stationId: string;
  /** Grund fuer eine ausbleibende Antwort, z. B. "wrong-channel". Sonst weggelassen. */
  noReplyReason?: "wrong-channel" | "channel-70-voice-blocked" | "unintelligible";
  evaluation: {
    /** Gewichteter Gesamtscore 0-100 ueber alle anwendbaren Rubric-Kriterien. */
    overallScore: number;
    /** Ein Ergebnis je Rubric-ID des Szenarios. */
    rubric: RubricResult[];
    /** Musterspruch fuer diesen Turn (Sessionsprache). Im Pruefungsmodus ggf. erst
     *  am Ende befuellt (UI-SPEZIFIKATION §3). */
    expected?: string;
  };
  phase: PhaseState;
  /** Coaching-Zeile "Als Naechstes: ..." (nur mode="training"). */
  coaching?: string;
  /** true, wenn das Szenario vollstaendig und korrekt durchlaufen wurde. */
  done: boolean;
  /** MP3 der Antwort (base64). Leer, wenn `reply` leer ist. */
  audioBase64: string;
}

/**
 * Feld-Auswertung fuer Diktat/Hoerverstaendnis (UC-09/20, UI-SPEZIFIKATION §4).
 * Wird ueber den Bewertungspfad (EVAL_MODEL_ID) erzeugt und Feld fuer Feld
 * angezeigt (Ampel je Feld, Soll/Ist nebeneinander).
 */
export interface DictationFieldResult {
  /** Feld-ID aus dem Content-Schema (dictation.fields[].id). */
  id: string;
  verdict: Verdict;
  /** Vom Nutzer eingetragener Wert (normalisiert als String). */
  actual: string;
  /** Sollwert (normalisiert als String). */
  expected: string;
}

/** Ergebnis einer Diktat-/Hoerverstaendnis-Aufgabe. */
export interface DictationResultV2 {
  scenarioId: string;
  fields: DictationFieldResult[];
  overallScore: number;
  /** Anzahl der Wiedergaben, die der Nutzer gebraucht hat (mitbewertet). */
  replayCount: number;
}

/**
 * Laufzeit-Modelle (Bedrock) als dokumentierte Konstanten. Dialog-Turns laufen
 * auf Haiku, die (teurere, gruendliche) Bewertung/Pruefungsauswertung auf Sonnet.
 * Ueberschreibbar per Umgebungsvariable (siehe backend/src/turn.ts, Welle 1).
 */
export const DEFAULT_MODEL_ID = "anthropic.claude-haiku-4-5";
/** Aktuelle Sonnet-Generation (Sonnet 5). Falls im Ziel-Account nur ueber ein
 *  regionales Inference-Profil verfuegbar: per Env auf "eu.anthropic.claude-sonnet-5". */
export const DEFAULT_EVAL_MODEL_ID = "anthropic.claude-sonnet-5";
