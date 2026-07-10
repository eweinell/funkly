/**
 * Content-Paket-Loader (Welle 1).
 *
 * Szenarien liegen nicht mehr hart codiert hier, sondern als YAML unter
 * `content/scenarios/*.yaml` (Vertrag: content/SCHEMA.md + content/schema/scenario.schema.json).
 * Der Buildschritt `npm run build:content` (backend/scripts/build-content.mjs)
 * buendelt alle YAML-Dateien zu `backend/src/generated/scenarios.generated.json`,
 * das hier per JSON-Import geladen wird (esbuild inlined das beim Lambda-Bundling
 * automatisch, keine separate Asset-Kopie noetig — siehe Abschlussbericht).
 *
 * Dieses Modul enthaelt bewusst nur reine Funktionen (kein Bedrock-/Polly-Call),
 * damit Phasen-/Kanal-/Rubric-Logik ohne Netzwerkzugriff testbar ist
 * (siehe backend/scripts/verify.mjs).
 */
import type { Channel, Language, RubricResult } from "./contracts";

// -- Content-Schema v2 (Laufzeit-Typen, gespiegelt aus content/schema/scenario.schema.json) --

export interface LocalizedText {
  en: string;
  de: string;
}

export interface Voice {
  provider?: "polly";
  voiceId: string;
  engine?: "neural" | "standard" | "generative";
  language: "en-GB" | "en-US" | "de-DE";
}

export interface Station {
  id: string;
  name: string;
  role: string;
  voice: Voice;
}

export type PhaseExpect =
  | "call"
  | "switch-channel"
  | "message"
  | "readback"
  | "closing"
  | "dsc-alert"
  | "dsc-ack"
  | "dsc-individual"
  | "dsc-cancel"
  | "dictation"
  | "listening"
  | "translation"
  | "free";

/** Sollkanal einer Phase: fester Kanal, oder der Sentinel `"working"` fuer den
 *  je Session gezogenen Arbeitskanal (`SessionSetup.workingChannel`). */
export const WORKING_CHANNEL = "working";
export type ExpectedChannel = Channel | typeof WORKING_CHANNEL;

export interface Phase {
  id: string;
  expect: PhaseExpect;
  label: LocalizedText;
  station?: string;
  direction?: string;
  expectedChannel?: ExpectedChannel;
  hints?: LocalizedText;
  sampleSolution?: LocalizedText;
  optional?: boolean;
}

export interface RubricCriterion {
  id: string;
  weight: number;
  criterion: LocalizedText;
  appliesTo?: string[];
}

export interface PositionValue {
  latDeg: number;
  latMin: number;
  latHem: "N" | "S";
  lonDeg: number;
  lonMin: number;
  lonHem: "E" | "W";
}

export interface Tolerance {
  minutes?: number;
  absolute?: number;
}

export interface DictationFieldOption {
  value: string;
  label: LocalizedText;
}

export interface DictationField {
  id: string;
  type: "text" | "mmsi" | "position" | "number" | "enum";
  label: LocalizedText;
  expected: string | number | PositionValue;
  evalMode?: "exact" | "tolerant";
  tolerance?: Tolerance;
  options?: DictationFieldOption[];
}

export interface Dictation {
  messageAudioText: LocalizedText;
  fields: DictationField[];
}

export interface SetupMmsi {
  midPrefix: string;
  randomDigits?: number;
}

export interface ScenarioSetup {
  vesselPool?: string[];
  callsignPool?: string[];
  mmsi?: SetupMmsi;
  positionPool?: LocalizedText[];
  workingChannelPool?: Channel[];
}

export interface Scenario {
  schemaVersion: 2;
  id: string;
  useCase: string;
  module: "src" | "ubi" | "bzf";
  difficulty: "beginner" | "intermediate" | "advanced";
  languagePolicy?: "bilingual" | "distress-english" | "session";
  noiseLevel?: number;
  maxReplays?: number | null;
  title: LocalizedText;
  briefing: LocalizedText;
  stations: Station[];
  setup?: ScenarioSetup;
  phases: Phase[];
  rubric: RubricCriterion[];
  sampleSolution?: LocalizedText;
  dictation?: Dictation;
  tags?: string[];
}

