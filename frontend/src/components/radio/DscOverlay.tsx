import { useEffect, useRef } from "react";
import { DistressButton } from "./DistressButton";
import { DscNatureList } from "./dsc/DscNatureList";
import { DscIndividualCall } from "./dsc/DscIndividualCall";
import { DscAlertReceived, IncomingAlert } from "./dsc/DscAlertReceived";
import { useDscController } from "./dsc/dscController";
import { UI } from "../../i18n";
import type { Language } from "../../api";
import styles from "./DscOverlay.module.css";

const WORKING_CHANNELS = [26, 27, 72, 77];

/**
 * DSC-Bedienteil (UI-SPEZIFIKATION §2): flaches Softkey-Modell, max. 2 Ebenen.
 * DistressButton (physische Klappe) + Softkey-Screens fuer Nature-Auswahl,
 * Sending/ACK/GoTo16, MENU -> DSC CALL -> INDIVIDUAL, und Storno.
 *
 * DISTRESS/DSC-MENU sind — wie am echten Geraet — unabhaengig vom gerade
 * geladenen Uebungsszenario immer verfuegbar. Der eingehende Alert (UC-14) wird
 * hier fuer die passende Uebung (useCase UC-14) simuliert ausgeloest, weil die
 * Turn-API v2 aktuell keinen Server-Push fuer asynchrone DSC-Ereignisse kennt
 * (siehe Bericht an die Hauptsession).
 */
export interface DscOverlayProps {
  language: Language;
  disabled?: boolean;
  autoAlertForUseCase14: boolean;
  onSystemLog: (text: string) => void;
  onSwitchChannel: (channel: number) => void;
}

export function DscOverlay({ language, disabled, autoAlertForUseCase14, onSystemLog, onSwitchChannel }: DscOverlayProps) {
  const strings = UI[language].dsc;
  const dsc = useDscController({ onSystemLog, onSwitchChannel });
  const alertFired = useRef(false);
  const pendingAlert = useRef<IncomingAlert | null>(null);

  useEffect(() => {
    if (!autoAlertForUseCase14 || alertFired.current) return;
    alertFired.current = true;
    const timer = window.setTimeout(() => {
      pendingAlert.current = {
        mmsi: "002111" + Math.floor(1000 + Math.random() * 8999),
        nature: "UNDESIGNATED",
        position: "54°20'N 011°40'E",
        time: new Date().toISOString().slice(11, 16) + "Z",
      };
      onSystemLog(UI[language].dsc.alertReceived);
      dsc.dispatch({ type: "TRIGGER_INCOMING_ALERT" });
    }, 3000 + Math.random() * 2000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAlertForUseCase14]);

  const { state } = dsc;
  const showDistressButton = ["closed", "armed", "countdown", "nature"].includes(state.screen);

  return (
    <div className={styles.wrap}>
      {showDistressButton && (
        <DistressButton
          open={state.screen !== "closed"}
          countdownActive={state.screen === "countdown"}
          nature={state.nature}
          natureLabel={strings.undesignated}
          openFlapLabel={strings.openFlap}
          natureSoftkeyLabel={strings.nature}
          holdLabel={strings.holdToSend}
          disabled={disabled}
          onOpenFlap={dsc.openFlap}
          onCloseFlap={dsc.closeFlap}
          onOpenNature={() => dsc.dispatch({ type: "OPEN_NATURE" })}
          onHoldStart={dsc.holdStart}
          onHoldAbort={dsc.holdAbort}
        />
      )}

      {state.screen === "armed" && (
        <button type="button" className={styles.menuToggle} onClick={() => dsc.dispatch({ type: "OPEN_MENU" })}>
          {strings.menu}
        </button>
      )}

      {state.screen === "nature" && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{strings.nature}</div>
          <DscNatureList onSelect={(n) => dsc.dispatch({ type: "SET_NATURE", nature: n })} />
        </div>
      )}

      {state.screen === "waiting-ack" && (
        <div className={styles.panel}>
          <div className={styles.status}>{strings.sending}</div>
          <button type="button" className={styles.cancelLink} onClick={() => dsc.dispatch({ type: "OPEN_CANCEL_CONFIRM" })}>
            {strings.cancelSoftkey}
          </button>
        </div>
      )}

      {state.screen === "goto16" && (
        <div className={styles.panel}>
          <div className={styles.status}>{strings.ack}</div>
          <div className={styles.confirmRow}>
            <button type="button" onClick={dsc.acknowledgeGoTo16}>
              {strings.goTo16}
            </button>
          </div>
        </div>
      )}

      {state.screen === "cancel-confirm" && (
        <div className={styles.panel}>
          <div className={styles.status}>{strings.cancelConfirm}?</div>
          <div className={styles.confirmRow}>
            <button type="button" onClick={dsc.confirmCancel}>
              {strings.cancelConfirm}
            </button>
            <button type="button" onClick={() => dsc.dispatch({ type: "SENT" })}>
              {strings.back}
            </button>
          </div>
        </div>
      )}

      {state.screen === "cancel-sent" && (
        <div className={styles.panel}>
          <div className={styles.status}>{strings.cancelSent}</div>
          <div className={styles.confirmRow}>
            <button type="button" onClick={() => onSwitchChannel(16)}>
              {strings.goTo16}
            </button>
          </div>
        </div>
      )}

      {["menu", "individual-mmsi", "individual-channel", "individual-waiting-ack", "individual-goto"].includes(
        state.screen
      ) && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{strings.dscCall}</div>
          <DscIndividualCall
            screen={state.screen}
            mmsi={state.mmsi}
            workingChannel={state.workingChannel}
            channelOptions={WORKING_CHANNELS}
            labels={strings}
            onOpenIndividual={() => dsc.dispatch({ type: "INDIVIDUAL_START" })}
            onMmsiSubmit={(mmsi) => dsc.dispatch({ type: "INDIVIDUAL_MMSI", mmsi })}
            onChannelSelect={dsc.sendIndividualCall}
            onAcceptChannel={dsc.acceptIndividualChannel}
            onBack={() => dsc.dispatch({ type: "CLOSE_FLAP" })}
          />
        </div>
      )}

      {state.screen === "alert-received" && pendingAlert.current && (
        <DscAlertReceived
          alert={pendingAlert.current}
          titleLabel={strings.alertReceived}
          pauseLabel={strings.pauseAlarm}
          infoLabel={strings.info}
          onPause={() => dsc.dispatch({ type: "DISMISS_ALERT" })}
          onInfo={() => dsc.dispatch({ type: "DISMISS_ALERT" })}
        />
      )}
    </div>
  );
}
