export type Language = "en" | "de";

export interface ScenarioInfo {
  id: string;
  useCase: string;
  title: Record<Language, string>;
  briefing: Record<Language, string>;
}

export interface SessionSetup {
  vessel: string;
  callsign: string;
  mmsi: string;
  position: string;
}

export interface Evaluation {
  score: number;
  findings: string[];
  expected: string;
}

export interface TurnResult {
  reply: string;
  evaluation: Evaluation;
  done: boolean;
  audioBase64: string;
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export const api = {
  scenarios: () => request<{ scenarios: ScenarioInfo[] }>("/api/scenarios"),
  newSession: () => request<{ setup: SessionSetup }>("/api/session", { method: "POST" }),
  sttCredentials: () =>
    request<{
      region: string;
      credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: string };
    }>("/api/stt-credentials"),
  turn: (body: {
    scenarioId: string;
    language: Language;
    setup: SessionSetup;
    history: { role: "user" | "assistant"; content: string }[];
    transcript: string;
  }) =>
    request<TurnResult>("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
};
