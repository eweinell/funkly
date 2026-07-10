import { useEffect, useRef } from "react";
import { UI } from "../../../i18n";
import type { Language } from "../../../api";
import type { IncomingAlert } from "./DscAlertReceived";

/**
 * Eingehender DISTRESS-Alert fuer UC-14. Wird hier clientseitig simuliert, weil
 * die Turn-API v2 keinen Server-Push fuer asynchrone DSC-Ereignisse kennt
 * (siehe DscOverlay-Kommentar). Der Alert feuert je Uebung genau einmal.
 */
export function useIncomingAlert(options: {
  enabled: boolean;
  language: Language;
  onSystemLog: (text: string) => void;
  onTrigger: () => void;
}): { current: IncomingAlert | null } {
  const { enabled, language, onSystemLog, onTrigger } = options;
  const alert = useRef<IncomingAlert | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!enabled || fired.current) return;
    fired.current = true;
    const timer = window.setTimeout(() => {
      alert.current = {
        mmsi: "002111" + Math.floor(1000 + Math.random() * 8999),
        nature: "UNDESIGNATED",
        position: "54°20'N 011°40'E",
        time: new Date().toISOString().slice(11, 16) + "Z",
      };
      onSystemLog(UI[language].dsc.alertReceived);
      onTrigger();
    }, 3000 + Math.random() * 2000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return alert;
}
