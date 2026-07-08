/**
 * Zugangsschutz V1 (Querschnittspaket, s. UMSETZUNGSPLAN.md).
 *
 * V1 hat kein echtes Login — nur einen geteilten Zugangscode, der als Header
 * `x-funkly-access` an jede API-Anfrage geschickt wird (s. `../api.ts`), um zu
 * verhindern, dass eine geleakte API-URL unkontrolliert Kosten erzeugt.
 *
 * Dieses Modul haelt den Code in localStorage und stellt ein kleines
 * Pub/Sub bereit, ueber das `api.ts` bei einer 401-Antwort (Code falsch/fehlt)
 * das Gate (`components/access/AccessGate.tsx`) benachrichtigen kann, ohne
 * dass der API-Client von React wissen muss.
 */

const STORAGE_KEY = "funkly.accessCode";

type InvalidatedListener = () => void;
const listeners = new Set<InvalidatedListener>();

export function getStoredAccessCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // z.B. Storage gesperrt (privates Fenster mit strikten Einstellungen) —
    // dann fragt das Gate bei jedem Start neu, ist aber sonst unkritisch.
    return null;
  }
}

export function setStoredAccessCode(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignorieren, s.o. */
  }
}

function clearStoredAccessCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignorieren, s.o. */
  }
}

/**
 * Von `api.ts` bei jeder 401-Antwort aufzurufen: verwirft den (falschen)
 * Code und benachrichtigt das Gate, damit es sich erneut zeigt. NICHT bei
 * 403 aufrufen — das ist ein Infra-/Origin-Fehler, kein falscher Code
 * (Vertrag "Zugangsschutz V1").
 */
export function invalidateAccessCode(): void {
  clearStoredAccessCode();
  listeners.forEach((l) => l());
}

export function subscribeAccessInvalidated(listener: InvalidatedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