/** Stammdaten einer Uebungssession (aus setup-Pools des Szenarios gezogen). */
export interface SessionSetup {
  vessel: string;
  callsign: string;
  mmsi: string;
  position: string;
  /** Gezogener Arbeitskanal; loest `expectedChannel: "working"` auf. */
  workingChannel?: Channel;
}

// -- Laden des Content-Pakets --
// `resolveJsonModule` liefert sonst einen aus der aktuellen Bundle-Datei
// inferierten (zu engen) Literaltyp; wir erzwingen daher unsere eigenen,
// breiteren Schema-Typen per Assertion.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import generatedBundle from "./generated/scenarios.generated.json";
const bundle = generatedBundle as unknown as { schemaVersion: number; scenarios: Scenario[] };

if (bundle.schemaVersion !== 2) {
  throw new Error(
    `content-Bundle hat schemaVersion ${bundle.schemaVersion}, erwartet 2. ` +
      `'npm run build:content' erneut ausfuehren (content/scenarios/*.yaml -> backend/src/generated/scenarios.generated.json).`
  );
}

const SCENARIOS: Scenario[] = bundle.scenarios;

export function listScenarios(): Scenario[] {
  return SCENARIOS;
}

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

// -- Zufalls-Stammdaten je Session, aus den setup-Pools des Szenarios --

function pick<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

const FALLBACK_VESSEL_POOL = ["BLUEBIRD"];
const FALLBACK_CALLSIGN_POOL = ["DL4511"];
const FALLBACK_MMSI: SetupMmsi = { midPrefix: "211", randomDigits: 6 };
const FALLBACK_POSITION: LocalizedText = {
  en: "54 degrees 32 minutes north, 011 degrees 05 minutes east",
  de: "54 Grad 32 Minuten Nord, 011 Grad 05 Minuten Ost",
};

export function randomSetup(scenario: Scenario, language: Language): SessionSetup {
  const setup = scenario.setup;
  const vessel = pick(setup?.vesselPool?.length ? setup.vesselPool : FALLBACK_VESSEL_POOL);
  const callsign = pick(setup?.callsignPool?.length ? setup.callsignPool : FALLBACK_CALLSIGN_POOL);
  const mmsiSpec = setup?.mmsi ?? FALLBACK_MMSI;
  const digits = mmsiSpec.randomDigits ?? 6;
  const max = Math.pow(10, digits) - 1;
  const mmsi = mmsiSpec.midPrefix + String(Math.floor(Math.random() * (max + 1))).padStart(digits, "0");
  const positionText = pick(setup?.positionPool?.length ? setup.positionPool : [FALLBACK_POSITION]);
  const workingChannel = setup?.workingChannelPool?.length ? pick(setup.workingChannelPool) : undefined;
  return { vessel, callsign, mmsi, position: positionText[language], workingChannel };
}

// -- Phasen-Tracking (Engine ist massgeblich, nicht das Modell) --

export function findPhase(scenario: Scenario, phaseId?: string): { phase: Phase; index: number } {
  if (phaseId) {
    const index = scenario.phases.findIndex((p) => p.id === phaseId);
    if (index >= 0) return { phase: scenario.phases[index], index };
  }
  return { phase: scenario.phases[0], index: 0 };
}

export function stationFor(scenario: Scenario, phase: Phase): Station {
  const id = phase.station ?? scenario.stations[0]?.id;
  return scenario.stations.find((s) => s.id === id) ?? scenario.stations[0];
}

export interface PhaseAdvance {
  newIndex: number;
  completedPhaseIds: string[];
  scenarioDone: boolean;
}

/** Reine Fortschrittslogik: welche Phase gilt NACH diesem Turn. `phaseDone`
 *  ist ein Signal des Dialogmodells, aber die Reihenfolge/Vollstaendigkeit
 *  bestimmt ausschliesslich diese Funktion (Vertrag: Engine ist massgeblich). */
