import { useEffect, useRef } from "react";

/**
 * Screen Wake Lock waehrend einer aktiven Uebung (UI-SPEZIFIKATION §6).
 * Fehlen der API wird stumm ignoriert (kein Fehler, kein Fallback-UI).
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await (navigator as Navigator & { wakeLock: WakeLock }).wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        lockRef.current = lock;
      } catch {
        /* Ablehnung/kein Support - stumm ignorieren */
      }
    };
    void acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !lockRef.current) void acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void lockRef.current?.release();
      lockRef.current = null;
    };
  }, [active]);
}

interface WakeLock {
  request(type: "screen"): Promise<WakeLockSentinel>;
}
interface WakeLockSentinel {
  release(): Promise<void>;
}
