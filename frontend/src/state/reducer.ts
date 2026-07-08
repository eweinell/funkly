import type { SessionAction, SessionState } from "./types";

export const initialSessionState: SessionState = {
  language: "en",
  scenarios: [],
  scenario: null,
  setup: null,
  status: "idle",
  done: false,
  log: [],
  channel: { current: 16, wrongAttempts: 0 },
  error: null,
  panelMode: "training",
  replayCount: 0,
  phase: null,
};

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "SET_LANGUAGE":
      return { ...state, language: action.language };
    case "SET_SCENARIOS":
      return { ...state, scenarios: action.scenarios };
    case "START_SCENARIO":
      return {
        ...state,
        scenario: action.scenario,
        setup: null,
        done: false,
        log: [],
        channel: { current: 16, wrongAttempts: 0 },
        phase: null,
        replayCount: 0,
        error: null,
      };
    case "SET_SETUP":
      return { ...state, setup: action.setup };
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "APPEND_LOG":
      return { ...state, log: [...state.log, action.entry] };
    case "SET_CHANNEL":
      return { ...state, channel: { current: action.channel, wrongAttempts: 0 } };
    case "NOTE_WRONG_CHANNEL":
      return { ...state, channel: { ...state.channel, wrongAttempts: state.channel.wrongAttempts + 1 } };
    case "RESET_WRONG_CHANNEL":
      return { ...state, channel: { ...state.channel, wrongAttempts: 0 } };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "SET_DONE":
      return { ...state, done: true };
    case "SET_PHASE":
      return { ...state, phase: action.phase };
    case "SET_PANEL_MODE":
      return { ...state, panelMode: action.mode };
    case "INCREMENT_REPLAY":
      return { ...state, replayCount: state.replayCount + 1 };
    case "END_SESSION":
      return { ...state, scenario: null };
    default:
      return state;
  }
}
