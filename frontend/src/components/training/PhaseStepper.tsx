import type { Language, ScenarioPhaseInfo } from "../../api";
import styles from "./PhaseStepper.module.css";

/**
 * Phasen-Stepper (UI-SPEZIFIKATION §3): Kette der Szenario-Phasen, aktueller
 * Schritt hervorgehoben, erledigte abgehakt. Faellt auf eine reine
 * Index-Anzeige zurueck, wenn das Backend noch keine Phasenlabels liefert
 * (s. Luecken-Hinweis in api.ts).
 */
export interface PhaseStepperProps {
  language: Language;
  phases?: ScenarioPhaseInfo[];
  currentPhaseId?: string;
  currentIndex?: number;
  totalPhases?: number;
  completedPhaseIds?: string[];
}

export function PhaseStepper({
  language,
  phases,
  currentPhaseId,
  currentIndex,
  totalPhases,
  completedPhaseIds = [],
}: PhaseStepperProps) {
  if (!phases || phases.length === 0) {
    if (totalPhases === undefined) return null;
    return (
      <div className={styles.stepper} aria-label="phase progress">
        <span className={styles.step + " " + styles.current}>
          {(currentIndex ?? 0) + 1} / {totalPhases}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.stepper} aria-label="phase progress">
      {phases.map((p, i) => {
        const isCurrent = p.id === currentPhaseId;
        const isDone = completedPhaseIds.includes(p.id);
        const cls = styles.step + (isCurrent ? " " + styles.current : isDone ? " " + styles.done : "");
        return (
          <span key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span className={styles.arrow}>→</span>}
            <span className={cls}>
              <span className={styles.dot} />
              {isDone && !isCurrent ? "✓ " : ""}
              {p.label[language]}
            </span>
          </span>
        );
      })}
    </div>
  );
}
