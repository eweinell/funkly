import styles from "./Lcd.module.css";

export interface LcdProps {
  channel: number | string;
  statusLabel: string;
  busy: boolean;
  line2: string;
  line3: string;
  warningText?: string;
}

/** LCD-Anzeige des Funkgeraets (UI-SPEZIFIKATION §1/§8). */
export function Lcd({ channel, statusLabel, busy, line2, line3, warningText }: LcdProps) {
  return (
    <div className={styles.lcd}>
      <div className={styles.row1}>
        <span className={styles.ch}>CH {String(channel).padStart(2, "0")}</span>
        <span className={styles.status + (busy ? " " + styles.blink : "")}>{statusLabel}</span>
      </div>
      <div className={styles.row2}>{line2}</div>
      <div className={styles.row3}>{line3}</div>
      {warningText && <div className={styles.warning}>{warningText}</div>}
    </div>
  );
}
