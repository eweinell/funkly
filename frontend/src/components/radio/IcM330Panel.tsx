import { useCallback, useMemo, useState } from "react";
import { useSession } from "../../state/SessionContext";
import { t } from "../../i18n";
import { useDscController } from "./dsc/dscController";
import { useIncomingAlert } from "./dsc/useIncomingAlert";
import { DscScreens } from "./dsc/DscScreens";
import { usePttKeyboard } from "./usePttKeyboard";
import { IcM330Skin } from "./skins/icm330";
import type { IcM330Handlers, IcM330LcdProps, IcM330SoftKeyIndex } from "./skins/icm330";
import type { TxStatus } from "../../state/types";
import styles from "./IcM330Panel.module.css";

/**
 * Verdrahtung des IC-M330-Skins: uebersetzt die physischen Bedienelemente des
 * Geraets (types.ts) in die Session-Aktionen, die der Classic-Skin ueber eigene
 * Widgets anbietet — PTT (Mikrofonkoerper), Kanalwahl (CH▲▼ / 16/C), DISTRESS
 * und DSC-Menue (Klappe + MENU-Taste), VOL/SQL (Drehknopf), Positionsanzeige
 * (LCD). Der Skin bleibt praesentational, die Session-Logik bleibt im Store.
 */

const CHANNEL_MIN = 1;
const CHANNEL_MAX = 88;
const DIAL_STEP = 0.05;

/** Status-Tag des LCD: kurze Segmentwoerter statt der langen Statuszeile des Classic-Skins. */
const STATUS_TAG: Record<TxStatus, string> = {
  idle: "STBY",
  rx: "TX",
  stt: "BUSY",
  station: "BUSY",
  "tx-play": "RX",
};

/**
 * `SessionSetup.position` ist ausgeschriebener Freitext in der Sessionsprache
 * (backend/src/contracts.ts), z. B. "54 degrees 32 decimal 5 minutes north,
 * 011 degrees 05 minutes east (off Warnemuende)" bzw. "… Grad … Minuten Nord …".
 * Das LCD zeigt stattdessen die kompakte Geraeteschreibweise auf zwei Zeilen.
 */
