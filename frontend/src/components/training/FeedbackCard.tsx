import type { PanelMode, TurnEvaluation, Verdict } from "../../api";
import { t } from "../../i18n";
import type { Language } from "../../api";
import styles from "./FeedbackCard.module.css";

const VERDICT_ICON: Record<Verdict, string> = { pass: "✓", partial: "◐", fail: "✗", "n-a": "−" };

/**
 * Feedback je Turn (UI-SPEZIFIKATION §3): Gesamtscore + Ampel-Verdict je
 * Rubric-ID, Befund/Musterspruch hinter Aufklapper. Drei Anzeigemodi:
 * Training zeigt alles, Kompakt ohne Musterspruch/Coaching, Pruefung gar nichts
 * (Transkript bleibt trotzdem sichtbar — s. TurnLog).
 */
export interface FeedbackCardProps {
  evaluation: TurnEvaluation;
  panelMode: PanelMode;
  language: Language;
}

export function FeedbackCard({ evaluation, panelMode, language }: FeedbackCardProps) {
  if (panelMode === "exam") return null;
  const strings = t(language);
  const showSample = panelMode === "training";

  return (
    <details className={styles.card + " " + styles.details} open>
      <summary>
        {strings.score}: <b>{evaluation.overallScore}</b>/100
      </summary>
      <ul className={styles.rubric}>
        {evaluation.rubric.map((r) => (
          <li key={r.id} className={styles.rubricItem}>
            <span className={styles.verdict + " " + styles[r.verdict]} title={strings.verdict[r.verdict]}>
              {VERDICT_ICON[r.verdict]}
            </span>
            <span>{r.finding}</span>
          </li>
        ))}
      </ul>
      {showSample && evaluation.expected && (
        <p className={styles.expected}>
          <b>{strings.expected}:</b> {evaluation.expected}
        </p>
      )}
    </details>
  );
}
