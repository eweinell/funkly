import { useMemo } from "react";
import { Language } from "./api";
import { useSession } from "./state/SessionContext";
import { t } from "./i18n";
import { RadioPanel } from "./components/radio/RadioPanel";
import { IcM330Skin } from "./components/radio/skins/icm330";
import { ScenarioPicker } from "./components/training/ScenarioPicker";
import { Briefing } from "./components/training/Briefing";
import { PhaseStepper } from "./components/training/PhaseStepper";
import { CoachingLine } from "./components/training/CoachingLine";
import { TurnLog } from "./components/training/TurnLog";
import { MicHelpBanner, isMicPermissionError } from "./components/training/MicHelpBanner";
import { useWakeLock } from "./hooks/useWakeLock";
import styles from "./App.module.css";

export default function App() {
  const { state, language, setLanguage, panelMode, setPanelMode, startScenario, endSession } = useSession();
  const { scenario, scenarios, log, done, phase } = state;
  const busy = state.status !== "idle";
  const strings = t(language);

  useWakeLock(!!scenario && !done);

  const latestCoaching = useMemo(() => {
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].coaching) return log[i].coaching;
    }
    return undefined;
  }, [log]);

  return (
    <div className="deck">
      <header className="brandbar">
        <span className="brand">FUNKLY</span>
        <span className="brand-sub">VHF DSC MARINE TRAINER · SRC</span>
        <div className="lang-switch" role="group" aria-label="Language">
          {(["en", "de"] as Language[]).map((l) => (
            <button key={l} className={l === language ? "on" : ""} onClick={() => setLanguage(l)} disabled={busy}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="layout">
        {/* Layout-Vorschau des unverdrahteten IC-M330-Skins (?skin=icm330);
            Tasten loggen nur in die Konsole. Umschalter kommt mit der Verdrahtung. */}
        {new URLSearchParams(window.location.search).get("skin") === "icm330" ? <IcM330Skin /> : <RadioPanel />}

        <section className={styles.panel}>
          {!scenario && (
            <ScenarioPicker scenarios={scenarios} language={language} title={strings.pick} onSelect={startScenario} />
          )}

          {scenario && (
            <>
              <Briefing
                scenario={scenario}
                language={language}
                panelMode={panelMode}
                onPanelModeChange={setPanelMode}
                strings={strings}
              />
              {panelMode !== "exam" && (
                <PhaseStepper
                  language={language}
                  phases={scenario.phases}
                  currentPhaseId={phase?.currentPhaseId}
                  currentIndex={phase?.currentIndex}
                  totalPhases={phase?.totalPhases}
                  completedPhaseIds={phase?.completedPhaseIds}
                />
              )}
              <CoachingLine text={latestCoaching} panelMode={panelMode} prefix={strings.coachingPrefix} />
              <TurnLog log={log} language={language} panelMode={panelMode} done={done} doneLabel={strings.done} />
              <button className={styles.newSession} onClick={endSession} disabled={busy}>
                {strings.newSession}
              </button>
            </>
          )}

          {state.error && isMicPermissionError(state.error) && (
            <MicHelpBanner title={strings.micHelp.title} body={strings.micHelp.body} />
          )}
          {state.error && !isMicPermissionError(state.error) && <div className="error">{state.error}</div>}
        </section>
      </main>
    </div>
  );
}
