/**
 * Prompt-Aufbau fuer den Dialog-Turn (Haiku, `MODEL_ID`) und das
 * Bewertungs-Geruest fuer Abschluss-/Pruefungsauswertung (Sonnet, `EVAL_MODEL_ID`).
 *
 * Layout und Cache-Breakpoint folgen content/prompts/dialog-system.md bzw.
 * content/prompts/evaluation-system.md (Welle 0, read-only fuer dieses Paket):
 * Block A ist statisch/byte-identisch (ein cache_control-Breakpoint am Ende),
 * Block B ist szenariospezifisch, Block C session-/turnspezifisch.
 *
 * ABWEICHUNG (mit Hauptsession abgestimmt, siehe Abschlussbericht): Die
 * Bewertung bleibt in Welle 1 Teil des Haiku-Dialog-Turns (wie M1) statt eines
 * separaten Sonnet-Calls pro Turn — EVAL_MODEL_ID ist nur das Geruest fuer den
 * spaeteren Abschluss-/Pruefungspfad (UC-09/17). Block A traegt daher zusaetzlich
 * zum Dialog-Output ein "evaluation"-Feld; das ist eine textuelle Erweiterung
 * gegenueber der Markdown-Vorlage, bleibt aber weiterhin szenario-/session-
 * unabhaengig (kein interpolierter Wert), also weiterhin vollstaendig cachebar.
 */
import type { Channel, Language } from "./contracts";
import { isEarlySwitch, renderChannelTemplate, resolveExpectedChannel, spokenChannel } from "./scenarios";
import type { HistoryEntry, Phase, Scenario, SessionSetup } from "./scenarios";
import { localize } from "./scenarios";

export interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

// ---------------------------------------------------------------------------
// Dialog-Prompt (Haiku, pro Turn)
// ---------------------------------------------------------------------------

/** Block A: woertlich stabil halten (siehe content/prompts/dialog-system.md).
 *  Enthaelt KEINE Szenario-/Session-Werte -> ueber alle Turns/Szenarien identisch. */
const DIALOG_BLOCK_A = `You are the counterpart station in a VHF marine radio training simulator for the
German SRC certificate (Short Range Certificate). Phraseology follows the IMO
Standard Marine Communication Phrases (SMCP).

The trainee talks over a simulated half-duplex radio; you receive an imperfect
speech-to-text (STT) transcript of their transmission. You have two jobs each
turn: (1) play the station convincingly and keep the exercise moving, in the
"reply" field; (2) grade the trainee's transmission against the rubric supplied
in Block B, in the "evaluation" field. Never let grading leak into the reply -
the reply is in-character radio traffic only; corrections belong solely in
"evaluation".

STT TOLERANCE: The transcript may be garbled. Judge intent, not spelling.
"delta eco" means "Delta Echo"; "may day" means "MAYDAY"; digits may be written
as words or numerals. Never correct spelling and never comment on transcription
noise. If a transmission is genuinely unintelligible or an essential element is
missing, react like a real station would ("say again", "station calling, say
again your position") - brief and in character.

HALF-DUPLEX / BARGE-IN: The trainee may key up (PTT) while you are still
speaking and cut you off. If the conversation shows that the trainee did not act
on something you already transmitted, still respond in character; do not lecture
in the reply - assess it under "evaluation" instead (see EVALUATION RULES).

PROWORD DISCIPLINE (react in character, do not explain):
- OVER = reply expected; OUT = exchange finished. Never "over and out".
- THIS IS separates the called station from the calling station.
- Distress/urgency/safety traffic (MAYDAY / PAN PAN / SÉCURITÉ) is ALWAYS in
  English, regardless of the session language.

REPLY RULES:
- Stay strictly in character. Keep replies short and realistic. No stage
  directions, no meta-commentary, no scoring in the reply.
- NEVER go silent over a channel. Whether the trainee is reachable on their
  selected channel is decided by the engine before you are called; if you are
  answering at all, they can hear you. A wrong channel spoken by the trainee is
  a mistake to correct in character and to fault in "evaluation" - not a reason
  to withhold a reply.

EVALUATION RULES:
- Grade the trainee's transmission (not your own reply) against every rubric id
  given in Block B, in the same order; echo each id verbatim.
- VERDICTS: "pass" (criterion fully met), "partial" (attempted but flawed or
  incomplete), "fail" (required here and not met), "n-a" (does not apply to what
  the trainee did this turn).
- SCORING: score 0-100 per criterion, consistent with the verdict
  (pass 80-100, partial 40-79, fail 0-39, n-a -> 0).
- BARGE-IN / OVERHEARD CONTENT: if you (the station) already transmitted
  information or an instruction earlier in this conversation that the trainee's
  current transmission ignores or contradicts, that is a fault under whichever
  rubric criterion it belongs to (typically acknowledgement/channel discipline).
- Never penalize obvious transcription noise; grade intent and procedure.
- "expected" = the model transmission the trainee should have sent this turn,
  in the session language.
- Emit ONLY the JSON object described under OUTPUT. No markdown fences.

OUTPUT (single JSON object):
{"reply": "<your radio transmission, or empty string if you do not answer>",
 "stationId": "<id of the answering station>",
 "noReplyReason": "<omit; only \"unintelligible\", and only with an empty reply>",
 "phaseId": "<id of the phase the exchange is in AFTER this turn>",
 "phaseDone": <true if this phase's expected action is complete, else false>,
 "done": <true when the whole exercise is complete, else false>,
 "evaluation": {
   "overallScore": <0-100>,
   "rubric": [{"id": "<rubric id from Block B>", "verdict": "pass|partial|fail|n-a", "score": <0-100>, "finding": "<one concrete sentence, session language>"}],
   "expected": "<model transmission the trainee should have sent, session language>"
 }}
Return one rubric entry for every id given in Block B, in the same order.`;

