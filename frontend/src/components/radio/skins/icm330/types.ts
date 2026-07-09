/**
 * IC-M330-Skin — Handler-Vertrag für alle REALEN Bedienelemente des Geräts.
 * Noch nichts verdrahtet: Die Komponenten sind rein präsentational und rufen
 * diese Callbacks auf. Spätere Verdrahtung = ein Objekt implementieren und an
 * <IcM330Skin handlers={...}> geben (Session-Aktionen: pttDown/pttUp,
 * setChannel, DSC-Controller usw.).
 */

/** Softkeys unter dem LCD, links nach rechts (Standby-Belegung: SCAN DW HI/LO CH/WX). */
export type IcM330SoftKeyIndex = 0 | 1 | 2 | 3;

export interface IcM330Handlers {
  /* --- Bedienteil (Fronteinheit) --- */
  /** Softkey 1–4 unter dem LCD; Belegung ist kontextabhängig (Index statt Label). */
  onSoftKey: (index: IcM330SoftKeyIndex) => void;
  /** CH▲ / CH▼ — Kanalwahl. */
  onChannelUp: () => void;
  onChannelDown: () => void;
  /** ◀ / ▶ — Cursor/Navigation in Menüs. */
  onLeft: () => void;
  onRight: () => void;
  onEnter: () => void;
  onMenu: () => void;
  onClear: () => void;
  /** 16/C (blau): kurz = CH16; lang = Call-Kanal (Long-Press bei Verdrahtung ergänzen). */
  onSixteenC: () => void;
  /** DISTRESS unter der roten Klappe: am echten Gerät 3 s halten (Down/Up getrennt). */
  onDistressDown: () => void;
  onDistressUp: () => void;
  /** Drehknopf VOL/SQL/PWR: Rastschritte (+1/-1) und Druck (kurz = VOL→SQL, lang = PWR). */
  onDialRotate: (direction: 1 | -1) => void;
  onDialPress: () => void;

  /* --- Handmikrofon (separates Teil) --- */
  /** PTT: echte Taste an der linken Seite; Hot-Region ist der GESAMTE Mikrofonkörper. */
  onPttDown: () => void;
  onPttUp: () => void;
  onMicChannelUp: () => void;
  onMicChannelDown: () => void;
  onMicHiLo: () => void;
  onMicSixteenC: () => void;
}

const SOFTKEY_DEBUG = ["SK1", "SK2", "SK3", "SK4"] as const;

/**
 * Platzhalter bis zur Verdrahtung: loggt jeden Tastendruck in die Konsole,
 * damit die Hot-Regions im Layout bereits prüfbar sind.
 */
export const icM330DevHandlers: IcM330Handlers = {
  onSoftKey: (i) => console.debug(`[IC-M330] ${SOFTKEY_DEBUG[i]}`),
  onChannelUp: () => console.debug("[IC-M330] CH ▲"),
  onChannelDown: () => console.debug("[IC-M330] CH ▼"),
  onLeft: () => console.debug("[IC-M330] ◀"),
  onRight: () => console.debug("[IC-M330] ▶"),
  onEnter: () => console.debug("[IC-M330] ENT"),
  onMenu: () => console.debug("[IC-M330] MENU"),
  onClear: () => console.debug("[IC-M330] CLR"),
  onSixteenC: () => console.debug("[IC-M330] 16/C"),
  onDistressDown: () => console.debug("[IC-M330] DISTRESS down"),
  onDistressUp: () => console.debug("[IC-M330] DISTRESS up"),
  onDialRotate: (d) => console.debug(`[IC-M330] DIAL ${d > 0 ? "cw" : "ccw"}`),
  onDialPress: () => console.debug("[IC-M330] DIAL press"),
  onPttDown: () => console.debug("[IC-M330] MIC PTT down"),
  onPttUp: () => console.debug("[IC-M330] MIC PTT up"),
  onMicChannelUp: () => console.debug("[IC-M330] MIC CH ▲"),
  onMicChannelDown: () => console.debug("[IC-M330] MIC CH ▼"),
  onMicHiLo: () => console.debug("[IC-M330] MIC HI/LO"),
  onMicSixteenC: () => console.debug("[IC-M330] MIC 16/C"),
};

/** Teilweise Verdrahtung erlauben; alles Unverdrahtete fällt auf die Debug-Logger zurück. */
export function withDevFallback(handlers?: Partial<IcM330Handlers>): IcM330Handlers {
  return { ...icM330DevHandlers, ...handlers };
}
