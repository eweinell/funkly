import type { Language } from "./api";

export interface UiStrings {
  pttHint: string;
  pick: string;
  newSession: string;
  done: string;
  noCopy: string;
  expected: string;
  score: string;
  statusLine: { idle: string; rx: string; stt: string; station: string; "tx-play": string };
  noReplyWrongChannel: (ch: string) => string;
  ch70Blocked: string;
  channelLabel: string;
  panelMode: { training: string; compact: string; exam: string };
  verdict: { pass: string; partial: string; fail: string; "n-a": string };
  coachingPrefix: string;
  micHelp: { title: string; body: string };
  micExplain: string;
  dsc: {
    openFlap: string;
    nature: string;
    menu: string;
    cancel: string;
    holdToSend: string;
    sending: string;
    ack: string;
    goTo16: string;
    undesignated: string;
    alertReceived: string;
    pauseAlarm: string;
    info: string;
    dscCall: string;
    individual: string;
    send: string;
    back: string;
    workingChannel: string;
    switchChannel: string;
    manual: string;
    cancelSoftkey: string;
    cancelConfirm: string;
    cancelSent: string;
  };
}

export const UI: Record<Language, UiStrings> = {
  en: {
    pttHint: "hold to transmit — or hold [SPACE]",
    pick: "SELECT EXERCISE",
    newSession: "NEW EXERCISE",
    done: "EXERCISE COMPLETE",
    noCopy: "Nothing received — hold PTT while speaking.",
    expected: "Model transmission",
    score: "Score",
    statusLine: { idle: "STBY", rx: "TX (recording)", stt: "RX …", station: "STATION …", "tx-play": "RX AUDIO" },
    noReplyWrongChannel: (ch: string) => `SYS: no reply on CH ${ch}`,
    ch70Blocked: "CH70 DSC ONLY",
    channelLabel: "CH",
    panelMode: { training: "Training", compact: "Compact", exam: "Exam" },
    verdict: { pass: "met", partial: "partial", fail: "missed", "n-a": "n/a" },
    coachingPrefix: "Next: ",
    micHelp: {
      title: "Microphone access needed",
      body: "Funkly needs the microphone to record your transmission. Please allow access in your browser/site settings and reload.",
    },
    micExplain: "Tap PTT to allow microphone access for this exercise.",
    dsc: {
      openFlap: "OPEN COVER",
      nature: "NATURE",
      menu: "MENU",
      cancel: "CANCEL",
      holdToSend: "HOLD 3s TO SEND",
      sending: "DISTRESS SENT · WAITING ACK · CH 70",
      ack: "ACK RECEIVED",
      goTo16: "GO TO CH 16",
      undesignated: "UNDESIGNATED",
      alertReceived: "DISTRESS ALERT RECEIVED",
      pauseAlarm: "PAUSE ALARM",
      info: "INFO",
      dscCall: "DSC CALL",
      individual: "INDIVIDUAL",
      send: "SEND",
      back: "BACK",
      workingChannel: "Working channel",
      switchChannel: "SWITCH CHANNEL",
      manual: "MANUAL",
      cancelSoftkey: "CANCEL DISTRESS",
      cancelConfirm: "CONFIRM CANCEL",
      cancelSent: "DISTRESS CANCELLED — proceed to CH 16 and announce cancellation",
    },
  },
  de: {
    pttHint: "zum Senden halten — oder [LEERTASTE] halten",
    pick: "ÜBUNG WÄHLEN",
    newSession: "NEUE ÜBUNG",
    done: "ÜBUNG ABGESCHLOSSEN",
    noCopy: "Nichts empfangen — PTT beim Sprechen gedrückt halten.",
    expected: "Musterspruch",
    score: "Bewertung",
    statusLine: { idle: "STBY", rx: "TX (Aufnahme)", stt: "RX …", station: "GEGENSTELLE …", "tx-play": "RX AUDIO" },
    noReplyWrongChannel: (ch: string) => `SYS: keine Antwort auf CH ${ch}`,
    ch70Blocked: "CH70 NUR DSC",
    channelLabel: "CH",
    panelMode: { training: "Training", compact: "Kompakt", exam: "Prüfung" },
    verdict: { pass: "erfüllt", partial: "teilweise", fail: "verfehlt", "n-a": "n/a" },
    coachingPrefix: "Als Nächstes: ",
    micHelp: {
      title: "Mikrofonzugriff nötig",
      body: "Funkly braucht das Mikrofon, um deinen Funkspruch aufzunehmen. Bitte in den Browser-/Website-Einstellungen freigeben und neu laden.",
    },
    micExplain: "PTT antippen, um für diese Übung das Mikrofon freizugeben.",
    dsc: {
      openFlap: "KLAPPE ÖFFNEN",
      nature: "ART",
      menu: "MENÜ",
      cancel: "STORNO",
      holdToSend: "3 S HALTEN ZUM SENDEN",
      sending: "DISTRESS GESENDET · WARTE AUF ACK · CH 70",
      ack: "ACK ERHALTEN",
      goTo16: "AUF CH 16 WECHSELN",
      undesignated: "UNDESIGNATED",
      alertReceived: "DISTRESS-ALERT EMPFANGEN",
      pauseAlarm: "ALARM PAUSE",
      info: "INFO",
      dscCall: "DSC-ANRUF",
      individual: "INDIVIDUAL",
      send: "SENDEN",
      back: "ZURÜCK",
      workingChannel: "Arbeitskanal",
      switchChannel: "KANAL WECHSELN",
      manual: "MANUELL",
      cancelSoftkey: "DISTRESS STORNIEREN",
      cancelConfirm: "STORNO BESTÄTIGEN",
      cancelSent: "DISTRESS STORNIERT — auf CH 16 wechseln und Storno durchgeben",
    },
  },
};

export function t(language: Language): UiStrings {
  return UI[language];
}