export function advancePhase(scenario: Scenario, currentIndex: number, phaseDone: boolean): PhaseAdvance {
  const completedPhaseIds = scenario.phases.slice(0, currentIndex).map((p) => p.id);
  if (!phaseDone) {
    return { newIndex: currentIndex, completedPhaseIds, scenarioDone: false };
  }
  completedPhaseIds.push(scenario.phases[currentIndex].id);
  const isLast = currentIndex >= scenario.phases.length - 1;
  return { newIndex: isLast ? currentIndex : currentIndex + 1, completedPhaseIds, scenarioDone: isLast };
}

/** Der Trainee sendet auf dem Arbeitskanal (s. `isEarlySwitch`): die Phasen, die den
 *  Wechsel dorthin vorbereiten, sind damit gegenstandslos. Die Engine setzt den Zeiger
 *  auf die erste Phase, die tatsaechlich auf dem Arbeitskanal spielt - eine
 *  Ein-Phasen-Schritt (`phaseDone`) liesse den Trainee sonst noch eine Runde in einer
 *  Phase haengen, deren Kanal er bereits verlassen hat. Bewertet wird der Fehler
 *  weiterhin, siehe Dialog-Prompt. */
export function advanceToWorkingChannelPhase(
  scenario: Scenario,
  currentIndex: number,
  setup?: SessionSetup
): PhaseAdvance {
  const working = setup?.workingChannel;
  const target = scenario.phases.findIndex((p, i) => {
    if (i < currentIndex || working === undefined) return false;
    const expected = resolveExpectedChannel(p, setup);
    return expected !== undefined && normalizeChannel(expected) === normalizeChannel(working);
  });
  // Kein Arbeitskanal-Phase gefunden -> normaler Ein-Phasen-Schritt.
  if (target < 0) return advancePhase(scenario, currentIndex, true);
  return {
    newIndex: target,
    completedPhaseIds: scenario.phases.slice(0, target).map((p) => p.id),
    scenarioDone: false,
  };
}

// -- Kanal-Mechanik (UI-SPEZIFIKATION §1) --

export type ChannelNoReplyReason = "wrong-channel" | "channel-70-voice-blocked";
export type ChannelCheck = { ok: true } | { ok: false; reason: ChannelNoReplyReason };

/** Phasentypen, die auf Kanal 70 (DSC-only) legitim sind. Fuer alle anderen
 *  Phasentypen sperrt Kanal 70 den Sprechfunk, unabhaengig von expectedChannel. */
const DSC_PHASE_TYPES = new Set<PhaseExpect>(["dsc-alert", "dsc-ack", "dsc-individual", "dsc-cancel"]);

function normalizeChannel(channel: Channel): string {
  return String(channel).trim().toUpperCase();
}

/** Sollkanal der Phase als konkreter Kanal. Der Sentinel `"working"` zieht den je
 *  Session gezogenen Arbeitskanal; ohne Setup (oder ohne Arbeitskanal-Pool im
 *  Szenario) bleibt die Phase kanalfrei, statt gegen den String zu vergleichen. */
export function resolveExpectedChannel(phase: Phase, setup?: SessionSetup): Channel | undefined {
  if (phase.expectedChannel === undefined) return undefined;
  if (phase.expectedChannel === WORKING_CHANNEL) return setup?.workingChannel;
  return phase.expectedChannel;
}

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

/** Hat die Gegenstelle den Arbeitskanal im bisherigen Funkverkehr bereits genannt?
 *  Geprueft wird nur, was die Station gesendet hat (`assistant`), und nur die Form
 *  "channel/Kanal <Nummer>" - eine nackte Ziffer im Fliesstext ist keine Zuweisung.
 *  `\b` verhindert, dass "channel sixteen" als Kanal 6 durchgeht. */
export function stationAnnouncedChannel(history: HistoryEntry[] | undefined, channel: Channel): boolean {
  if (!history?.length) return false;
  const forms = [String(channel), spokenChannel(channel, "en"), spokenChannel(channel, "de")];
  const alternatives = forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const named = new RegExp(`(channel|kanal)\\s+(${alternatives})\\b`, "i");
  return history.some((h) => h.role === "assistant" && named.test(h.content));
}

