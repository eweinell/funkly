import { useEffect } from "react";
import styles from "./PttBar.module.css";

/**
 * PTT-Taste (UI-SPEZIFIKATION §6/§8). `setPointerCapture` statt `onPointerLeave`
 * — ein verrutschender Finger darf die Sendung nicht abbrechen. Auf Mobil wird
 * dieselbe Taste per CSS zur fixen Bottom-Bar (siehe PttBar.module.css).
 * Leertaste-Bindung ist hier verankert, weil sie zur selben Bedienhandlung gehoert.
 */
export interface PttBarProps {
  active: boolean;
  disabled: boolean;
  hint: string;
  label?: string;
  onDown: () => void;
  onUp: () => void;
}

export function PttBar({ active, disabled, hint, label = "PTT", onDown, onUp }: PttBarProps) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        onDown();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        onUp();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onDown, onUp]);

  return (
    <>
      <button
        type="button"
        className={styles.ptt + (active ? " " + styles.active : "")}
        disabled={disabled}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onDown();
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          onUp();
        }}
        onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {label}
      </button>
      <div className={styles.hint}>{hint}</div>
    </>
  );
}
