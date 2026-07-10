import { DscNatureList } from "./DscNatureList";
import { DscIndividualCall } from "./DscIndividualCall";
import { DscAlertReceived, IncomingAlert } from "./DscAlertReceived";
import type { DscController } from "./dscController";
import { UI } from "../../../i18n";
import type { Language } from "../../../api";
import styles from "./DscScreens.module.css";

const WORKING_CHANNELS = [26, 27, 72, 77];

/**
 * Softkey-Screens des DSC-Bedienteils (UI-SPEZIFIKATION §2), ohne die physischen
 * Bedienelemente: die zeichnet jeder Geraete-Skin selbst (Classic: DistressButton
 * + MENU-Toggle in DscOverlay; IC-M330: DISTRESS unter der Klappe + MENU-Taste).
 * Die Screens haengen absolut am naechsten `position: relative`-Vorfahren.
 */
export interface DscScreensProps {
  controller: DscController;
  language: Language;
  alert: IncomingAlert | null;
  onSwitchChannel: (channel: number) => void;
}

export function DscScreens({ controller: dsc, language, alert, onSwitchChannel }: DscScreensProps) {
  const strings = UI[language].dsc;
  const { state } = dsc;

  return (
    <>
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

      {state.screen === "alert-received" && alert && (
        <DscAlertReceived
          alert={alert}
          titleLabel={strings.alertReceived}
          pauseLabel={strings.pauseAlarm}
          infoLabel={strings.info}
          onPause={() => dsc.dispatch({ type: "DISMISS_ALERT" })}
          onInfo={() => dsc.dispatch({ type: "DISMISS_ALERT" })}
        />
      )}
    </>
  );
}
