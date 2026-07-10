import { DistressButton } from "./DistressButton";
import { DscScreens } from "./dsc/DscScreens";
import { useDscController } from "./dsc/dscController";
import { useIncomingAlert } from "./dsc/useIncomingAlert";
import { UI } from "../../i18n";
import type { Language } from "../../api";
import styles from "./DscOverlay.module.css";

/**
 * DSC-Bedienteil des Classic-Skins (UI-SPEZIFIKATION §2): DistressButton
 * (physische Klappe) + MENU-Toggle; die Softkey-Screens selbst liegen in
 * DscScreens, weil der IC-M330-Skin dieselben Screens ueber seine echten Tasten
 * bedient (siehe IcM330Panel).
 *
 * DISTRESS/DSC-MENU sind — wie am echten Geraet — unabhaengig vom gerade
 * geladenen Uebungsszenario immer verfuegbar.
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
  const alert = useIncomingAlert({
    enabled: autoAlertForUseCase14,
    language,
    onSystemLog,
    onTrigger: () => dsc.dispatch({ type: "TRIGGER_INCOMING_ALERT" }),
  });

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

      <DscScreens controller={dsc} language={language} alert={alert.current} onSwitchChannel={onSwitchChannel} />
    </div>
  );
}
