import { useEffect } from "react";

/**
 * Leertaste als PTT (UI-SPEZIFIKATION §6). Liegt als Hook vor, weil jeder
 * Geraete-Skin seine eigene Sprechtaste zeichnet, die Tastaturbindung aber
 * dieselbe Bedienhandlung ist (PttBar im Classic-Skin, Mikrofonkoerper im
 * IC-M330-Skin).
 */
export function usePttKeyboard(onDown: () => void, onUp: () => void) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        onDown();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        onUp();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onDown, onUp]);
}
