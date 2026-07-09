import styles from "./IcM330Lcd.module.css";

/**
 * LCD des IC-M330: bernstein hinterleuchtet, dunkle Segmente (invertiert zum
 * Classic-Skin). Alles per Props steuerbar; Defaults replizieren den
 * Standby-Screen des Originals, bis der Skin verdrahtet ist.
 */
export interface IcM330LcdProps {
  channel?: number | string;
  /** Status-Tag links neben der Kanalanzeige, z. B. STBY / TX / RX. */
  statusTag?: string;
  powerLabel?: string;
  regionLabel?: string;
  /** Freie Infozeilen links (Original: Position + Uhrzeit). */
  infoLines?: string[];
  /** Belegung der vier Softkeys (Anzeige im LCD, Tasten sitzen darunter). */
  softkeyLabels?: [string, string, string, string];
  /** Sternchen = Favoritenkanal (wie im Original neben der 16). */
  favorite?: boolean;
}

export function IcM330Lcd({
  channel = 16,
  statusTag = "STBY",
  powerLabel = "25W",
  regionLabel = "INT",
  infoLines = ["42°49N", "10°19E", "12:00I"],
  softkeyLabels = ["SCAN", "DW", "HI/LO", "CH/WX"],
  favorite = true,
}: IcM330LcdProps) {
  return (
    <div className={styles.lcd} role="img" aria-label={`LCD: channel ${channel}, ${statusTag}`}>
      <div className={styles.topRow}>
        <span>{powerLabel}</span>
        <span>{regionLabel}</span>
        <span className={styles.satIcon}>▟▙</span>
      </div>

      <div className={styles.main}>
        <div className={styles.infoCol}>
          <span className={styles.tag}>{statusTag}</span>
          {infoLines.map((line) => (
            <span key={line} className={styles.infoLine}>
              {line}
            </span>
          ))}
        </div>
        <div className={styles.channel}>
          {String(channel).padStart(2, "0")}
          {favorite && <span className={styles.star}>★</span>}
        </div>
      </div>

      <div className={styles.softRow}>
        {softkeyLabels.map((label) => (
          <span key={label} className={styles.softTab}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