// Wortgrenzen sind noetig, weil `minutes?` sonst das "Minute" aus "Minuten" frisst
// und das uebrige "n" als Hemisphaere durchginge.
const POSITION_PART =
  /(\d{1,3})\s*(?:degrees?\b|grad\b|°)\s*(\d{1,2})(?:\s*(?:decimal\b|komma\b|[.,])\s*(\d))?\s*(?:minutes?\b|minuten\b|')?\s*(north|nord|south|sued|süd|east|ost|west|[nsew])\b/gi;

const HEMISPHERE: Record<string, string> = {
  north: "N", nord: "N", n: "N",
  south: "S", sued: "S", süd: "S", s: "S",
  east: "E", ost: "E", e: "E",
  west: "W", w: "W",
};

const PLACEHOLDER = ["--°--.-'N", "---°--.-'E"];

function formatPart(degrees: string, minutes: string, decimal: string | undefined, hemisphere: string): string {
  const isLatitude = hemisphere === "N" || hemisphere === "S";
  const deg = degrees.padStart(isLatitude ? 2 : 3, "0");
  const min = minutes.padStart(2, "0") + (decimal ? "." + decimal : "");
  return `${deg}°${min}'${hemisphere}`;
}

/** Zwei LCD-Zeilen: Breite (z. B. `54°32.5'N`) und Laenge (`011°05'E`). */
function positionLines(position: string | undefined): string[] {
  if (!position) return PLACEHOLDER;
  const lines: string[] = [];
  for (const [, deg, min, dec, hem] of position.matchAll(POSITION_PART)) {
    const hemisphere = HEMISPHERE[hem.toLowerCase()];
    if (hemisphere) lines.push(formatPart(deg, min, dec, hemisphere));
    if (lines.length === 2) break;
  }
  // Unerwartetes Format (anderer Pool-Text): lieber Striche als abgeschnittener Fliesstext.
  return lines.length === 2 ? lines : PLACEHOLDER;
}

export function IcM330Panel() {
  const {
    state,
    language,
    setChannel,
    appendSystemLog,
    pttDown,
    pttUp,
    ch70Flash,
    audioSettings,
    setAudioSettings,
  } = useSession();
  const strings = t(language);
  const { scenario, setup, status, channel } = state;

  // VOL/SQL teilen sich einen Knopf: kurzer Druck schaltet um (wie am Original).
  const [dialMode, setDialMode] = useState<"volume" | "squelch">("volume");
  // Sendeleistung ist am Simulator ohne Wirkung, aber HI/LO soll sichtbar quittieren.
  const [highPower, setHighPower] = useState(true);

  const dsc = useDscController({ onSystemLog: appendSystemLog, onSwitchChannel: setChannel });
  const alert = useIncomingAlert({
    enabled: scenario?.useCase === "UC-14" && !!setup,
    language,
    onSystemLog: appendSystemLog,
    onTrigger: () => dsc.dispatch({ type: "TRIGGER_INCOMING_ALERT" }),
  });

  usePttKeyboard(pttDown, pttUp);

  const stepChannel = useCallback(
    (delta: number) => {
      const current = Number(channel.current) || 16;
      setChannel(Math.min(CHANNEL_MAX, Math.max(CHANNEL_MIN, current + delta)));
    },
    [channel.current, setChannel]
  );

  const toggleHighPower = useCallback(() => setHighPower((p) => !p), []);

  // Softkeys sind kontextabhaengig belegt (Index statt Label, s. types.ts). Was der
  // Simulator nicht kennt (SCAN/DW/CH-WX), bleibt unbelegt statt etwas vorzutaeuschen.
  const [softkeyLabels, softkeyActions] = useMemo<
    [IcM330LcdProps["softkeyLabels"], (() => void)[]]
  >(() => {
    const noop = () => undefined;
    switch (dsc.state.screen) {
      case "closed":
        return [
          ["DSC", "16/C", highPower ? "HI/LO" : "LO/HI", "CH/WX"],
          [() => dsc.dispatch({ type: "OPEN_MENU" }), () => setChannel(16), toggleHighPower, noop],
        ];
      case "armed":
      case "countdown":
      case "nature":
        return [["NATURE", "", "", "CLR"], [() => dsc.dispatch({ type: "OPEN_NATURE" }), noop, noop, dsc.closeFlap]];
      default:
        // Waehrend Senden/ACK/Storno fuehren nur die Screens selbst weiter.
        return [["", "", "", ""], [noop, noop, noop, noop]];
    }
  }, [dsc, highPower, setChannel, toggleHighPower]);

  const handlers = useMemo<Partial<IcM330Handlers>>(
    () => ({
      // pttDown prueft selbst auf Szenario/Sperre/CH70 (turnActions.ts) — der Druck
      // muss ankommen, damit CH70 den Fehlerton und die LCD-Warnung ausloesen kann.
      onPttDown: pttDown,
      onPttUp: pttUp,

      onChannelUp: () => stepChannel(1),
      onChannelDown: () => stepChannel(-1),
      onMicChannelUp: () => stepChannel(1),
      onMicChannelDown: () => stepChannel(-1),
      onSixteenC: () => setChannel(16),
      onMicSixteenC: () => setChannel(16),
      onMicHiLo: toggleHighPower,

      onSoftKey: (i: IcM330SoftKeyIndex) => softkeyActions[i](),
      onMenu: () => dsc.dispatch({ type: "OPEN_MENU" }),
      // CLR verlaesst den offenen DSC-Screen; im Standby gibt es nichts zu verlassen
      // (closeFlap wuerde sonst den Klappen-Klack ohne sichtbare Wirkung spielen).
      onClear: () => {
        if (dsc.state.screen !== "closed") dsc.closeFlap();
      },

      // Klappe oeffnen = DSC-Automat scharf schalten; Halten der Taste startet den
      // 3-Sekunden-Countdown, Loslassen bricht ihn ab (dscController.ts).
      onDistressFlapOpen: dsc.openFlap,
      onDistressFlapClose: dsc.closeFlap,
      onDistressDown: () => {
        if (status === "rx") return;
        // Die Klappe bleibt offen, auch nachdem der Automat zurueckgesetzt hat (RESET
        // nach GO TO 16) — dann erst wieder scharf schalten. Waehrend Senden/ACK darf
        // ein weiterer Druck keinen zweiten Countdown starten.
        if (dsc.state.screen === "closed") dsc.openFlap();
        else if (dsc.state.screen !== "armed" && dsc.state.screen !== "nature") return;
        dsc.holdStart();
      },
      onDistressUp: dsc.holdAbort,

      onDialPress: () => setDialMode((m) => (m === "volume" ? "squelch" : "volume")),
      onDialRotate: (direction: 1 | -1) => {
        const next = Math.min(1, Math.max(0, audioSettings[dialMode] + direction * DIAL_STEP));
        setAudioSettings({ ...audioSettings, [dialMode]: next });
      },
    }),
    [pttDown, pttUp, stepChannel, setChannel, toggleHighPower, softkeyActions, dsc, status, audioSettings, dialMode, setAudioSettings]
  );

  const lcd = useMemo<IcM330LcdProps>(
    () => ({
      channel: channel.current,
      statusTag: STATUS_TAG[status],
      powerLabel: highPower ? "25W" : "1W",
      infoLines: [
        ...positionLines(setup?.position),
        `${dialMode === "volume" ? "VOL" : "SQL"} ${Math.round(audioSettings[dialMode] * 100)}`,
      ],
      softkeyLabels,
      favorite: String(channel.current) === "16",
      warningText: ch70Flash ? strings.ch70Blocked : undefined,
    }),
    [channel.current, status, highPower, setup?.position, dialMode, audioSettings, softkeyLabels, ch70Flash, strings.ch70Blocked]
  );

  return (
    <div className={styles.wrap}>
      <IcM330Skin handlers={handlers} lcd={lcd} transmitting={status === "rx"} />
      <DscScreens controller={dsc} language={language} alert={alert.current} onSwitchChannel={setChannel} />
      <div className={styles.hint}>{strings.pttHint}</div>
    </div>
  );
}
