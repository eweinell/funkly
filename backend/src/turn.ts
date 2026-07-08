import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { DEFAULT_MODEL_ID, RubricResult, TurnRequestV2, TurnResponseV2 } from "./contracts";
import { buildDialogPrompt } from "./prompts";
import {
  advancePhase,
  aggregateOverallScore,
  checkChannel,
  findPhase,
  fallbackRubric,
  getScenario,
  localize,
  reconcileRubric,
  Phase,
  Scenario,
  Station,
  stationFor,
} from "./scenarios";

const REGION = process.env.AWS_REGION ?? "eu-west-1";
const MODEL_ID = process.env.MODEL_ID ?? DEFAULT_MODEL_ID;

const anthropic = new AnthropicBedrock({ awsRegion: REGION });
const polly = new PollyClient({ region: REGION });

export async function handleTurn(req: TurnRequestV2): Promise<TurnResponseV2> {
  const scenario = getScenario(req.scenarioId);
  if (!scenario) throw Object.assign(new Error(`unknown scenario: ${req.scenarioId}`), { statusCode: 400 });
  if (!req.transcript?.trim()) throw Object.assign(new Error("empty transcript"), { statusCode: 400 });

  const { phase, index } = findPhase(scenario, req.phaseId);
  const defaultStation = stationFor(scenario, phase);

  // Kanal-Mechanik (UI-SPEZIFIKATION §1): bei Abweichung KEIN Bedrock-Call,
  // sondern eine billige "no reply"-Response direkt aus der Engine.
  const channelCheck = checkChannel(phase, req.channel);
  if (!channelCheck.ok) {
    return buildNoReplyResponse(scenario, phase, index, defaultStation, channelCheck.reason, req);
  }

  const system = buildDialogPrompt(scenario, phase, req.language, req.setup, req.channel, req.replayCount);
  const messages = [
    ...req.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: req.transcript },
  ];

  const response = await anthropic.messages.create({
    model: MODEL_ID,
    max_tokens: 1536,
    system,
    messages,
  });

  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");

  const parsed = parseModelTurn(text, scenario, req);

  const speakingStation = scenario.stations.find((s) => s.id === parsed.stationId) ?? defaultStation;
  const audioBase64 = parsed.reply ? await synthesize(parsed.reply, speakingStation) : "";

  return { ...parsed, audioBase64 };
}

function buildNoReplyResponse(
  scenario: Scenario,
  phase: Phase,
  index: number,
  station: Station,
  reason: "wrong-channel" | "channel-70-voice-blocked",
  req: TurnRequestV2
): TurnResponseV2 {
  const completedPhaseIds = scenario.phases.slice(0, index).map((p) => p.id);
  const coaching = req.mode === "training" ? coachingHintFor(phase, reason, req.language) : undefined;
  return {
    reply: "",
    stationId: station.id,
    noReplyReason: reason,
    evaluation: { overallScore: 0, rubric: [] },
    phase: {
      currentPhaseId: phase.id,
      currentIndex: index,
      completedPhaseIds,
      totalPhases: scenario.phases.length,
    },
    coaching,
    done: false,
    audioBase64: "",
  };
}

function coachingHintFor(
  phase: Phase,
  reason: "wrong-channel" | "channel-70-voice-blocked",
  language: TurnRequestV2["language"]
): string {
  if (reason === "channel-70-voice-blocked") {
    return language === "de"
      ? "Kanal 70 ist nur fuer DSC reserviert - fuer Sprechfunk einen anderen Kanal waehlen."
      : "Channel 70 is DSC-only - select a different channel for voice traffic.";
  }
  const ch = phase.expectedChannel !== undefined ? String(phase.expectedChannel) : "?";
  return language === "de" ? `Die Gegenstelle wartet auf Kanal ${ch}.` : `The station is waiting on channel ${ch}.`;
}

interface ParsedTurn {
  reply: string;
  stationId: string;
  noReplyReason?: TurnResponseV2["noReplyReason"];
  evaluation: TurnResponseV2["evaluation"];
  phase: TurnResponseV2["phase"];
  coaching?: string;
  done: boolean;
}

/** Robustes Parsen der Modellantwort (Fallback statt Absturz, wie in M1):
 *  Phasen-Fortschritt und Gesamtscore werden IMMER server-seitig neu berechnet,
 *  nie ungeprueft vom Modell uebernommen (Engine ist massgeblich). */
function parseModelTurn(text: string, scenario: Scenario, req: TurnRequestV2): ParsedTurn {
  const { phase, index } = findPhase(scenario, req.phaseId);
  const defaultStation = stationFor(scenario, phase);

  let obj: Record<string, unknown> | undefined;
  try {
    obj = JSON.parse(extractJson(text));
  } catch {
    obj = undefined;
  }

  if (!obj) {
    const advance = advancePhase(scenario, index, false);
    return {
      reply: text.trim(),
      stationId: defaultStation.id,
      evaluation: { overallScore: 0, rubric: fallbackRubric(scenario, req.language) },
      phase: {
        currentPhaseId: scenario.phases[advance.newIndex].id,
        currentIndex: advance.newIndex,
        completedPhaseIds: advance.completedPhaseIds,
        totalPhases: scenario.phases.length,
      },
      done: false,
    };
  }

  const reply = String(obj.reply ?? "");
  const stationId = scenario.stations.some((s) => s.id === obj?.stationId) ? String(obj.stationId) : defaultStation.id;
  const noReplyReasonRaw = obj.noReplyReason as string | undefined;
  const noReplyReason = (["wrong-channel", "channel-70-voice-blocked", "unintelligible"] as const).includes(
    noReplyReasonRaw as never
  )
    ? (noReplyReasonRaw as TurnResponseV2["noReplyReason"])
    : undefined;

  const phaseDone = Boolean(obj.phaseDone);
  const advance = advancePhase(scenario, index, phaseDone);

  const evalObj = (obj.evaluation ?? {}) as Record<string, unknown>;
  const rubric: RubricResult[] = reconcileRubric(scenario, req.language, evalObj.rubric);
  const overallScore = aggregateOverallScore(rubric, scenario.rubric);
  const expected = evalObj.expected !== undefined ? String(evalObj.expected) : undefined;

  const newPhase = scenario.phases[advance.newIndex];
  const coaching =
    req.mode === "training" && !advance.scenarioDone && newPhase.hints ? localize(newPhase.hints, req.language) : undefined;

  return {
    reply,
    stationId,
    noReplyReason,
    evaluation: { overallScore, rubric, expected },
    phase: {
      currentPhaseId: newPhase.id,
      currentIndex: advance.newIndex,
      completedPhaseIds: advance.completedPhaseIds,
      totalPhases: scenario.phases.length,
    },
    coaching,
    done: advance.scenarioDone,
  };
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

async function synthesize(text: string, station: Station): Promise<string> {
  const voice = station.voice;
  const res = await polly.send(
    new SynthesizeSpeechCommand({
      Text: text,
      VoiceId: voice.voiceId as any,
      Engine: voice.engine ?? "neural",
      OutputFormat: "mp3",
      SampleRate: "24000",
      LanguageCode: voice.language as any,
    })
  );
  const bytes = await res.AudioStream?.transformToByteArray();
  if (!bytes) throw new Error("polly returned no audio");
  return Buffer.from(bytes).toString("base64");
}
