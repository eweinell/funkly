import type { Language, PanelMode, ScenarioInfo, SessionSetup } from "../../api";
import type { UiStrings } from "../../i18n";
import { PanelModeSwitch } from "./PanelModeSwitch";
import styles from "./Briefing.module.css";

export interface BriefingProps {
  scenario: ScenarioInfo;
  setup: SessionSetup | null;
  language: Language;
  panelMode: PanelMode;
  onPanelModeChange: (m: PanelMode) => void;
  strings: UiStrings;
}

/** Panel-Kopf: Szenario-Briefing + Anzeigemodus-Umschalter (UI-SPEZIFIKATION §3). */
export function Briefing({ scenario, setup, language, panelMode, onPanelModeChange, strings }: BriefingProps) {
  return (
    <div>
      <div className={styles.header}>
        <span className={styles.uc}>{scenario.useCase}</span>
        <PanelModeSwitch mode={panelMode} onChange={onPanelModeChange} strings={strings} />
      </div>
      <div className={styles.briefing}>{scenario.briefing[language]}</div>
      {setup && (
        <div className={styles.plotter}>
          <span className={styles.plotterLabel}>{strings.ownPosition}</span>
          <span className={styles.plotterValue}>{setup.position}</span>
        </div>
      )}
    </div>
  );
}
