import { useCallback, useRef, useState } from "react";
import { DigitPad } from "../forms/DigitPad";
import styles from "./ChannelSelector.module.css";

/**
 * Kanalwahl (UI-SPEZIFIKATION §1): ▲/▼ mit Beschleunigung beim Halten
 * (1er-Schritte, nach 1 s schnell), zusaetzlich Zifferneingabe per Tipp auf
 * die Kanalanzeige (Teilstruktur "Ziffernfeld").
 */
export interface ChannelSelectorProps {
  channel: number | string;
  onChange: (channel: number) => void;
  disabled?: boolean;
  label: string;
}

const MIN = 1;
const MAX = 88;

export function ChannelSelector({ channel, onChange, disabled, label }: ChannelSelectorProps) {
  const [digitEntry, setDigitEntry] = useState(false);
  const [digits, setDigits] = useState("");
  const holdTimeout = useRef<number>();
  const holdInterval = useRef<number>();

  const numeric = typeof channel === "number" ? channel : Number(channel) || 16;

  const step = useCallback(
    (delta: number) => {
      const cur = typeof channel === "number" ? channel : Number(channel) || 16;
      onChange(Math.min(MAX, Math.max(MIN, cur + delta)));
    },
    [channel, onChange]
  );

  const stopHold = useCallback(() => {
    window.clearTimeout(holdTimeout.current);
    window.clearInterval(holdInterval.current);
  }, []);

  const startHold = useCallback(
    (delta: number) => {
      step(delta);
      holdTimeout.current = window.setTimeout(() => {
        holdInterval.current = window.setInterval(() => step(delta), 90);
      }, 1000);
    },
    [step]
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.buttons}>
        <button
          type="button"
          disabled={disabled}
          onPointerDown={() => startHold(1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
        >
          ▲
        </button>
        <button type="button" className={styles.label} disabled={disabled} onClick={() => setDigitEntry(true)}>
          {label}
        </button>
        <button
          type="button"
          disabled={disabled}
          onPointerDown={() => startHold(-1)}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
        >
          ▼
        </button>
      </div>

      {digitEntry && (
        <div className={styles.popover}>
          <div className={styles.popoverTitle}>{label} DIRECT</div>
          <DigitPad
            value={digits}
            maxLength={2}
            onChange={setDigits}
            submitLabel="OK"
            onSubmit={() => {
              const n = Math.min(MAX, Math.max(MIN, Number(digits) || numeric));
              onChange(n);
              setDigits("");
              setDigitEntry(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
