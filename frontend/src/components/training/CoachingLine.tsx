import type { PanelMode } from "../../api";
import styles from "./CoachingLine.module.css";

/** Coaching-Zeile "Als Naechstes: ..." unter dem Stepper, nur Trainingsmodus
 *  (UI-SPEZIFIKATION §3), gespeist aus dem juengsten `coaching`-Feld der Turn-API. */
export function CoachingLine({ text, panelMode, prefix }: { text?: string; panelMode: PanelMode; prefix: string }) {
  if (panelMode !== "training" || !text) return null;
  return <div className={styles.line}>{prefix + text}</div>;
}
