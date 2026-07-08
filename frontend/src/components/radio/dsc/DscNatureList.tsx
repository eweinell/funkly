import styles from "./DscNatureList.module.css";

const NATURES = [
  "FIRE / EXPLOSION",
  "FLOODING",
  "COLLISION",
  "GROUNDING",
  "LISTING / CAPSIZING",
  "SINKING",
  "DISABLED AND ADRIFT",
  "ABANDONING SHIP",
  "PIRACY / ARMED ROBBERY",
  "MAN OVERBOARD",
  "UNDESIGNATED",
];

/** Nature-of-Distress-Auswahlliste (UI-SPEZIFIKATION §2). Ohne Auswahl wird
 *  beim Senden UNDESIGNATED verwendet, wie am echten Geraet. */
export function DscNatureList({ onSelect }: { onSelect: (nature: string) => void }) {
  return (
    <div className={styles.list}>
      {NATURES.map((n) => (
        <button key={n} type="button" onClick={() => onSelect(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}
