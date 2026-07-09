import { useCallback, useRef, useState } from "react";
import { api, Channel, Language, PanelMode, TurnResponseV2 } from "../api";
import { PttRecorder, durationSeconds } from "../audio/pttRecorder";
import { startTranscription, TranscribeSession } from "../audio/transcribe";
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
  // Die zum aktuellen turnToken gehoerende, laufende Transcribe-Session (STT-Echtzeit,
  // BRIEFING-STT-ECHTZEIT.md Schritt 4). Traegt den Token mit, damit pttDown eine noch
  // offene Session einer ueberholten Runde (Barge-in) sicher erkennen und abbrechen kann.
  const activeSession = useRef<{ token: number; session: TranscribeSession } | undefined>(undefined);
  // Aufloesung, sobald pttDown seinen Startvorgang abgeschlossen hat (Recorder laeuft,
  // Session steht bzw. beides ist fehlgeschlagen). Ein kurzes Antippen der Sprechtaste
  // laesst pttUp feuern, waehrend pttDown noch in `getUserMedia()` haengt: endTurn saehe
  // dann `recording === false`, kehrte vor dem try zurueck - und pttDown oeffnete danach
  // eine Session, die niemand mehr schliesst (offener Transcribe-Stream, laufendes Mikro).
  // Deshalb wartet endTurn den Start ab, statt einen Zwischenzustand zu inspizieren.
  const startup = useRef<Promise<void> | undefined>(undefined);
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
      // Erst den Startvorgang zu Ende laufen lassen (s. `startup` oben), sonst
      // beurteilen wir Recorder und Session, bevor es sie gibt.
      await startup.current;
      const s = stateRef.current;
      if (!recorder.current.recording || !s.scenario || !s.setup) {
        // Startvorgang fehlgeschlagen (pttDown hat Status/Fehler bereits gesetzt und
        // seine Session abgebrochen). Eine dennoch offene Session darf nicht bleiben.
        if (activeSession.current?.token === myToken) {
          activeSession.current.session.abort();
          activeSession.current = undefined;
        }
        return;
      }
      dispatch({ type: "SET_STATUS", status: "stt" });
      const strings = t(language);
      // Die zu diesem Turn gehoerende Session (falls pttDown eine oeffnen konnte -
      // bei Mikrofon-/Netzfehlern in pttDown kann sie fehlen, s. dort).
      const mySession = activeSession.current?.token === myToken ? activeSession.current.session : undefined;
      const releaseSession = () => {
        if (activeSession.current?.token === myToken) activeSession.current = undefined;
      };
      try {
        const chunks = await recorder.current.stop();
        const seconds = durationSeconds(chunks);
        if (seconds < 0.4) {
          console.warn("[turn] noCopy: Clip zu kurz", { seconds });
          // Transcribe-Streaming wird nach gesendeter Audiosekunde abgerechnet - ein
          // zu kurzer Clip liefert ohnehin kein brauchbares Transkript, also sofort
          // abbrechen statt den Stille-Nachlauf von finish() abzuwarten.
          mySession?.abort();
          releaseSession();
          dispatch({ type: "APPEND_LOG", entry: { kind: "system", text: strings.noCopy } });
          return;
        }
        const transcript = mySession ? await mySession.finish() : "";
        releaseSession();
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
        // abort() ist ein No-op, falls finish()/abort() diesen Turn schon
        // abgeschlossen hat (s. transcribe.ts) - hier trotzdem unbedingt aufrufen,
        // damit ein Fehler VOR dem regulaeren finish()-Aufruf keinen offenen
        // Stream zuruecklaesst.
        mySession?.abort();
        releaseSession();
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
    // Ab hier laeuft ein Startvorgang, auf den endTurn warten muss. `finished` wird
    // im finally unten IMMER aufgeloest - auch auf jedem Fehlerpfad, sonst haengt ein
    // spaeteres endTurn ewig.
    let finished!: () => void;
    startup.current = new Promise<void>((resolve) => (finished = resolve));
    // Barge-in-Absicherung: sollte von einer ueberholten Runde noch eine offene
    // Transcribe-Session haengen (sie haette denselben Turn-Zyklus laengst per
    // finish()/abort() schliessen muessen), hier aktiv abbrechen statt sie nur
    // stillschweigend zu verwaisen - ein nicht geschlossener Stream kostet weiter.
    if (activeSession.current && activeSession.current.token !== myToken) {
      activeSession.current.session.abort();
      activeSession.current = undefined;
    }
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
    // Ausserhalb des try deklariert, damit der catch-Block darauf zugreifen und
    // eine bereits eroeffnete Session auch bei einem unerwarteten Fehler
    // zuverlaessig abbrechen kann (kein offener Stream darf zurueckbleiben).
    let session: TranscribeSession | undefined;
    try {
      dispatch({ type: "SET_STATUS", status: "rx" });
      // Recorder und Transcribe-Session starten GEMEINSAM (BRIEFING-STT-ECHTZEIT.md
      // Schritt 4): der Recorder braucht sofort einen onPcm-Callback, die Session
      // steht aber erst nach ihrem eigenen (evtl. schon vorgewaermten) Netz-Roundtrip.
      // Bis dahin auftretende Frames werden gepuffert statt verworfen zu werden.
      const pending: Int16Array[] = [];
      const forwardPcm = (frame: Int16Array) => {
        if (session) session.pushPcm(frame);
        else pending.push(frame);
      };
      const [recResult, sessResult] = await Promise.allSettled([
        recorder.current.start(forwardPcm),
        startTranscription(language),
      ]);
      if (sessResult.status === "fulfilled") session = sessResult.value;
      if (recResult.status === "rejected" || sessResult.status === "rejected") {
        // Mikrofon- oder Session-Fehler: keine offene Session zuruecklassen (Schritt 4).
        session?.abort();
        await recorder.current.stop().catch(() => undefined);
        const reason = recResult.status === "rejected" ? recResult.reason : sessResult.status === "rejected" ? sessResult.reason : undefined;
        dispatch({ type: "SET_STATUS", status: "idle" });
        dispatch({ type: "SET_ERROR", error: "Mikrofon: " + String(reason) });
        return;
      }
      if (!session) {
        // Kann durch die Pruefung oben eigentlich nie eintreten - rein defensiv
        // (und fuers TS-Narrowing, das `session` wegen der Closure forwardPcm
        // nicht ueber diesen Punkt hinaus als sicher gesetzt betrachtet).
        dispatch({ type: "SET_STATUS", status: "idle" });
        dispatch({ type: "SET_ERROR", error: "Mikrofon: STT-Session fehlt" });
        return;
      }
      for (const frame of pending) session.pushPcm(frame);
      activeSession.current = { token: myToken, session };
    } catch (e) {
      session?.abort();
      dispatch({ type: "SET_STATUS", status: "idle" });
      dispatch({ type: "SET_ERROR", error: "Mikrofon: " + String(e) });
    } finally {
      // Auf JEDEM Pfad - auch den beiden `return`s oben: ein wartendes endTurn
      // darf niemals haengen bleiben.
      finished();
    }
    return myToken;
  }, [state.scenario, state.setup, state.done, state.channel.current, pttLocked, dispatch, flashCh70, language]);

  const pttUp = useCallback(() => {
    if (state.status !== "rx") return;
    sounds.squelchTail();
    void endTurn(turnToken.current);
  }, [state.status, endTurn]);

  return { pttDown, pttUp, pttLocked, ch70Flash, resetHistory, historyRef: history };
}
