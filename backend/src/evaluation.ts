/**
 * Bewertungs-Geruest (Sonnet, `EVAL_MODEL_ID`) — Welle 1 legt nur das Fundament
 * fuer den spaeteren Abschluss-/Pruefungspfad (UC-09 Diktat, UC-17 Pruefungs-
 * simulation, Welle 2). Es wird NICHT pro Dialog-Turn aufgerufen (das bleibt
 * Haiku, siehe turn.ts) — nur ueber den eigenen Endpoint POST /api/evaluate,
 * z. B. am Ende einer Uebung fuer eine gruendlichere Nachbewertung.
 */
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { DEFAULT_EVAL_MODEL_ID, HistoryEntry, Language } from "./contracts";
import { buildEvaluationPrompt } from "./prompts";
import { aggregateOverallScore, fallbackRubric, getScenario, reconcileRubric, SessionSetup } from "./scenarios";

const REGION = process.env.AWS_REGION ?? "eu-west-1";
const EVAL_MODEL_ID = process.env.EVAL_MODEL_ID ?? DEFAULT_EVAL_MODEL_ID;

const anthropic = new AnthropicBedrock({ awsRegion: REGION });

export interface EvaluateRequest {
  scenarioId: string;
  language: Language;
  setup: SessionSetup;
  history: HistoryEntry[];
  /** Nutzerspruch, der gruendlich bewertet werden soll (z. B. der letzte Turn
   *  einer Uebung, oder ein einzelner Ausschnitt fuer eine Nachbewertung). */
  transcript: string;
  phaseId?: string;
  channel?: string | number;
  replayCount?: number;
}

export interface EvaluateResponse {
  overallScore: number;
  rubric: { id: string; verdict: string; score: number; finding: string }[];
  expected?: string;
}

export async function evaluateTranscript(req: EvaluateRequest): Promise<EvaluateResponse> {
  const scenario = getScenario(req.scenarioId);
  if (!scenario) throw Object.assign(new Error(`unknown scenario: ${req.scenarioId}`), { statusCode: 400 });
  if (!req.transcript?.trim()) throw Object.assign(new Error("empty transcript"), { statusCode: 400 });

  const historyText = req.history.map((h) => `${h.role === "user" ? "TRAINEE" : "STATION"}: ${h.content}`).join("\n");

  const system = buildEvaluationPrompt(
    scenario,
    req.language,
    req.setup,
    req.phaseId ?? scenario.phases[0].id,
    req.channel ?? "",
    req.replayCount,
    historyText,
    req.transcript
  );

  const response = await anthropic.messages.create({
    model: EVAL_MODEL_ID,
    max_tokens: 1536,
    system,
    messages: [{ role: "user", content: "Grade the trainee transmission above per Block C." }],
  });

  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");

  let obj: Record<string, unknown> | undefined;
  try {
    obj = JSON.parse(extractJson(text));
  } catch {
    obj = undefined;
  }

  const rubric = obj ? reconcileRubric(scenario, req.language, obj.rubric) : fallbackRubric(scenario, req.language);
  const overallScore = aggregateOverallScore(rubric, scenario.rubric);
  const expected = obj?.expected !== undefined ? String(obj.expected) : undefined;

  return { overallScore, rubric, expected };
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}
