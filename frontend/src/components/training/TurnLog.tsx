import type { Language, PanelMode } from "../../api";
import type { LogEntry } from "../../state/types";
import { FeedbackCard } from "./FeedbackCard";
import styles from "./TurnLog.module.css";

export interface TurnLogProps {
  log: LogEntry[];
  language: Language;
  panelMode: PanelMode;
  done: boolean;
  doneLabel: string;
}

/** Transkript/Feedback-Log (UI-SPEZIFIKATION §3, §7 latenz-neutral). Das
 *  Transkript bleibt in allen drei Anzeigemodi sichtbar — auch "Pruefung". */
export function TurnLog({ log, language, panelMode, done, doneLabel }: TurnLogProps) {
  return (
    <div className={styles.log}>
      {log.map((entry, i) => (
        <div key={i} className={`${styles.entry} ${styles[entry.kind]}`}>
          <div className={styles.entryText}>
            <span className={styles.who}>{entry.kind === "user" ? "YOU" : entry.kind === "station" ? "STN" : "SYS"}</span>
            <span>{entry.text}</span>
          </div>
          {entry.evaluation && <FeedbackCard evaluation={entry.evaluation} panelMode={panelMode} language={language} />}
        </div>
      ))}
      {done && <div className={`${styles.entry} ${styles.system} ${styles.doneBanner}`}>■ {doneLabel} ■</div>}
    </div>
  );
}