/**
 * "Frueher Wechsel": der Trainee sendet auf dem Arbeitskanal, obwohl die aktuelle
 * Phase ihn noch auf dem Anrufkanal erwartet. Toleriert wird das in zwei Faellen:
 *
 *  - die Phase verhandelt den Wechsel ohnehin gerade (`switch-channel`), oder
 *  - die Station hat den Arbeitskanal im Funkverkehr bereits genannt.
 *
 * Der zweite Fall ist der wichtige: der Phasenzeiger rueckt nur vor, wenn das
 * Dialogmodell `phaseDone` setzt. Haelt es die Anrufphase fuer unvollstaendig
 * (z. B. weil der Trainee keinen Kanal vorgeschlagen hat), hat die Station ihm
 * den Arbeitskanal aber laengst zugewiesen, dann befolgt er eine Anweisung, die
 * die Engine ihm nicht mehr zugesteht - und bekommt Funkstille auf genau dem
 * Kanal, auf den die Station ihn geschickt hat. Was auf dem Kanal gesagt wurde,
 * schlaegt hier den Phasenzeiger. Bewertet wird der Verfahrensfehler trotzdem
 * (Kanaldisziplin), dafuer bekommt der Dialog-Prompt einen expliziten Hinweis.
 */
export function isEarlySwitch(
  phase: Phase,
  channel: Channel,
  setup?: SessionSetup,
  history?: HistoryEntry[]
): boolean {
  const working = setup?.workingChannel;
  const expected = resolveExpectedChannel(phase, setup);
  if (expected === undefined || working === undefined) return false;
  // Phase erwartet ohnehin schon den Arbeitskanal -> nichts zu tolerieren.
  if (normalizeChannel(expected) === normalizeChannel(working)) return false;
  // Toleriert wird ausschliesslich der Arbeitskanal, kein beliebiger anderer.
  if (normalizeChannel(channel) !== normalizeChannel(working)) return false;
  if (phase.expect === "switch-channel") return true;
  return stationAnnouncedChannel(history, working);
}

export function checkChannel(
  phase: Phase,
  channel: Channel,
  setup?: SessionSetup,
  history?: HistoryEntry[]
): ChannelCheck {
  const normalized = normalizeChannel(channel);
  if (normalized === "70" && !DSC_PHASE_TYPES.has(phase.expect)) {
    return { ok: false, reason: "channel-70-voice-blocked" };
  }
  if (isEarlySwitch(phase, channel, setup, history)) return { ok: true };
  const expected = resolveExpectedChannel(phase, setup);
  if (expected === undefined) return { ok: true };
  if (normalizeChannel(expected) !== normalized) {
    return { ok: false, reason: "wrong-channel" };
  }
  return { ok: true };
}

/**
 * Funkstille wegen des Kanals gehoert ALLEIN der Engine (`checkChannel` laeuft
 * vor dem Modellaufruf). Reklamiert das Modell selbst "wrong-channel" - etwa
 * weil der Trainee beim Zurueckreden einen falschen Kanal genannt hat -, schwiege
 * die Station auf einem Kanal, auf dem sie zu antworten hat, und die Phase
 * bliebe stehen. Aus der Modellantwort ueberlebt daher nur der inhaltliche
 * Grund "unintelligible", und der nur zusammen mit einer leeren Antwort.
 */
export function sanitizeNoReplyReason(raw: unknown, reply: string): "unintelligible" | undefined {
  return raw === "unintelligible" && !reply.trim() ? "unintelligible" : undefined;
}

// -- Arbeitskanal-Platzhalter im Content --
//
// Der Arbeitskanal wird je Session aus dem Pool gezogen, die Station nennt ihn
// aber im Dialog. Stand ein fester Beispielkanal im Direction-/Musterloesungs-
// text ("change to channel two-six"), plapperte das Modell diesen nach, statt
// den Kanal aus Block C zu verwenden - der Trainee wechselte dann auf einen
// Kanal, auf dem `checkChannel` nicht antwortet. Deshalb steht im Content nur
// noch ein Platzhalter, den die Engine mit dem tatsaechlichen Kanal fuellt.

const SPOKEN_DIGITS: Record<Language, string[]> = {
  en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
  de: ["null", "eins", "zwei", "drei", "vier", "fuenf", "sechs", "sieben", "acht", "neun"],
};

