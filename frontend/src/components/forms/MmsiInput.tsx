import { useState } from "react";
import { DigitPad } from "./DigitPad";
import styles from "./MmsiInput.module.css";

/** Teilstruktur "MmsiInput" (UI-SPEZIFIKATION §2): 9-stelliges Ziffernfeld,
 *  wiederverwendet vom DSC-Bedienteil und dem Diktatformular (§4). */
export interface MmsiInputProps {
  onSubmit: (mmsi: string) => void;
  submitLabel?: string;
  onCancel?: () => void;
  cancelLabel?: string;
}

export function MmsiInput({ onSubmit, submitLabel, onCancel, cancelLabel }: MmsiInputProps) {
  const [value, setValue] = useState("");
  return (
    <div>
      <DigitPad value={value} maxLength={9} onChange={setValue} onSubmit={() => onSubmit(value)} submitLabel={submitLabel} />
      {onCancel && (
        <button type="button" className={styles.cancel} onClick={onCancel}>
          {cancelLabel ?? "BACK"}
        </button>
      )}
    </div>
  );
}
