import { useState } from "react";
import { IcM330Lcd, IcM330LcdProps } from "./IcM330Lcd";
import { IcM330Handlers, IcM330SoftKeyIndex } from "./types";
import styles from "./IcM330Radio.module.css";

/**
 * Fronteinheit des IC-M330 (Festeinbau): Lautsprechergrill, LCD, Softkeys,
 * Navigationsfeld, 16/C, VOL/SQL/PWR-Drehknopf, DISTRESS unter Klappe.
 * Rein präsentational — jede echte Taste ruft ihren Handler aus `types.ts`.
 */
export function IcM330Radio({ handlers, lcd }: { handlers: IcM330Handlers; lcd?: IcM330LcdProps }) {
  // Klappzustand der DISTRESS-Abdeckung ist reine Optik und bleibt lokal.
  const [flapOpen, setFlapOpen] = useState(false);

  const softkeys: IcM330SoftKeyIndex[] = [0, 1, 2, 3];

  return (
    <section className={styles.radio} aria-label="ICOM IC-M330 VHF radio">
      <div className={styles.bracketKnob + " " + styles.left} aria-hidden />
      <div className={styles.bracketKnob + " " + styles.right} aria-hidden />

      <div className={styles.face}>
        <header className={styles.brandRow}>
          <span className={styles.logo}>
            <i aria-hidden>°</i>ICOM
          </span>
          <span className={styles.model}>
            VHF MARINE <b>IC-M330</b>
          </span>
        </header>

        <div className={styles.middle}>
          <div className={styles.grille} aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} />
            ))}
          </div>

          <div className={styles.lcdWrap}>
            <IcM330Lcd {...lcd} />
            <div className={styles.softkeys}>
              {softkeys.map((i) => (
                <button
                  key={i}
                  type="button"
                  className={styles.softkey}
                  aria-label={`softkey ${i + 1}`}
                  onClick={() => handlers.onSoftKey(i)}
                >
                  <span aria-hidden />
                </button>
              ))}
            </div>
          </div>

          <div className={styles.keypad}>
            <button type="button" className={styles.key + " " + styles.chKey} onClick={handlers.onChannelUp}>
              <i>▲</i>
              <em>CH</em>
            </button>
            <div className={styles.navRow}>
              <button type="button" className={styles.key} aria-label="left" onClick={handlers.onLeft}>
                ◀
              </button>
              <button type="button" className={styles.key + " " + styles.entKey} onClick={handlers.onEnter}>
                ENT
              </button>
              <button type="button" className={styles.key} aria-label="right" onClick={handlers.onRight}>
                ▶
              </button>
            </div>
            <div className={styles.navRow}>
              <button type="button" className={styles.key + " " + styles.smallText} onClick={handlers.onMenu}>
                MENU
              </button>
              <button type="button" className={styles.key + " " + styles.chKey} onClick={handlers.onChannelDown}>
                <em>CH</em>
                <i>▼</i>
              </button>
              <button type="button" className={styles.key + " " + styles.smallText} onClick={handlers.onClear}>
                CLR
              </button>
            </div>
          </div>
        </div>

        <footer className={styles.bottomRow}>
          <div className={styles.micSocket} aria-hidden />

          <div className={styles.distress}>
            {flapOpen ? (
              <>
                <button
                  type="button"
                  className={styles.distressBtn}
                  aria-label="DISTRESS (hold)"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handlers.onDistressDown();
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    handlers.onDistressUp();
                  }}
                  onPointerCancel={handlers.onDistressUp}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  DISTRESS
                </button>
                <button type="button" className={styles.flapClose} aria-label="close cover" onClick={() => setFlapOpen(false)}>
                  ✕
                </button>
              </>
            ) : (
              <button type="button" className={styles.flap} aria-label="open DISTRESS cover" onClick={() => setFlapOpen(true)}>
                DISTRESS
              </button>
            )}
          </div>

          <div className={styles.dialCluster}>
            <button type="button" className={styles.sixteenC} onClick={handlers.onSixteenC}>
              16/C
            </button>
            <div className={styles.dialLabels} aria-hidden>
              <span>VOL/SQL</span>
              <span className={styles.pwr}>PWR</span>
            </div>
            {/* Drehknopf: Scrollrad = Rastschritt, Klick = Druck (Drag folgt bei Verdrahtung). */}
            <button
              type="button"
              className={styles.dial}
              aria-label="VOL SQL PWR dial"
              onClick={handlers.onDialPress}
              onWheel={(e) => handlers.onDialRotate(e.deltaY < 0 ? 1 : -1)}
            >
              <span className={styles.dialMark} aria-hidden />
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
