import { IcM330Handlers } from "./types";
import styles from "./IcM330Mic.module.css";

/**
 * Handmikrofon des IC-M330 — separates Teil neben der Fronteinheit.
 * PTT-Hot-Region ist der GESAMTE Mikrofonkörper inkl. der echten seitlichen
 * PTT-Taste (setPointerCapture wie in PttBar: verrutschender Finger bricht
 * die Sendung nicht ab). Die Tasten auf der Vorderseite (CH▲▼, HI/LO, 16/C)
 * liegen in der Hot-Region und stoppen deshalb die Pointer-Propagation.
 * Leertasten-Bindung kommt erst mit der Verdrahtung (heute in PttBar).
 */
export function IcM330Mic({ handlers, transmitting = false }: { handlers: IcM330Handlers; transmitting?: boolean }) {
  // Face-Tasten: eigener Klick, darf die PTT-Hot-Region darunter nicht auslösen.
  const shield = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
  };

  return (
    <div className={styles.wrap}>
      <div
        className={styles.body + (transmitting ? " " + styles.tx : "")}
        role="button"
        tabIndex={0}
        aria-label="PTT — press and hold to transmit"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handlers.onPttDown();
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          handlers.onPttUp();
        }}
        onPointerCancel={handlers.onPttUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Echte PTT-Taste an der linken Seite — Teil derselben Hot-Region */}
        <span className={styles.pttButton} aria-hidden>
          <i>PTT</i>
        </span>

        <div className={styles.grille} aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} />
          ))}
        </div>

        <span className={styles.logo} aria-hidden>
          <i>°</i>ICOM
        </span>

        <div className={styles.keys}>
          <button type="button" className={styles.sideKey} onClick={handlers.onMicHiLo} {...shield}>
            HI/LO
          </button>
          <div className={styles.chPair}>
            <button type="button" className={styles.chKey} aria-label="channel up" onClick={handlers.onMicChannelUp} {...shield}>
              ▲
            </button>
            <button
              type="button"
              className={styles.chKey}
              aria-label="channel down"
              onClick={handlers.onMicChannelDown}
              {...shield}
            >
              ▼
            </button>
          </div>
          <button type="button" className={styles.sideKey + " " + styles.right} onClick={handlers.onMicSixteenC} {...shield}>
            16/C
          </button>
        </div>
      </div>

      <svg className={styles.cord} viewBox="0 0 90 46" aria-hidden>
        <path
          d="M6 4 C 2 14, 14 14, 10 24 C 6 34, 20 32, 16 42 M22 2 C 18 12, 30 12, 26 22 C 22 32, 36 30, 32 40"
          fill="none"
          stroke="#0c0f12"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M40 22 C 58 14, 72 30, 88 24" fill="none" stroke="#0c0f12" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
