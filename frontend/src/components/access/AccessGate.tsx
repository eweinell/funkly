import { FormEvent, ReactNode, useEffect, useState } from "react";
import { getStoredAccessCode, setStoredAccessCode, subscribeAccessInvalidated } from "../../access/accessCode";
import styles from "./AccessGate.module.css";

/**
 * Zugangsschutz V1 (Querschnittspaket, s. UMSETZUNGSPLAN.md): schlichtes Gate
 * vor dem eigentlichen Funkgeraet-UI. Kein echtes Login (kommt erst mit
 * Cognito/UC-27 in V2) — nur eine einmalige Abfrage des geteilten
 * Zugangscodes, der danach als Header an jede API-Anfrage geht (`api.ts`).
 *
 * Ist bereits ein Code in localStorage hinterlegt, wird sofort direkt
 * gestartet (Kinder werden gerendert). Meldet eine beliebige API-Antwort
 * spaeter 401 (Code falsch/entfernt), verwirft `accessCode.ts` den Code und
 * benachrichtigt dieses Gate ueber `subscribeAccessInvalidated` — die Kinder
 * (inkl. Session-Zustand) werden dann ausgehaengt und das Gate zeigt sich
 * erneut mit einem Hinweis.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => !!getStoredAccessCode());
  const [invalid, setInvalid] = useState(false);
  const [input, setInput] = useState("");

  useEffect(
    () =>
      subscribeAccessInvalidated(() => {
        setUnlocked(false);
        setInvalid(true);
        setInput("");
      }),
    []
  );

  if (unlocked) return <>{children}</>;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const code = input.trim();
    if (!code) return;
    setStoredAccessCode(code);
    setInvalid(false);
    setUnlocked(true);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.plate}>
        <div className={styles.screwRow}>
          <span className={styles.screw} />
          <span className={styles.screw} />
        </div>
        <div className={styles.brand}>FUNKLY</div>
        <div className={styles.sub}>VHF DSC MARINE TRAINER · SRC</div>

        <div className={styles.lcd}>
          <div className={styles.lcdLabel}>ZUGANGSCODE / ACCESS CODE</div>
          <form onSubmit={handleSubmit} className={styles.form}>
            <input
              className={styles.input}
              type="password"
              inputMode="text"
              autoComplete="off"
              autoFocus
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInvalid(false);
              }}
              placeholder="••••••"
              aria-label="Zugangscode / Access code"
            />
            <button type="submit" className={styles.submit} disabled={!input.trim()}>
              ENTER
            </button>
          </form>
          {invalid && (
            <div className={styles.error}>Code ungültig — bitte erneut eingeben. / Invalid code — try again.</div>
          )}
        </div>
      </div>
    </div>
  );
}