function languagePolicyNote(policy: Scenario["languagePolicy"]): string {
  const p = policy ?? "bilingual";
  const lines: Record<NonNullable<Scenario["languagePolicy"]>, string> = {
    bilingual: "bilingual        -> routine traffic in the session language, distress in English",
    "distress-english": "distress-english -> all traffic in English",
    session: "session          -> all traffic in the session language",
  };
  return lines[p];
}

/** Block B: szenariospezifisch, aus dem geladenen Content-Paket gerendert (pro
 *  Session einmal berechenbar, hier pro Turn - Kosten sind vernachlaessigbar,
 *  da nicht Teil des Cache-Breakpoints). */
function buildDialogBlockB(scenario: Scenario, language: Language, setup: SessionSetup): string {
  const stationsBlock = scenario.stations
    .map((s) => `  - id=${s.id}  name="${s.name}"  role: ${s.role}`)
    .join("\n");

  const phasesBlock = scenario.phases
    .map((p) => {
      // "working"-Phasen zeigen dem Modell den konkret gezogenen Arbeitskanal,
      // nicht den Sentinel - sonst nennt es im Dialog den falschen Kanal.
      const resolved = resolveExpectedChannel(p, setup);
      const ch = resolved !== undefined ? String(resolved) : "(any)";
      const station = p.station ?? scenario.stations[0]?.id ?? "";
      // Directions sind englisch (Modellanweisung), die Musterloesung unten ist
      // lokalisiert - beide duerfen keinen festen Beispielkanal tragen.
      const direction = renderChannelTemplate(p.direction ?? "", setup.workingChannel, "en");
      return `  - id=${p.id}  expect=${p.expect}  expectedChannel=${ch}\n    station=${station}\n    direction: ${direction}`;
    })
    .join("\n");

  const rubricBlock = scenario.rubric
    .map((r) => {
      const applies = r.appliesTo?.length ? `\n    applies only in phases: ${r.appliesTo.join(", ")}` : "";
      return `  - id=${r.id}  weight=${r.weight}\n    criterion: ${localize(r.criterion, language)}${applies}`;
    })
    .join("\n");

  const sample = scenario.sampleSolution
    ? `\n\nMODEL SOLUTION (reference, do not require verbatim match):\n${renderChannelTemplate(
        localize(scenario.sampleSolution, language),
        setup.workingChannel,
        language
      )}`
    : "";

  return `SCENARIO: ${localize(scenario.title, language)}  (useCase ${scenario.useCase}, difficulty ${scenario.difficulty})
LANGUAGE POLICY: ${languagePolicyNote(scenario.languagePolicy)}

STATIONS you may play (answer as the one addressed / active in the phase):
${stationsBlock}

PHASES (ordered). Each phase has an expected trainee action, an expected channel
and a per-phase direction. Track which phase the exchange is in and set phaseId
/ phaseDone / done accordingly.
${phasesBlock}

CHANNEL MECHANIC: The engine checks the trainee's selected channel (Block C)
against the active phase BEFORE calling you, and stays silent for them when it
does not match. So if you are being asked for a reply at all, the trainee is
reachable on their channel: ALWAYS answer. Never return an empty reply because
of a channel, and never set noReplyReason to a channel reason - that is the
engine's decision, not yours. If the trainee reads back or names a channel other
than the session working channel, they are still audible: correct them in
character ("negative, channel <session channel>, over") and fault it under
channel discipline in "evaluation".

RUBRIC (grade each; ids are a stable contract - echo them verbatim):
${rubricBlock}${sample}`;
}

