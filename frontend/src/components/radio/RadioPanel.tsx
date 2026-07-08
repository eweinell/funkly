import { useMemo } from "react";
import { useSession } from "../../state/SessionContext";
import { t } from "../../i18n";
import { Lcd } from "./Lcd";
import { ChannelSelector } from "./ChannelSelector";
import { Knob } from "./Knob";
import { PttBar } from "./PttBar";
import { DscOverlay } from "./DscOverlay";
import styles from "./RadioPanel.module.css";

/** Funkgeraet: LCD, Kanalwahl, Regler, PTT, DSC-Bedienteil (UI-SPEZIFIKATION §1/§2/§7/§8). */
export function RadioPanel() {
  const {
    state,
    language,
    setChannel,
    appendSystemLog,
    pttDown,
    pttUp,
    pttLocked,
    ch70Flash,
    audioSettings,
    setAudioSettings,
  } = useSession();
  const strings = t(language);
  const { scenario, setup, status, done, channel } = state;
  const busy = status !== "idle";

  const lcdLine2 = useMemo(() => {
    if (!setup) return "NO SESSION";
    return `${setup.vessel} ${setup.callsign} MMSI ${setup.mmsi}`;
  }, [setup]);
  const lcdLine3 = scenario ? `${scenario.useCase} ${scenario.title[language]}` : "— " + strings.pick + " —";

  // CH70 (nur DSC) bleibt bewusst NICHT disabled: der Druck muss ankommen,
  // damit pttDown() den Fehlerton + LCD-Hinweis ausloesen kann (UI-SPEZIFIKATION §1).
  const pttDisabled = !scenario || !setup || done || pttLocked;

  return (
    <section className={styles.radio} aria-label="VHF radio">
      <div className="screw tl" />
      <div className="screw tr" />
      <div className="screw bl" />
      <div className="screw br" />

      <Lcd
        channel={channel.current}
        statusLabel={strings.statusLine[status]}
        busy={busy}
        line2={lcdLine2}
        line3={lcdLine3}
        warningText={ch70Flash ? strings.ch70Blocked : undefined}
      />

      <div className={styles.controls}>
        <ChannelSelector channel={channel.current} onChange={setChannel} disabled={busy} label={strings.channelLabel} />

        <div className={styles.knobs}>
          <Knob label="VOL" value={audioSettings.volume} onChange={(v) => setAudioSettings({ ...audioSettings, volume: v })} />
          <Knob
            label="SQL"
            value={audioSettings.squelch}
            onChange={(v) => setAudioSettings({ ...audioSettings, squelch: v })}
          />
        </div>

        <div className={styles.leds}>
          <span className={`${styles.led} ${styles.tx}${status === "rx" ? " " + styles.on : ""}`} />
          <span className={styles.ctlLabel}>TX</span>
          <span
            className={`${styles.led} ${styles.rx}${status === "tx-play" || status === "station" ? " " + styles.on : ""}`}
          />
          <span className={styles.ctlLabel}>RX</span>
        </div>

        <DscOverlay
          language={language}
          disabled={status === "rx"}
          autoAlertForUseCase14={scenario?.useCase === "UC-14" && !!setup}
          onSystemLog={appendSystemLog}
          onSwitchChannel={setChannel}
        />
      </div>

      <PttBar active={status === "rx"} disabled={pttDisabled} hint={strings.pttHint} onDown={pttDown} onUp={pttUp} />
    </section>
  );
}
