import { useCallback, useRef } from "react";
import styles from "./Knob.module.css";

/**
 * Drehknopf (VOL/SQL, UI-SPEZIFIKATION §7): Drag vertikal oder Scrollrad,
 * Werte 0..1, persistiert vom Aufrufer (audio/radioFx.ts settings store).
 */
export interface KnobProps {
  label: string;
  value: number; // 0..1
  onChange: (value: number) => void;
}

const MIN_DEG = -135;
const MAX_DEG = 135;

export function Knob({ label, value, onChange }: KnobProps) {
  const dragStart = useRef<{ y: number; value: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      dragStart.current = { y: e.clientY, value };
    },
    [value]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart.current) return;
      const dy = dragStart.current.y - e.clientY;
      const next = Math.min(1, Math.max(0, dragStart.current.value + dy / 140));
      onChange(next);
    },
    [onChange]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const next = Math.min(1, Math.max(0, value - e.deltaY / 800));
      onChange(next);
    },
    [value, onChange]
  );

  const deg = MIN_DEG + value * (MAX_DEG - MIN_DEG);

  return (
    <div className={styles.wrap}>
      <div
        className={styles.knob}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") onChange(Math.min(1, value + 0.05));
          if (e.key === "ArrowDown") onChange(Math.max(0, value - 0.05));
        }}
      >
        <div className={styles.indicator} style={{ transform: `rotate(${deg}deg)` }} />
      </div>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{Math.round(value * 100)}</span>
    </div>
  );
}
