import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, Evaluation, Language, ScenarioInfo, SessionSetup } from "./api";
import { PttRecorder, durationSeconds } from "./audio/pttRecorder";
import { transcribeClip } from "./audio/transcribe";
import { playRadio } from "./audio/radioFx";

type Status = "idle" | "rx" | "stt" | "station" | "tx-play";

interface LogEntry {
  kind: "user" | "station" | "system";
  text: string;
  evaluation?: Evaluation;
}

const UI = {
  en: {
    pttHint: "hold to transmit — or hold [SPACE]",
    pick: "SELECT EXERCISE",
    newSession: "NEW EXERCISE",
    done: "EXERCISE COMPLETE",
    noCopy: "Nothing received — hold PTT while speaking.",
    expected: "Model transmission",
    score: "Score",
    statusLine: { idle: "STBY", rx: "TX (recording)", stt: "RX …", station: "STATION …", "tx-play": "RX AUDIO" },
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
  },
} as const;

export default function App() {
  const [language, setLanguage] = useState<Language>("en");
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [scenario, setScenario] = useState<ScenarioInfo | null>(null);
  const [setup, setSetup] = useState<SessionSetup | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [done, setDone] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [channel, setChannel] = useState(16);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef(new PttRecorder());
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const busy = status !== "idle";
  const t = UI[language];

  useEffect(() => {
    api
      .scenarios()
      .then((r) => setScenarios(r.scenarios))
      .catch((e) => setError(String(e)));
  }, []);

  const startScenario = useCallback(
    async (s: ScenarioInfo) => {
      setError(null);
      setScenario(s);
      setDone(false);
      setLog([]);
      history.current = [];
      setChannel(16);
      try {
        const { setup } = await api.newSession();
        setSetup(setup);
      } catch (e) {
        setError(String(e));
      }
    },
    []
  );

  const endTurn = useCallback(async () => {
    if (!recorder.current.recording || !scenario || !setup) return;
    setStatus("stt");
    try {
      const chunks = await recorder.current.stop();
      if (durationSeconds(chunks) < 0.4) {
        setLog((l) => [...l, { kind: "system", text: t.noCopy }]);
        setStatus("idle");
        return;
      }
      const transcript = await transcribeClip(chunks, language);
      if (!transcript) {
        setLog((l) => [...l, { kind: "system", text: t.noCopy }]);
        setStatus("idle");
        return;
      }
      setLog((l) => [...l, { kind: "user", text: transcript }]);
      setStatus("station");
      const result = await api.turn({
        scenarioId: scenario.id,
        language,
        setup,
        history: history.current,
        transcript,
      });
      history.current.push({ role: "user", content: transcript });
      history.current.push({ role: "assistant", content: result.reply });
      setLog((l) => [...l, { kind: "station", text: result.reply, evaluation: result.evaluation }]);
      if (result.done) setDone(true);
      setStatus("tx-play");
      await playRadio(result.audioBase64);
    } catch (e) {
      setError(String(e));
    } finally {
      setStatus("idle");
    }
  }, [scenario, setup, language, t.noCopy]);

  const pttDown = useCallback(async () => {
    if (busy || !scenario || !setup || done) return;
    setError(null);
    try {
      setStatus("rx");
      await recorder.current.start();
    } catch (e) {
      setStatus("idle");
      setError("Mikrofon: " + String(e));
    }
  }, [busy, scenario, setup, done]);

  const pttUp = useCallback(() => {
    if (status === "rx") void endTurn();
  }, [status, endTurn]);

  // Leertaste als PTT
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        void pttDown();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        pttUp();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [pttDown, pttUp]);

  const lcdLine2 = useMemo(() => {
    if (!setup) return "NO SESSION";
    return `${setup.vessel} ${setup.callsign} MMSI ${setup.mmsi}`;
  }, [setup]);

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
        {/* ------------- Funkgeraet ------------- */}
        <section className="radio" aria-label="VHF radio">
          <div className="screw tl" /><div className="screw tr" /><div className="screw bl" /><div className="screw br" />

          <div className="lcd">
            <div className="lcd-row1">
              <span className="lcd-ch">CH {String(channel).padStart(2, "0")}</span>
              <span className={"lcd-status" + (busy ? " blink" : "")}>{t.statusLine[status]}</span>
            </div>
            <div className="lcd-row2">{lcdLine2}</div>
            <div className="lcd-row3">{scenario ? `${scenario.useCase} ${scenario.title[language]}` : "— " + t.pick + " —"}</div>
          </div>

          <div className="controls">
            <div className="ch-buttons">
              <button onClick={() => setChannel((c) => Math.min(88, c + 1))} disabled={busy}>▲</button>
              <span className="ctl-label">CH</span>
              <button onClick={() => setChannel((c) => Math.max(1, c - 1))} disabled={busy}>▼</button>
            </div>

            <div className="leds">
              <span className={"led tx" + (status === "rx" ? " on" : "")} /><span className="ctl-label">TX</span>
              <span className={"led rx" + (status === "tx-play" || status === "station" ? " on" : "")} /><span className="ctl-label">RX</span>
            </div>

            <button className="distress" title="DSC DISTRESS (UC-13 — folgt)" disabled>
              <span>DISTRESS</span>
            </button>
          </div>

          <button
            className={"ptt" + (status === "rx" ? " active" : "")}
            onPointerDown={pttDown}
            onPointerUp={pttUp}
            onPointerLeave={pttUp}
            disabled={!scenario || !setup || done || (busy && status !== "rx")}
          >
            PTT
          </button>
          <div className="ptt-hint">{t.pttHint}</div>
        </section>

        {/* ------------- Uebung & Log ------------- */}
        <section className="panel">
          {!scenario && (
            <>
              <h2 className="panel-title">{t.pick}</h2>
              <div className="scenario-list">
                {scenarios.map((s) => (
                  <button key={s.id} className="scenario-card" onClick={() => startScenario(s)}>
                    <span className="uc">{s.useCase}</span>
                    <span className="sc-title">{s.title[language]}</span>
                    <span className="sc-brief">{s.briefing[language]}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {scenario && (
            <>
              <div className="briefing">
                <span className="uc">{scenario.useCase}</span> {scenario.briefing[language]}
              </div>
              <div className="log">
                {log.map((entry, i) => (
                  <div key={i} className={"entry " + entry.kind}>
                    <div className="entry-text">
                      <span className="who">
                        {entry.kind === "user" ? "YOU" : entry.kind === "station" ? "STN" : "SYS"}
                      </span>
                      {entry.text}
                    </div>
                    {entry.evaluation && (
                      <details className="eval" open>
                        <summary>
                          {t.score}: <b>{entry.evaluation.score}</b>/100
                        </summary>
                        <ul>
                          {entry.evaluation.findings.map((f, j) => (
                            <li key={j}>{f}</li>
                          ))}
                        </ul>
                        {entry.evaluation.expected && (
                          <p className="expected">
                            <b>{t.expected}:</b> {entry.evaluation.expected}
                          </p>
                        )}
                      </details>
                    )}
                  </div>
                ))}
                {done && <div className="entry system done-banner">■ {t.done} ■</div>}
              </div>
              <button className="new-session" onClick={() => setScenario(null)} disabled={busy}>
                {t.newSession}
              </button>
            </>
          )}

          {error && <div className="error">{error}</div>}
        </section>
      </main>
    </div>
  );
}
