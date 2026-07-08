import styles from "./MicHelpBanner.module.css";

/** Hilfe-Panel statt roher Fehlermeldung bei Mikrofon-Verweigerung (UI-SPEZIFIKATION §6). */
export function MicHelpBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.banner}>
      <div className={styles.title}>{title}</div>
      <div className={styles.body}>{body}</div>
    </div>
  );
}

/** Erkennt eine Mikrofon-Verweigerung anhand der Fehlermeldung (getUserMedia). */
export function isMicPermissionError(error: string | null): boolean {
  if (!error) return false;
  return /notallowed|permission denied|dismissed/i.test(error);
}
