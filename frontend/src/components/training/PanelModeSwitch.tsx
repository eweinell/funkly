import type { PanelMode } from "../../api";
import type { UiStrings } from "../../i18n";
import styles from "./PanelModeSwitch.module.css";

/** Umschalter der drei Anzeigemodi im Panel-Kopf (UI-SPEZIFIKATION §3). */
export function PanelModeSwitch({
  mode,
  onChange,
  strings,
}: {
  mode: PanelMode;
  onChange: (m: PanelMode) => void;
  strings: UiStrings;
}) {
  const modes: PanelMode[] = ["training", "compact", "exam"];
  return (
    <div className={styles.switch} role="group" aria-label="panel mode">
      {modes.map((m) => (
        <button key={m} type="button" className={m === mode ? styles.on : ""} onClick={() => onChange(m)}>
          {strings.panelMode[m]}
        </button>
      ))}
    </div>
  );
}
