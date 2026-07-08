import { useCallback, useReducer, useRef } from "react";
import * as sounds from "../../../audio/sounds";

/**
 * DSC-Bedienteil-Zustandsmaschine (UI-SPEZIFIKATION §2): flaches Softkey-Modell,
 * max. 2 Ebenen. Rein clientseitig simuliert (Klappe, Countdown, ACK-Timing) —
 * die anschliessende Sprechfunk-Phase laeuft ueber die normale Turn-API (UC-07).
 */
export type DscScreen =
  | "closed"
  | "nature"
  | "armed"
  | "countdown"
  | "waiting-ack"
  | "goto16"
  | "menu"
  | "individual-mmsi"
  | "individual-channel"
  | "individual-waiting-ack"
  | "individual-goto"
  | "alert-received"
  | "cancel-confirm"
  | "cancel-sent";

export interface DscState {
  screen: DscScreen;
  nature: string | null;
  countdownStep: 0 | 1 | 2 | 3;
  mmsi: string;
  workingChannel: number | null;
  alertPending: boolean;
}

const initialDscState: DscState = {
  screen: "closed",
  nature: null,
  countdownStep: 0,
  mmsi: "",
  workingChannel: null,
  alertPending: false,
};

type DscAction =
  | { type: "OPEN_FLAP" }
  | { type: "CLOSE_FLAP" }
  | { type: "OPEN_NATURE" }
  | { type: "SET_NATURE"; nature: string }
  | { type: "COUNTDOWN_STEP"; step: DscState["countdownStep"] }
  | { type: "ABORT_COUNTDOWN" }
  | { type: "SENT" }
  | { type: "ACK_RECEIVED" }
  | { type: "OPEN_MENU" }
  | { type: "INDIVIDUAL_START" }
  | { type: "INDIVIDUAL_MMSI"; mmsi: string }
  | { type: "INDIVIDUAL_CHANNEL"; channel: number }
  | { type: "INDIVIDUAL_SENT" }
  | { type: "INDIVIDUAL_ACK" }
  | { type: "TRIGGER_INCOMING_ALERT" }
  | { type: "DISMISS_ALERT" }
  | { type: "OPEN_CANCEL_CONFIRM" }
  | { type: "CONFIRM_CANCEL" }
  | { type: "RESET" };

function reducer(state: DscState, action: DscAction): DscState {
  switch (action.type) {
    case "OPEN_FLAP":
      return { ...initialDscState, screen: "armed" };
    case "CLOSE_FLAP":
      return { ...initialDscState };
    case "OPEN_NATURE":
      return { ...state, screen: "nature" };
    case "SET_NATURE":
      return { ...state, nature: action.nature, screen: "armed" };
    case "COUNTDOWN_STEP":
      return { ...state, screen: "countdown", countdownStep: action.step };
    case "ABORT_COUNTDOWN":
      return { ...state, screen: "armed", countdownStep: 0 };
    case "SENT":
      return { ...state, screen: "waiting-ack", countdownStep: 0 };
    case "ACK_RECEIVED":
      return { ...state, screen: "goto16" };
    case "OPEN_MENU":
      return { ...state, screen: "menu" };
    case "INDIVIDUAL_START":
      return { ...state, screen: "individual-mmsi", mmsi: "" };
    case "INDIVIDUAL_MMSI":
      return { ...state, mmsi: action.mmsi, screen: "individual-channel" };
    case "INDIVIDUAL_CHANNEL":
      return { ...state, workingChannel: action.channel, screen: "individual-waiting-ack" };
    case "INDIVIDUAL_SENT":
      return { ...state, screen: "individual-waiting-ack" };
    case "INDIVIDUAL_ACK":
      return { ...state, screen: "individual-goto" };
    case "TRIGGER_INCOMING_ALERT":
      return { ...state, alertPending: true, screen: "alert-received" };
    case "DISMISS_ALERT":
      return { ...state, alertPending: false, screen: "closed" };
    case "OPEN_CANCEL_CONFIRM":
      return { ...state, screen: "cancel-confirm" };
    case "CONFIRM_CANCEL":
      return { ...state, screen: "cancel-sent" };
    case "RESET":
      return { ...initialDscState };
    default:
      return state;
  }
}

export interface UseDscControllerOptions {
  onSystemLog: (text: string) => void;
  onSwitchChannel: (channel: number) => void;
}

export function useDscController({ onSystemLog, onSwitchChannel }: UseDscControllerOptions) {
  const [state, dispatch] = useReducer(reducer, initialDscState);
  const holdTimer = useRef<number>();

  const openFlap = useCallback(() => {
    sounds.flapClack();
    dispatch({ type: "OPEN_FLAP" });
  }, []);

  const closeFlap = useCallback(() => {
    sounds.flapClack();
    window.clearTimeout(holdTimer.current);
    dispatch({ type: "CLOSE_FLAP" });
  }, []);

  /** 3-Sekunden-Halten mit Countdown-Ton; Loslassen vor Ablauf bricht ab. */
  const holdStart = useCallback(() => {
    let step: 0 | 1 | 2 = 0;
    dispatch({ type: "COUNTDOWN_STEP", step: 1 });
    sounds.countdownTick(0);
    const tick = () => {
      step = (step + 1) as 0 | 1 | 2;
      if (step > 2) {
        dispatch({ type: "SENT" });
        onSystemLog("SYS: DISTRESS SENT · WAITING ACK · CH 70");
        sounds.dscAlarm(2);
        window.setTimeout(() => {
          dispatch({ type: "ACK_RECEIVED" });
          onSystemLog("SYS: DISTRESS ACK RECEIVED — GO TO CH 16");
        }, 2000 + Math.random() * 3000);
        return;
      }
      sounds.countdownTick(step as 0 | 1 | 2);
      dispatch({ type: "COUNTDOWN_STEP", step: (step + 1) as DscState["countdownStep"] });
      holdTimer.current = window.setTimeout(tick, 1000);
    };
    holdTimer.current = window.setTimeout(tick, 1000);
  }, [onSystemLog]);

  const holdAbort = useCallback(() => {
    if (state.screen !== "countdown") return;
    window.clearTimeout(holdTimer.current);
    dispatch({ type: "ABORT_COUNTDOWN" });
  }, [state.screen]);

  const acknowledgeGoTo16 = useCallback(() => {
    onSwitchChannel(16);
    dispatch({ type: "RESET" });
  }, [onSwitchChannel]);

  const sendIndividualCall = useCallback(
    (mmsi: string, channel: number) => {
      dispatch({ type: "INDIVIDUAL_CHANNEL", channel });
      onSystemLog(`SYS: DSC INDIVIDUAL CALL → MMSI ${mmsi}, working channel ${channel}`);
      window.setTimeout(() => {
        dispatch({ type: "INDIVIDUAL_ACK" });
        onSystemLog("SYS: DSC ACK RECEIVED");
      }, 1500 + Math.random() * 2000);
    },
    [onSystemLog]
  );

  const acceptIndividualChannel = useCallback(
    (channel: number) => {
      onSwitchChannel(channel);
      dispatch({ type: "RESET" });
    },
    [onSwitchChannel]
  );

  const confirmCancel = useCallback(() => {
    dispatch({ type: "CONFIRM_CANCEL" });
    onSystemLog("SYS: DISTRESS CANCELLED — proceed to CH 16 and announce cancellation");
  }, [onSystemLog]);

  return {
    state,
    dispatch,
    openFlap,
    closeFlap,
    holdStart,
    holdAbort,
    acknowledgeGoTo16,
    sendIndividualCall,
    acceptIndividualChannel,
    confirmCancel,
  };
}
