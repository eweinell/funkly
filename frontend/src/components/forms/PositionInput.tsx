import { useState } from "react";
import { DigitPad } from "./DigitPad";
import styles from "./PositionInput.module.css";

export interface PositionValue {
  latDeg: number;
  latMin: number;
  latHem: "N" | "S";
  lonDeg: number;
  lonMin: number;
  lonHem: "E" | "W";
}

/** Teilstruktur "PositionInput" (UI-SPEZIFIKATION §2/§4): Grad/Minuten +
 *  Hemisphaere, gross bedienbar, kein natives Nummern-Keyboard (§6). */
export interface PositionInputProps {
  onSubmit: (value: PositionValue) => void;
  onCancel?: () => void;
}

type Step = "latDeg" | "latMin" | "latHem" | "lonDeg" | "lonMin" | "lonHem";
const STEPS: Step[] = ["latDeg", "latMin", "latHem", "lonDeg", "lonMin", "lonHem"];

export function PositionInput({ onSubmit, onCancel }: PositionInputProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [latDeg, setLatDeg] = useState("");
  const [latMin, setLatMin] = useState("");
  const [latHem, setLatHem] = useState<"N" | "S">("N");
  const [lonDeg, setLonDeg] = useState("");
  const [lonMin, setLonMin] = useState("");
  const [lonHem, setLonHem] = useState<"E" | "W">("E");

  const step = STEPS[stepIndex];
  const last = stepIndex === STEPS.length - 1;

  const next = () => {
    if (last) {
      onSubmit({
        latDeg: Number(latDeg || 0),
        latMin: Number(latMin || 0) / 10,
        latHem,
        lonDeg: Number(lonDeg || 0),
        lonMin: Number(lonMin || 0) / 10,
        lonHem,
      });
      return;
    }
    setStepIndex((i) => i + 1);
  };
  const back = () => {
    if (stepIndex === 0) {
      onCancel?.();
      return;
    }
    setStepIndex((i) => i - 1);
  };

  const summary = `${latDeg || "--"}°${latMin ? (Number(latMin) / 10).toFixed(1) : "--"}' ${latHem}  ${
    lonDeg || "--"
  }°${lonMin ? (Number(lonMin) / 10).toFixed(1) : "--"}' ${lonHem}`;

  return (
    <div className={styles.wrap}>
      <div className={styles.summary}>{summary}</div>
      {step === "latDeg" && (
        <>
          <div className={styles.label}>Latitude — degrees (0-90)</div>
          <DigitPad value={latDeg} maxLength={2} onChange={setLatDeg} />
        </>
      )}
      {step === "latMin" && (
        <>
          <div className={styles.label}>Latitude — minutes ×10 (e.g. 325 = 32.5')</div>
          <DigitPad value={latMin} maxLength={3} onChange={setLatMin} />
        </>
      )}
      {step === "latHem" && (
        <>
          <div className={styles.label}>Latitude — hemisphere</div>
          <div className={styles.hemRow}>
            {(["N", "S"] as const).map((h) => (
              <button
                key={h}
                type="button"
                className={`${styles.hemBtn} ${latHem === h ? styles.on : ""}`}
                onClick={() => setLatHem(h)}
              >
                {h}
              </button>
            ))}
          </div>
        </>
      )}
      {step === "lonDeg" && (
        <>
          <div className={styles.label}>Longitude — degrees (0-180)</div>
          <DigitPad value={lonDeg} maxLength={3} onChange={setLonDeg} />
        </>
      )}
      {step === "lonMin" && (
        <>
          <div className={styles.label}>Longitude — minutes ×10</div>
          <DigitPad value={lonMin} maxLength={3} onChange={setLonMin} />
        </>
      )}
      {step === "lonHem" && (
        <>
          <div className={styles.label}>Longitude — hemisphere</div>
          <div className={styles.hemRow}>
            {(["E", "W"] as const).map((h) => (
              <button
                key={h}
                type="button"
                className={`${styles.hemBtn} ${lonHem === h ? styles.on : ""}`}
                onClick={() => setLonHem(h)}
              >
                {h}
              </button>
            ))}
          </div>
        </>
      )}
      <div className={styles.nav}>
        <button type="button" onClick={back}>
          BACK
        </button>
        <button type="button" onClick={next}>
          {last ? "OK" : "NEXT"}
        </button>
      </div>
    </div>
  );
}
