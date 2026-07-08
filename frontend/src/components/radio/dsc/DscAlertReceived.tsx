import styles from "./DscAlertReceived.module.css";

export interface IncomingAlert {
  mmsi: string;
  nature: string;
  position: string;
  time: string;
}

/**
 * Eingehender DSC-Alert (UI-SPEZIFIKATION §2, UC-14): Vollbild-Overlay,
 * uebernimmt das LCD bis Tastendruck. Lernziel: als Sportboot nicht per DSC
 * quittieren, sondern auf Kanal 16 mithoeren (die Rubric bewertet das serverseitig).
 */
export interface DscAlertReceivedProps {
  alert: IncomingAlert;
  pauseLabel: string;
  infoLabel: string;
  titleLabel: string;
  onPause: () => void;
  onInfo: () => void;
}

export function DscAlertReceived({ alert, pauseLabel, infoLabel, titleLabel, onPause, onInfo }: DscAlertReceivedProps) {
  return (
    <div className={styles.overlay} role="alertdialog" aria-label={titleLabel}>
      <div className={styles.card}>
        <div className={styles.title}>⚠ {titleLabel}</div>
        <div className={styles.row}>
          <span>MMSI</span>
          <b>{alert.mmsi}</b>
        </div>
        <div className={styles.row}>
          <span>NATURE</span>
          <b>{alert.nature}</b>
        </div>
        <div className={styles.row}>
          <span>POSITION</span>
          <b>{alert.position}</b>
        </div>
        <div className={styles.row}>
          <span>TIME</span>
          <b>{alert.time}</b>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={onPause}>
            {pauseLabel}
          </button>
          <button type="button" onClick={onInfo}>
            {infoLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
