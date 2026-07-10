import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import { api, Channel, Language, PanelMode, ScenarioInfo } from "../api";
import { AudioSettings, loadAudioSettings, saveAudioSettings } from "../audio/radioFx";
import { warmupTranscribeClient } from "../audio/transcribe";
import * as sounds from "../audio/sounds";
import { initialSessionState, sessionReducer } from "./reducer";
import { SessionState } from "./types";
import { useTurnEngine } from "./turnActions";

interface SessionContextValue {
  state: SessionState;
  language: Language;
  setLanguage: (l: Language) => void;
  panelMode: PanelMode;
  setPanelMode: (m: PanelMode) => void;
  startScenario: (s: ScenarioInfo) => void;
  endSession: () => void;
  setChannel: (c: Channel) => void;
  appendSystemLog: (text: string) => void;
  pttDown: () => void;
  pttUp: () => void;
  pttLocked: boolean;
  ch70Flash: boolean;
  audioSettings: AudioSettings;
  setAudioSettings: (s: AudioSettings) => void;
}

const SessionCtx = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [language, setLanguageState] = useState<Language>("en");
  const [panelMode, setPanelModeState] = useState<PanelMode>("training");
  const [audioSettings, setAudioSettingsState] = useState<AudioSettings>(() => loadAudioSettings());

  const { pttDown, pttUp, pttLocked, ch70Flash, resetHistory } = useTurnEngine(state, dispatch, language, panelMode);

  useEffect(() => {
    api
      .scenarios()
      .then((r) => dispatch({ type: "SET_SCENARIOS", scenarios: r.scenarios }))
      .catch((e) => dispatch({ type: "SET_ERROR", error: String(e) }));
  }, []);

  const setLanguage = useCallback((l: Language) => setLanguageState(l), []);
  const setPanelMode = useCallback((m: PanelMode) => setPanelModeState(m), []);

  const setAudioSettings = useCallback((s: AudioSettings) => {
    setAudioSettingsState(s);
    saveAudioSettings(s);
  }, []);

  const startScenario = useCallback(
    (s: ScenarioInfo) => {
      dispatch({ type: "SET_ERROR", error: null });
      dispatch({ type: "START_SCENARIO", scenario: s });
      resetHistory();
      api
        .newSession(s.id, language)
        .then((r) => dispatch({ type: "SET_SETUP", setup: r.setup }))
        .catch((e) => dispatch({ type: "SET_ERROR", error: String(e) }));
      // STT-Credentials vorwaermen (BRIEFING-STT-ECHTZEIT.md Schritt 5): der erste
      // pttDown soll nicht auf den STS-Roundtrip warten - der saesse sonst zwischen
      // Tastendruck und erstem Audio-Frame.
      warmupTranscribeClient();
    },
    [resetHistory, language]
  );

  const endSession = useCallback(() => dispatch({ type: "END_SESSION" }), []);

  const appendSystemLog = useCallback(
    (text: string) => dispatch({ type: "APPEND_LOG", entry: { kind: "system", text } }),
    []
  );

  const setChannel = useCallback(
    (c: Channel) => {
      if (state.status !== "idle") return;
      sounds.channelBeep();
      dispatch({ type: "SET_CHANNEL", channel: c });
    },
    [state.status]
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      language,
      setLanguage,
      panelMode,
      setPanelMode,
      startScenario,
      endSession,
      setChannel,
      appendSystemLog,
      pttDown,
      pttUp,
      pttLocked,
      ch70Flash,
      audioSettings,
      setAudioSettings,
    }),
    [
      state,
      language,
      setLanguage,
      panelMode,
      setPanelMode,
      startScenario,
      endSession,
      setChannel,
      appendSystemLog,
      pttDown,
      pttUp,
      pttLocked,
      ch70Flash,
      audioSettings,
      setAudioSettings,
    ]
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
