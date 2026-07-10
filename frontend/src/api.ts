/**
 * API-Client. Typen spiegeln backend/src/contracts.ts (Turn-API v2, read-only
 * fuer dieses Paket — Aenderungswuensche gehen als Bericht an die Hauptsession).
 *
 * BEKANNTE VERTRAGSLUECKEN (an funkly-prompt-engineer/funkly-backend gemeldet):
 * 1) Fuer den Phasen-Stepper (UI-SPEZIFIKATION §3) braucht das UI die vollstaendige,
 *    geordnete Phasenliste eines Szenarios (id + label DE/EN) VOR dem ersten Turn —
 *    TurnResponseV2.phase liefert das erst nach jedem Turn und nur fuer die bereits
 *    erreichte Phase. `ScenarioInfo.phases` ist daher hier als optionale Erweiterung
 *    ergaenzt; ist sie nicht vorhanden (aelteres Backend), degradiert der Stepper auf
 *    eine reine Index-Anzeige ("Schritt 2 von 4").
 * 2) Der "Coaching nach dem 2. Fehlversuch auf falschem Kanal"-Mechanismus
 *    (UI-SPEZIFIKATION §1) braucht entweder Server-Sessionstate oder einen
 *    Attempt-Zaehler im Request, um zu wissen, dass es der zweite Fehlversuch
 *    war — TurnRequestV2 hat kein solches Feld, und fehlgeschlagene Turns
 *    landen nicht in `history`. Bis das nachgezogen ist, erzeugt der Client die
 *    Coaching-Zeile selbst aus `ScenarioPhaseInfo.hints` (ebenfalls optionale
 *    Erweiterung hier), sobald `channel.wrongAttempts >= 2` erreicht ist.
 */

import { getStoredAccessCode, invalidateAccessCode } from "./access/accessCode";

export type Language = "en" | "de";
export type PanelMode = "training" | "compact" | "exam";
export type Channel = number | string;
export type Verdict = "pass" | "partial" | "fail" | "n-a";

export interface ScenarioPhaseInfo {
  id: string;
  label: Record<Language, string>;
  /** Optionale Erweiterung fuer die clientseitige Wrong-Channel-Coaching-Zeile, s. o. */
  hints?: Record<Language, string>;
}

export interface ScenarioInfo {
  id: string;
  useCase: string;
  title: Record<Language, string>;
  briefing: Record<Language, string>;
  /** Optionale Erweiterung, s. Luecken-Hinweis oben. */
  phases?: ScenarioPhaseInfo[];
}

export interface SessionSetup {
  vessel: string;
  callsign: string;
  mmsi: string;
  position: string;
  /** Je Session gezogener Arbeitskanal; loest `expectedChannel: "working"` auf. */
  workingChannel?: Channel;
}

export interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface RubricResult {
  id: string;
  verdict: Verdict;
  score: number;
  finding: string;
}

export interface TurnEvaluation {
  overallScore: number;
  rubric: RubricResult[];
  expected?: string;
}

export interface PhaseState {
  currentPhaseId: string;
  currentIndex: number;
  completedPhaseIds: string[];
  totalPhases: number;
}

export interface TurnRequestV2 {
  scenarioId: string;
  language: Language;
  mode: PanelMode;
  setup: SessionSetup;
  history: HistoryEntry[];
  transcript: string;
  channel: Channel;
  phaseId?: string;
  replayCount?: number;
}

export interface TurnResponseV2 {
  reply: string;
  stationId: string;
  noReplyReason?: "wrong-channel" | "channel-70-voice-blocked" | "unintelligible";
  evaluation: TurnEvaluation;
  phase: PhaseState;
  coaching?: string;
  done: boolean;
  audioBase64: string;
}

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

/**
 * Zugangsschutz V1 (s. UMSETZUNGSPLAN.md, Querschnittspaket): jede Anfrage
 * traegt den geteilten Zugangscode im Header `x-funkly-access`. Der Header
 * `x-funkly-origin` wird serverseitig von CloudFront gesetzt — der Client
 * fasst ihn nicht an. Der Dev-Mock (`frontend/dev/mock-server.mjs`) ignoriert
 * den Header, d.h. lokal gibt es keinen echten Schutz.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const accessCode = getStoredAccessCode();
  if (accessCode) headers.set("x-funkly-access", accessCode);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    // Zugangscode fehlt oder ist falsch: verwerfen, das Gate zeigt sich neu.
    invalidateAccessCode();
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export const api = {
  scenarios: () => request<{ scenarios: ScenarioInfo[] }>("/api/scenarios"),
  // scenarioId ist Pflicht: ohne ihn zieht der Server die Stammdaten aus den
  // Pools des ERSTEN geladenen Szenarios (Arbeitskanal, Position, Schiff) statt
  // aus denen des gewaehlten - siehe backend/src/handler.ts (/api/session).
  newSession: (scenarioId: string, language: Language) =>
    request<{ setup: SessionSetup }>("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId, language }),
    }),
  sttCredentials: () =>
    request<{
      region: string;
      credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: string };
    }>("/api/stt-credentials"),
  turn: (body: TurnRequestV2) =>
    request<TurnResponseV2>("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
};
