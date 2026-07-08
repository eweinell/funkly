import type { Language, ScenarioInfo } from "../../api";
import styles from "./ScenarioPicker.module.css";

export interface ScenarioPickerProps {
  scenarios: ScenarioInfo[];
  language: Language;
  title: string;
  onSelect: (s: ScenarioInfo) => void;
}

export function ScenarioPicker({ scenarios, language, title, onSelect }: ScenarioPickerProps) {
  return (
    <>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.list}>
        {scenarios.map((s) => (
          <button key={s.id} className={styles.card} onClick={() => onSelect(s)}>
            <span className={styles.uc}>{s.useCase}</span>
            <span className={styles.scTitle}>{s.title[language]}</span>
            <span className={styles.scBrief}>{s.briefing[language]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