/** Block C: session-/turnspezifisch. */
function buildDialogBlockC(
  setup: SessionSetup,
  language: Language,
  channel: unknown,
  phaseId: string,
  replayCount?: number,
  earlySwitchFrom?: Channel
): string {
  const replayLine = replayCount !== undefined ? `\nReplays used: ${replayCount}` : "";
  // Der Trainee hat schon auf den Arbeitskanal gedreht, bevor er den Wechsel auf
  // dem Anrufkanal quittiert hat. Die Engine laesst den Turn durch (sonst Sackgasse,
  // s. isEarlySwitch); die fehlende Quittung muss aber die Bewertung treffen.
  const earlySwitchLine =
    earlySwitchFrom !== undefined
      ? `\nEARLY CHANNEL SWITCH: the trainee is already transmitting on the working
channel, although the current phase still expects them on channel ${String(earlySwitchFrom)}. They have
followed the channel you assigned, so they are audible: answer in character on
the working channel, treat the unfinished business of channel ${String(earlySwitchFrom)} as settled,
and carry the exercise forward from here. Do NOT stay silent, do NOT set
noReplyReason, and do NOT send them back to channel ${String(earlySwitchFrom)}. The engine has already
moved the exercise to the working-channel phase. In "evaluation" this is a FAULT, never "pass": under the
channel-discipline criterion, record that the trainee left channel ${String(earlySwitchFrom)} without
properly reading back and acknowledging the assigned working channel there.`
      : "";
  // Der Arbeitskanal wird je Session gezogen; die Engine prueft gegen genau
  // diesen Wert. Nennt die Station einen anderen, laeuft der Trainee in ein
  // "no reply" auf dem Kanal, den sie ihm gerade genannt hat - daher die
  // ausdrueckliche Sperre gegen jeden anderen Kanal.
  const workingLine =
    setup.workingChannel !== undefined
      ? `\nWORKING CHANNEL FOR THIS SESSION: ${String(setup.workingChannel)}, spoken "${spokenChannel(
          setup.workingChannel
        )}".
When a phase direction tells you to assign, propose or agree a working channel,
name exactly this channel and no other - not one from an example, not one the
trainee suggested. Name a different one and the trainee will switch to a channel
the engine never answers on, which dead-ends the exercise.
If the trainee reads back a DIFFERENT channel, answer and correct them in
character ("negative, channel ${spokenChannel(setup.workingChannel)}, over"),
and fault the wrong readback under channel discipline. Do not go silent.`
      : "";
  return `Trainee vessel this session: ${setup.vessel}, callsign ${setup.callsign},
MMSI ${setup.mmsi}, position ${setup.position}.
Session language: ${language}.
Currently selected channel: ${String(channel)}.
Current phase (client view): ${phaseId}.${workingLine}${earlySwitchLine}${replayLine}`;
}

export function buildDialogPrompt(
  scenario: Scenario,
  phase: Phase,
  language: Language,
  setup: SessionSetup,
  channel: unknown,
  replayCount?: number,
  history?: HistoryEntry[]
): SystemBlock[] {
  // Kanal des laufenden Turns (die Engine hat ihn bereits durchgelassen): sendet
  // der Trainee schon auf dem Arbeitskanal, obwohl die Phase ihn auf dem
  // Anrufkanal erwartet, fehlt die Quittung dort - das muss das Modell wissen,
  // um es zu bemaengeln, statt die Phase weiter zu blockieren.
  const earlySwitchFrom = isEarlySwitch(phase, channel as Channel, setup, history)
    ? resolveExpectedChannel(phase, setup)
    : undefined;
  return [
    { type: "text", text: DIALOG_BLOCK_A, cache_control: { type: "ephemeral" } },
    { type: "text", text: buildDialogBlockB(scenario, language, setup) },
    { type: "text", text: buildDialogBlockC(setup, language, channel, phase.id, replayCount, earlySwitchFrom) },
  ];
}

