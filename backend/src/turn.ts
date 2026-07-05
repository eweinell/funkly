import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { buildSystemPrompt, getScenario, Language, SessionSetup } from "./scenarios";

const REGION = process.env.AWS_REGION ?? "eu-west-1";
const MODEL_ID = process.env.MODEL_ID ?? "anthropic.claude-haiku-4-5";

const anthropic = new AnthropicBedrockMantle({ awsRegion: REGION });
const polly = new PollyClient({ region: REGION });

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface TurnRequest {
  scenarioId: string;
  language: Language;
  setup: SessionSetup;
  history: HistoryEntry[];
  transcript: string;
}

export interface TurnResponse {
  reply: string;
  evaluation: { score: number; findings: string[]; expected: string };
  done: boolean;
  audioBase64: string; // MP3 der Antwort
}

const VOICES: Record<Language, { voiceId: string; engine: "neural" }> = {
  en: { voiceId: "Amy", engine: "neural" }, // en-GB
  de: { voiceId: "Vicki", engine: "neural" }, // de-DE
};

export async function handleTurn(req: TurnRequest): Promise<TurnResponse> {
  const scenario = getScenario(req.scenarioId);
  if (!scenario) throw Object.assign(new Error(`unknown scenario: ${req.scenarioId}`), { statusCode: 400 });
  if (!req.transcript?.trim()) throw Object.assign(new Error("empty transcript"), { statusCode: 400 });

  const system = buildSystemPrompt(scenario, req.language, req.setup);

  const messages = [
    ...req.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: req.transcript },
  ];

  const response = await anthropic.messages.create({
    model: MODEL_ID,
    max_tokens: 1024,
    system,
    messages,
  });

  const text = response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = parseModelJson(text);

  // Notverkehr bleibt englisch - Stimme passend zur Antwortsprache waehlen
  const voice = req.scenarioId === "mayday" ? VOICES.en : VOICES[req.language];
  const audioBase64 = await synthesize(parsed.reply, voice.voiceId, voice.engine);

  return { ...parsed, audioBase64 };
}

function parseModelJson(text: string): { reply: string; evaluation: TurnResponse["evaluation"]; done: boolean } {
  const candidate = extractJson(text);
  try {
    const obj = JSON.parse(candidate);
    return {
      reply: String(obj.reply ?? ""),
      evaluation: {
        score: Number(obj.evaluation?.score ?? 0),
        findings: Array.isArray(obj.evaluation?.findings) ? obj.evaluation.findings.map(String) : [],
        expected: String(obj.evaluation?.expected ?? ""),
      },
      done: Boolean(obj.done),
    };
  } catch {
    // Fallback: Modellausgabe als Reply behandeln, ohne Bewertung
    return {
      reply: text.trim(),
      evaluation: { score: 0, findings: ["(Bewertung konnte nicht geparst werden)"], expected: "" },
      done: false,
    };
  }
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

async function synthesize(text: string, voiceId: string, engine: "neural"): Promise<string> {
  const res = await polly.send(
    new SynthesizeSpeechCommand({
      Text: text,
      VoiceId: voiceId as any,
      Engine: engine,
      OutputFormat: "mp3",
      SampleRate: "24000",
    })
  );
  const bytes = await res.AudioStream?.transformToByteArray();
  if (!bytes) throw new Error("polly returned no audio");
  return Buffer.from(bytes).toString("base64");
}
