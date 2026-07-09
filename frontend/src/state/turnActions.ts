import { useCallback, useRef, useState } from "react";
import { api, Channel, Language, PanelMode, TurnResponseV2 } from "../api";
import { PttRecorder, durationSeconds } from "../audio/pttRecorder";
import { transcribeClip } from "../audio/transcribe";
import { playRadio, stopPlayback, loadAudioSettings, unlockRadioContext } from "../audio/radioFx";
import * as sounds from "../audio/sounds";
import { t } from "../i18n";
import type { SessionAction, SessionState } from "./types";

/** CH70 ist am echten Geraet fuer Sprechfunk gesperrt (nur DSC), UI-SPEZIFIKATION §1. */
export function isVoiceBlockedChannel(channel: Channel): boolean {
  return String(channel) === "70";
}

/**
 * Turn-Ablauf (PTT-Zyklus) als Funktionen des Session-Store (UI-SPEZIFIKATION §8:
 * "Turn-Ablauf ... wird eine Funktion im Session-Store, Komponenten loesen nur
 * Aktionen aus."). Als Hook implementiert, damit Recorder/Token als Refs leben.
 */
export function useTurnEngine(
  state: SessionState,
  dispatch: React.Dispatch<SessionAction>,
  language: Language,
  panelMode: PanelMode
) {
  const recorder = useRef(new PttRecorder());
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const turnToken = useRef(0);
  const [ch70Flash, setCh70Flash] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  const resetHistory = useCallback(() => {
    history.current = [];
  }, []);

  const flashCh70 = useCallback(() => {
    sounds.ch70ErrorTone();
    setCh70Flash(true);
    window.setTimeout(() => setCh70Flash(false), 1100);
  }, []);

  const endTurn = useCallback(
    async (myToken: number) => {
      const s = stateRef.current;
      if (!recorder.current.recording || !s.scenario || !s.setup) return;
      dispatch({ type: "SET_STATUS", status: "stt" });
      const strings = t(language);
      try {
        const chunks = await recorder.current.stop();
        const seconds = durationSeconds(chunks);
        if (seconds < 0.4) {
          console.warn("[turn] noCopy: Clip zu kurz", { seconds });
          dispatch({ type: "APPEND_LOG", entry: { kind: "system", text: strings.noCopy } });
          return;
        }
        const transcript = await transcribeClip(chunks, language);
        if (!transcript) {
          console.warn("[turn] noCopy: Transcribe lieferte leeres Transkript", { seconds, language });
          dispatch({ type: "APPEND_LOG", entry: { kind: "system", text: strings.noCopy } });
          return;
        }
        console.debug("[turn] transcript", { seconds, transcript });
        dispatch({ type: "APPEND_LOG", entry: { kind: "user", text: transcript } });
        dispatch({ type: "SET_STATUS", status: "station" });
        sounds.startIdleNoise(0.015 + loadAudioSettings().squelch * 0.02);

        const result: TurnResponseV2 = await api.turn({
          scenarioId: s.scenario.id,
          language,
          mode: panelMode,
          setup: s.setup,
          history: history.current,
          transcript,
          channel: s.channel.current,
          phaseId: s.phase?.currentPhaseId,
          replayCount: s.replayCount,
        });

        sounds.stopIdleNoise();

        if (result.noReplyReason === "wrong-channel") {
          dispatch({ type: "NOTE_WRONG_CHANNEL" });
          // Coaching erst NACH dem 2. Fehlversuch (UI-SPEZIFIKATION §1, training-only).
          // Das Backend sendet `coaching` derzeit bei JEDEM Fehlversuch (Vertragsluecke:
          // kein Attempt-Zaehler im Request, s. api.ts) - deshalb hier clientseitig
          // gaten. Die Bedingung gilt fuer beide Quellen (Server-Coaching UND den
          // Fallback aus den Phasen-Hints), sonst erschiene die Zeile schon bei Versuch 1.
          const wrongAttempts = s.channel.wrongAttempts + 1;
          const coachingEligible = panelMode === "training" && wrongAttempts >= 2;
          const fallbackCoaching = coachingEligible
            ? s.scenario?.phases?.find((p) => p.id === (s.phase?.currentPhaseId ?? s.scenario?.phases?.[0]?.id))?.hints?.[
                language
              ]
            : undefined;
          dispatch({
            type: "APPEND_LOG",
            entry: {
              kind: "system",
              text: strings.noReplyWrongChannel(String(s.channel.current)),
              coaching: coachingEligible ? result.coaching ?? fallbackCoaching : undefined,
            },
          });
          return;
        }

        dispatch({ type: "RESET_WRONG_CHANNEL" });
        history.current.push({ role: "user", content: transcript });
        history.current.push({ role: "assistant", content: result.reply });
        dispatch({
          type: "APPEND_LOG",
          entry: { kind: "station", text: result.reply, evaluation: result.evaluation, coaching: result.coaching },
        });
        dispatch({ type: "SET_PHASE", phase: result.phase });
        if (result.done) dispatch({ type: "SET_DONE" });

        if (result.audioBase64) {
          dispatch({ type: "SET_STATUS", status: "tx-play" });
          const settings = loadAudioSettings();
          await playRadio(result.audioBase64, { volume: settings.volume, noise: settings.squelch });
        }
      } catch (e) {
        dispatch({ type: "SET_ERROR", error: String(e) });
      } finally {
        sounds.stopIdleNoise();
        // Barge-in-Schutz: nur zuruecksetzen, wenn zwischenzeitlich kein neuerer
        // PTT-Zyklus begonnen hat (sonst wuerde das eine laufende Aufnahme abwuergen).
        if (turnToken.current === myToken) dispatch({ type: "SET_STATUS", status: "idle" });
      }
    },
    [dispatch, language, panelMode]
  );

  /** true waehrend STT/Modell-Verarbeitung: PTT bleibt kurz gesperrt (§7). Waehrend
   *  "tx-play" (Gegenstelle spricht) ist PTT dagegen erlaubt (Barge-in). */
  const pttLocked = state.status === "stt" || state.status === "station";

  const pttDown = useCallback(async () => {
    if (!state.scenario || !state.setup || state.done || pttLocked) return;
    if (isVoiceBlockedChannel(state.channel.current)) {
      flashCh70();
      return;
    }
    dispatch({ type: "SET_ERROR", error: null });
    // Barge-in: eine laufende Wiedergabe der Gegenstelle wird sofort gestoppt.
    stopPlayback();
    sounds.stopIdleNoise();
    turnToken.current += 1;
    const myToken = turnToken.current;
    // Quittungssounds sind rein kosmetisch: ein Fehler hier darf die Aufnahme
    // niemals verhindern (sonst bleibt der Status auf "idle" und pttUp verwirft
    // den Turn stillschweigend).
    try {
      await unlockRadioContext();
      await sounds.unlockAudio();
      sounds.pttClick();
    } catch (e) {
      console.warn("[ptt] Quittungssound fehlgeschlagen, Aufnahme laeuft weiter", e);
    }
    try {
      dispatch({ type: "SET_STATUS", status: "rx" });
      await recorder.current.start();
    } catch (e) {
      dispatch({ type: "SET_STATUS", status: "idle" });
      dispatch({ type: "SET_ERROR", error: "Mikrofon: " + String(e) });
    }
    return myToken;
  }, [state.scenario, state.setup, state.done, state.channel.current, pttLocked, dispatch, flashCh70]);

  const pttUp = useCallback(() => {
    if (state.status !== "rx") return;
    sounds.squelchTail();
    void endTurn(turnToken.current);
  }, [state.status, endTurn]);

  return { pttDown, pttUp, pttLocked, ch70Flash, resetHistory, historyRef: history };
}
