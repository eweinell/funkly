/**
 * Session-Store: Typen (UI-SPEZIFIKATION.md §8).
 * Mirror der Turn-API-v2-Vertragstypen aus backend/src/contracts.ts (read-only) —
 * die kanonischen Typen bleiben dort; hier nur, was der Client zusaetzlich haelt.
 */
import type { Channel, Language, PanelMode, ScenarioInfo, SessionSetup, TurnEvaluation } from "../api";

export type TxStatus = "idle" | "rx" | "stt" | "station" | "tx-play";

export interface LogEntry {
  kind: "user" | "station" | "system";
  text: string;
  evaluation?: TurnEvaluation;
  coaching?: string;
}

/** Channel-Mechanik-Zustand (UI-SPEZIFIKATION §1). */
export interface ChannelState {
  current: Channel;
  /** Anzahl aufeinanderfolgender Fehlversuche auf falschem Kanal (fuer Coaching-Trigger). */
  wrongAttempts: number;
}

export interface SessionState {
  language: Language;
  scenarios: ScenarioInfo[];
  scenario: ScenarioInfo | null;
  setup: SessionSetup | null;
  status: TxStatus;
  done: boolean;
  log: LogEntry[];
  channel: ChannelState;
  error: string | null;
  panelMode: PanelMode;
  replayCount: number;
  /** Letzte Phase laut Server (fuer Stepper/Coaching); null vor dem ersten Turn. */
  phase: {
    currentPhaseId: string;
    currentIndex: number;
    completedPhaseIds: string[];
    totalPhases: number;
  } | null;
}

export type SessionAction =
  | { type: "SET_LANGUAGE"; language: Language }
  | { type: "SET_SCENARIOS"; scenarios: ScenarioInfo[] }
  | { type: "START_SCENARIO"; scenario: ScenarioInfo }
  | { type: "SET_SETUP"; setup: SessionSetup }
  | { type: "SET_STATUS"; status: TxStatus }
  | { type: "APPEND_LOG"; entry: LogEntry }
  | { type: "SET_CHANNEL"; channel: Channel }
  | { type: "NOTE_WRONG_CHANNEL" }
  | { type: "RESET_WRONG_CHANNEL" }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_DONE" }
  | { type: "SET_PHASE"; phase: SessionState["phase"] }
  | { type: "SET_PANEL_MODE"; mode: PanelMode }
  | { type: "INCREMENT_REPLAY" }
  | { type: "END_SESSION" };
