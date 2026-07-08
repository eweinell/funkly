import { MmsiInput } from "../../forms/MmsiInput";
import type { DscScreen } from "./dscController";
import styles from "./DscIndividualCall.module.css";

/**
 * DSC-Routineanruf / Individual Call (UI-SPEZIFIKATION §2, UC-15):
 * MENU -> DSC CALL -> INDIVIDUAL -> MmsiInput -> Arbeitskanal waehlen -> senden
 * -> ACK -> Auto-Wechsel-Angebot.
 */
export interface DscIndividualCallProps {
  screen: DscScreen;
  mmsi: string;
  workingChannel: number | null;
  channelOptions: number[];
  labels: {
    dscCall: string;
    individual: string;
    workingChannel: string;
    switchChannel: string;
    manual: string;
    back: string;
  };
  onOpenIndividual: () => void;
  onMmsiSubmit: (mmsi: string) => void;
  onChannelSelect: (mmsi: string, channel: number) => void;
  onAcceptChannel: (channel: number) => void;
  onBack: () => void;
}

export function DscIndividualCall({
  screen,
  mmsi,
  workingChannel,
  channelOptions,
  labels,
  onOpenIndividual,
  onMmsiSubmit,
  onChannelSelect,
  onAcceptChannel,
  onBack,
}: DscIndividualCallProps) {
  if (screen === "menu") {
    return (
      <div className={styles.menu}>
        <button type="button" onClick={onOpenIndividual}>
          {labels.dscCall} → {labels.individual}
        </button>
        <button type="button" className={styles.back} onClick={onBack}>
          {labels.back}
        </button>
      </div>
    );
  }

  if (screen === "individual-mmsi") {
    return <MmsiInput onSubmit={onMmsiSubmit} onCancel={onBack} submitLabel="OK" cancelLabel={labels.back} />;
  }

  if (screen === "individual-channel") {
    return (
      <div>
        <div className={styles.status}>MMSI {mmsi}</div>
        <div>{labels.workingChannel}:</div>
        <div className={styles.channels}>
          {channelOptions.map((c) => (
            <button key={c} type="button" onClick={() => onChannelSelect(mmsi, c)}>
              {c}
            </button>
          ))}
        </div>
        <button type="button" className={styles.back} onClick={onBack}>
          {labels.back}
        </button>
      </div>
    );
  }

  if (screen === "individual-waiting-ack") {
    return <div className={styles.status}>MMSI {mmsi} · CH {workingChannel} · WAITING ACK …</div>;
  }

  if (screen === "individual-goto") {
    return (
      <div>
        <div className={styles.status}>ACK RECEIVED — CH {workingChannel}</div>
        <button type="button" onClick={() => onAcceptChannel(workingChannel ?? 26)}>
          {labels.switchChannel} ({workingChannel})
        </button>
        <button type="button" className={styles.back} onClick={onBack}>
          {labels.manual}
        </button>
      </div>
    );
  }

  return null;
}