// ---------------------------------------------------------------------------
// Bewertungs-Prompt (Sonnet, `EVAL_MODEL_ID`) — Geruest fuer Abschluss-/
// Pruefungsauswertung (UC-09/17). Wird in Welle 1 nicht pro Turn aufgerufen,
// siehe backend/src/evaluation.ts.
// ---------------------------------------------------------------------------

const EVALUATION_BLOCK_A = `You are a strict but fair examiner for the German SRC (Short Range Certificate)
VHF radio exam. You grade a trainee's radio transmissions against a fixed rubric.
Phraseology reference: IMO SMCP. You never role-play the station here - you only
assess.

STT TOLERANCE: The trainee's words arrive via imperfect speech-to-text. Grade
INTENT and PROCEDURE, not spelling. "delta eco" = "Delta Echo", "may day" =
"MAYDAY", digits as words or numerals are equivalent. Never penalize obvious
transcription noise. Only fault a missing/garbled element if the *procedure*
required it and it is genuinely absent, not merely misspelled.

BARGE-IN / OVERHEARD CONTENT: The trainee may key up while the station is still
transmitting (half-duplex), cutting it off. When the station already transmitted
information or an instruction that the trainee's next transmission ignores or
contradicts, that is a fault - assess it under the rubric criterion it belongs
to (typically acknowledgement/channel discipline). Judge this from the transcript
history: if the station said "go to channel two-six" and the trainee neither
switched nor acknowledged, the overheard instruction was not acted upon.

LANGUAGE: Distress/urgency/safety traffic (MAYDAY/PAN PAN/SÉCURITÉ) must be in
English regardless of session language; using another language there is a fault.

VERDICTS (assign exactly one per rubric id):
- "pass"    = criterion fully met.
- "partial" = attempted but flawed/incomplete.
- "fail"    = criterion required here and not met.
- "n-a"     = criterion does not apply to what the trainee did this turn.

SCORING: score is 0-100 per criterion, consistent with the verdict
(pass ~ 80-100, partial ~ 40-79, fail ~ 0-39, n-a -> 0). The overall score is the
weight-normalized average over all non-"n-a" criteria.

OUTPUT (single JSON object, no markdown fences):
{"overallScore": <0-100>,
 "rubric": [
   {"id": "<rubric id>", "verdict": "pass|partial|fail|n-a",
    "score": <0-100>, "finding": "<one concrete sentence, session language>"}
 ],
 "expected": "<model transmission the trainee should have sent, session language>"}
Return one entry for every rubric id given in Block B, in the same order.`;

function buildEvaluationBlockB(scenario: Scenario, language: Language): string {
  const rubricBlock = scenario.rubric
    .map((r) => {
      const applies = r.appliesTo?.length ? `\n    applies only in phases: ${r.appliesTo.join(", ")}` : "";
      return `  - id=${r.id}  weight=${r.weight}\n    criterion: ${localize(r.criterion, language)}${applies}`;
    })
    .join("\n");
  const sample = scenario.sampleSolution ? localize(scenario.sampleSolution, language) : "(none provided)";
  return `SCENARIO: ${localize(scenario.title, language)} (${scenario.useCase}, difficulty ${scenario.difficulty})
EVALUATION LANGUAGE: ${language}  (findings and "expected" in this language)

RUBRIC (grade each; ids are a stable contract - echo them verbatim):
${rubricBlock}

MODEL SOLUTION (reference, do not require verbatim match):
${sample}`;
}

function buildEvaluationBlockC(
  setup: SessionSetup,
  phaseId: string,
  channel: unknown,
  replayCount: number | undefined,
  historyText: string,
  transcript: string
): string {
  return `Trainee vessel: ${setup.vessel}, callsign ${setup.callsign}, MMSI ${setup.mmsi},
position ${setup.position}.
Current phase: ${phaseId}   Selected channel: ${String(channel)}   Replays used: ${replayCount ?? 0}

TRANSCRIPT HISTORY (station + trainee, chronological):
${historyText}

TRAINEE TRANSMISSION TO GRADE:
${transcript}`;
}

export function buildEvaluationPrompt(
  scenario: Scenario,
  language: Language,
  setup: SessionSetup,
  phaseId: string,
  channel: unknown,
  replayCount: number | undefined,
  historyText: string,
  transcript: string
): SystemBlock[] {
  return [
    { type: "text", text: EVALUATION_BLOCK_A, cache_control: { type: "ephemeral" } },
    { type: "text", text: buildEvaluationBlockB(scenario, language) },
    { type: "text", text: buildEvaluationBlockC(setup, phaseId, channel, replayCount, historyText, transcript) },
  ];
}
