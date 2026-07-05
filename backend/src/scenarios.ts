export type Language = "en" | "de";

export interface Scenario {
  id: string;
  useCase: string;
  title: Record<Language, string>;
  briefing: Record<Language, string>;
  /** Rollen-/Ablaufbeschreibung fuer das Modell (immer englisch formuliert) */
  direction: string;
  rubric: string[];
}

/** Zufallshilfen, damit jede Session andere Stammdaten hat */
const VESSELS = ["ALBATROS", "BLUEBIRD", "CALYPSO", "NORDWIND", "PELIKAN", "SEASTAR"];
const CALLSIGNS = ["DK2077", "DL4511", "DM3082", "DJ5643", "DK8821"];

export interface SessionSetup {
  vessel: string;
  callsign: string;
  mmsi: string;
  position: string;
}

export function randomSetup(): SessionSetup {
  const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const mmsi = "211" + String(Math.floor(100000 + Math.random() * 899999));
  return {
    vessel: pick(VESSELS),
    callsign: pick(CALLSIGNS),
    mmsi,
    position: "54 degrees 32 minutes north, 011 degrees 05 minutes east (approx. 5 NM north of Fehmarn)",
  };
}

export const SCENARIOS: Scenario[] = [
  {
    id: "radio-check",
    useCase: "UC-01",
    title: { en: "Radio Check", de: "Radio Check" },
    briefing: {
      en: "You are underway in the Baltic. Call Lyngby Radio on channel 16 and request a radio check. Use full calling procedure and prowords.",
      de: "Sie sind in der Ostsee unterwegs. Rufen Sie Lyngby Radio auf Kanal 16 und bitten Sie um einen Radio Check. Nutzen Sie das vollstaendige Anrufschema und die Prowords.",
    },
    direction:
      "You play the coast station 'Lyngby Radio'. The trainee should perform a correct radio check request: " +
      "call (station name 1-3x, THIS IS, own vessel + callsign 1-3x, 'radio check' request, OVER). " +
      "Reply with a readability report (e.g. 'I read you five') and close the exchange properly. " +
      "The exercise is complete after your readability report and the trainee's proper closing (OUT).",
    rubric: [
      "calling structure (station called first, THIS IS, own name/callsign)",
      "correct prowords (OVER / OUT, no 'roger over and out' nonsense)",
      "phonetic alphabet for the callsign",
      "brevity and channel discipline",
    ],
  },
  {
    id: "routine-coast-call",
    useCase: "UC-02",
    title: { en: "Routine call to coast station", de: "Routineanruf Kuestenfunkstelle" },
    briefing: {
      en: "Call Lyngby Radio on channel 16, ask for a working channel and request the latest weather report for the Western Baltic. Follow channel switching instructions.",
      de: "Rufen Sie Lyngby Radio auf Kanal 16, lassen Sie sich einen Arbeitskanal zuweisen und erbitten Sie den aktuellen Wetterbericht fuer die westliche Ostsee. Folgen Sie den Kanalwechsel-Anweisungen.",
    },
    direction:
      "You play the coast station 'Lyngby Radio'. Expected flow: (1) trainee calls you on channel 16 with full procedure, " +
      "(2) you answer and assign working channel 26 ('go to channel two-six'), (3) trainee confirms the channel switch and calls again on the working channel, " +
      "(4) trainee states the request (weather report Western Baltic), (5) you transmit a short weather report, " +
      "(6) trainee acknowledges and closes with OUT. Mark the exercise complete after the proper closing.",
    rubric: [
      "calling structure and callsign repetitions",
      "correct channel switch confirmation and re-call on working channel",
      "clear, brief statement of the request",
      "acknowledgement of received information and proper closing (OUT)",
      "prowords and phonetic alphabet",
    ],
  },
  {
    id: "mayday",
    useCase: "UC-07",
    title: { en: "Distress call & message (MAYDAY)", de: "Notmeldung absetzen (MAYDAY)" },
    briefing: {
      en: "Fire on board, you must abandon the engine room. Transmit a complete distress call and distress message on channel 16. Scheme: MAYDAY x3 - vessel/callsign/MMSI x3 - MAYDAY + vessel - position - nature of distress - persons on board - assistance required - other info - OVER.",
      de: "Feuer an Bord, der Maschinenraum musste aufgegeben werden. Setzen Sie einen vollstaendigen Notanruf und die Notmeldung auf Kanal 16 ab. Schema: MAYDAY x3 - Schiff/Rufzeichen/MMSI x3 - MAYDAY + Schiff - Position - Art der Not - Personen an Bord - erbetene Hilfe - weitere Angaben - OVER. (Notverkehr immer auf Englisch.)",
    },
    direction:
      "You play the coast station 'Bremen Rescue Radio'. The trainee must transmit a complete distress call and message (always in English, regardless of session language). " +
      "After a sufficiently complete distress message, acknowledge with the proper 'MAYDAY <vessel> ... THIS IS BREMEN RESCUE RADIO ... RECEIVED MAYDAY' scheme and ask one clarifying question if an element is missing. " +
      "If essential elements are missing (position, nature of distress, persons on board), stay in character and request them ('say again your position'). " +
      "Mark the exercise complete once the full distress message has been transmitted and acknowledged.",
    rubric: [
      "distress call: MAYDAY x3, vessel + callsign + MMSI x3",
      "distress message: MAYDAY + vessel, position, nature of distress, persons on board, assistance required, OVER",
      "position format (lat/lon or bearing/distance from a known point)",
      "English language used throughout the distress traffic",
      "no invented prowords, correct ending",
    ],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function buildSystemPrompt(scenario: Scenario, language: Language, setup: SessionSetup): string {
  const langNote =
    language === "de"
      ? "Session language is GERMAN: routine traffic and all feedback are in German. Distress/urgency/safety traffic remains in English per SRC standards."
      : "Session language is ENGLISH: all radio traffic and feedback are in English.";

  return [
    "You are the counterpart station in a VHF marine radio training simulator for the German SRC certificate (Short Range Certificate).",
    "The trainee talks over a simulated half-duplex radio; you receive an imperfect speech-to-text transcript of their transmission.",
    "",
    `Trainee vessel for this session: sailing yacht ${setup.vessel}, callsign ${setup.callsign}, MMSI ${setup.mmsi}, position ${setup.position}.`,
    "",
    "SCENARIO: " + scenario.direction,
    "",
    "EVALUATION RUBRIC (score each transmission against these criteria):",
    ...scenario.rubric.map((r) => "- " + r),
    "",
    "RULES:",
    "- Stay strictly in character as the radio station in the 'reply' field. Keep replies short and realistic (IMO SMCP phraseology). No stage directions, no explanations in the reply.",
    "- Be tolerant of speech-to-text artifacts: 'delta kilo two zero seven seven' may be transcribed oddly; judge intent, not spelling. Do not penalize obvious transcription noise.",
    "- If the transmission is procedurally wrong or incomplete, react like a real station would (ask to 'say again', or respond to what was understandable) - the detailed correction belongs in the evaluation, not in the radio reply.",
    "- " + langNote,
    "",
    "OUTPUT FORMAT: Respond with ONLY a single JSON object, no markdown fences, matching:",
    '{"reply": "<your radio transmission as the station>",',
    ' "evaluation": {"score": <0-100>, "findings": ["<specific issue or praise>", ...], "expected": "<model transmission the trainee should have sent>"},',
    ' "done": <true when the exercise is complete, else false>}',
    "Evaluation language: " + (language === "de" ? "German" : "English") + ".",
  ].join("\n");
}
