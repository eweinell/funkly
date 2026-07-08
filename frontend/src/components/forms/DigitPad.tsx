import styles from "./DigitPad.module.css";

/**
 * Teilstruktur "Ziffernfeld" (UI-SPEZIFIKATION §1/§2/§8): grosse Tasten statt
 * nativem Nummern-Keyboard (Gerätehaptik + keine Viewport-Spruenge auf Mobil, §6).
 * Wiederverwendet von ChannelSelector, MmsiInput, PositionInput.
 */
export interface DigitPadProps {
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  submitLabel?: string;
}

export function DigitPad({ value, maxLength, onChange, onSubmit, submitLabel = "OK" }: DigitPadProps) {
  const append = (d: string) => {
    if (value.length >= maxLength) return;
    onChange(value + d);
  };
  const backspace = () => onChange(value.slice(0, -1));

  return (
    <div>
      <div className={styles.display}>{value.padEnd(maxLength, "–")}</div>
      <div className={styles.pad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={styles.key} onClick={() => append(d)}>
            {d}
          </button>
        ))}
        <button type="button" className={styles.key} onClick={backspace}>
          ⌫
        </button>
        <button type="button" className={styles.key} onClick={() => append("0")}>
          0
        </button>
        <button
          type="button"
          className={`${styles.key} ${styles.action}`}
          onClick={onSubmit}
          disabled={!onSubmit || value.length !== maxLength}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
