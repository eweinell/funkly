import styles from "./DistressButton.module.css";

/**
 * DISTRESS-Taste mit Klappabdeckung (UI-SPEZIFIKATION §2/§3 KONZEPT): Klappe
 * antippen -> oeffnet; darunter der rote Knopf, 3 s halten zum Senden, Loslassen
 * bricht ab. Rein praesentational — Zustandsmaschine lebt in dscController.ts.
 */
export interface DistressButtonProps {
  open: boolean;
  countdownActive: boolean;
  nature: string | null;
  natureLabel: string;
  openFlapLabel: string;
  natureSoftkeyLabel: string;
  holdLabel: string;
  disabled?: boolean;
  onOpenFlap: () => void;
  onCloseFlap: () => void;
  onOpenNature: () => void;
  onHoldStart: () => void;
  onHoldAbort: () => void;
}

export function DistressButton({
  open,
  countdownActive,
  nature,
  natureLabel,
  openFlapLabel,
  natureSoftkeyLabel,
  holdLabel,
  disabled,
  onOpenFlap,
  onCloseFlap,
  onOpenNature,
  onHoldStart,
  onHoldAbort,
}: DistressButtonProps) {
  if (!open) {
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.flap} disabled={disabled} onClick={onOpenFlap} title="DSC DISTRESS">
          <span>DISTRESS</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.armed}>
        <div className={styles.natureRow}>
          <span>{nature ?? natureLabel}</span>
          <button type="button" className={styles.natureBtn} onClick={onOpenNature}>
            {natureSoftkeyLabel}
          </button>
        </div>
        <button
          type="button"
          className={styles.button + (countdownActive ? " " + styles.holding : "")}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onHoldStart();
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            onHoldAbort();
          }}
          onPointerCancel={onHoldAbort}
          onContextMenu={(e) => e.preventDefault()}
        >
          {countdownActive && <span className={styles.ring} />}
          {holdLabel}
        </button>
      </div>
      <button type="button" className={styles.closeBtn} onClick={onCloseFlap}>
        ✕
      </button>
    </div>
  );
}