/** Kanalnummer ziffernweise, wie sie im Sprechfunk gesprochen wird: 26 -> "two-six". */
export function spokenChannel(channel: Channel, language: Language = "en"): string {
  const raw = String(channel).trim();
  if (!/^\d+$/.test(raw)) return raw;
  return raw
    .split("")
    .map((d) => SPOKEN_DIGITS[language][Number(d)])
    .join("-");
}

/** Ersetzt `{{workingChannel}}` / `{{workingChannelSpoken}}` in Content-Texten.
 *  Ohne gezogenen Arbeitskanal bleibt eine neutrale Umschreibung stehen, damit
 *  weder Modell noch Trainee einen rohen Platzhalter zu sehen bekommt. */
export function renderChannelTemplate(text: string, workingChannel?: Channel, language: Language = "en"): string {
  const numeric =
    workingChannel !== undefined ? String(workingChannel) : language === "de" ? "dem Arbeitskanal" : "the working channel";
  const spoken =
    workingChannel !== undefined
      ? spokenChannel(workingChannel, language)
      : language === "de"
        ? "dem Arbeitskanal"
        : "the working channel";
  return text.replace(/\{\{workingChannelSpoken\}\}/g, spoken).replace(/\{\{workingChannel\}\}/g, numeric);
}

// -- Rubric-Aggregation (Vertrag: Scores je Rubric-ID, Gesamtscore server-seitig
//    aus den Einzelscores + Gewichten berechnet — nicht blind vom Modell uebernommen) --

export function aggregateOverallScore(rubric: RubricResult[], criteria: RubricCriterion[]): number {
  const weightById = new Map(criteria.map((c) => [c.id, c.weight]));
  let sumWeight = 0;
  let sumScore = 0;
  for (const r of rubric) {
    if (r.verdict === "n-a") continue;
    const weight = weightById.get(r.id) ?? 1;
    sumWeight += weight;
    sumScore += weight * r.score;
  }
  if (sumWeight === 0) return 0;
  return Math.round(sumScore / sumWeight);
}

/** Fallback-Rubric, falls die Modellantwort nicht (vollstaendig) geparst werden
 *  konnte: ein "n-a"-Eintrag je Szenario-Rubric-ID statt Absturz. */
export function fallbackRubric(scenario: Scenario, language: Language): RubricResult[] {
  const finding = language === "de" ? "(Bewertung konnte nicht geparst werden)" : "(evaluation could not be parsed)";
  return scenario.rubric.map((c) => ({ id: c.id, verdict: "n-a", score: 0, finding }));
}

/** Ergaenzt/bereinigt die vom Modell gelieferte Rubric-Liste: genau ein Eintrag
 *  je Szenario-Rubric-ID, in Schema-Reihenfolge; unbekannte IDs werden verworfen,
 *  fehlende als "n-a" ergaenzt (robustes Parsen statt Absturz). */
export function reconcileRubric(scenario: Scenario, language: Language, modelRubric: unknown): RubricResult[] {
  const byId = new Map<string, RubricResult>();
  if (Array.isArray(modelRubric)) {
    for (const entry of modelRubric) {
      if (!entry || typeof entry !== "object") continue;
      const id = String((entry as { id?: unknown }).id ?? "");
      if (!id) continue;
      const verdictRaw = String((entry as { verdict?: unknown }).verdict ?? "n-a");
      const verdict = (["pass", "partial", "fail", "n-a"] as const).includes(verdictRaw as never)
        ? (verdictRaw as RubricResult["verdict"])
        : "n-a";
      const scoreRaw = (entry as { score?: unknown }).score;
      const score = verdict === "n-a" ? 0 : Number(scoreRaw ?? 0) || 0;
      const finding = String((entry as { finding?: unknown }).finding ?? "");
      byId.set(id, { id, verdict, score, finding });
    }
  }
  const missingFinding =
    language === "de" ? "(keine Bewertung fuer dieses Kriterium erhalten)" : "(no evaluation returned for this criterion)";
  return scenario.rubric.map(
    (c) => byId.get(c.id) ?? { id: c.id, verdict: "n-a", score: 0, finding: missingFinding }
  );
}

export function localize(text: LocalizedText, language: Language): string {
  return text[language];
}
