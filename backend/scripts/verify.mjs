// Nachweisskript fuer die Kernlogik der Welle-1-Engine, ohne Testrunner
// (Leitplanke: "Node-Skript nachweisen", wenn kein Testrunner eingefuehrt wird).
// Prueft, netzwerkfrei, gegen die kompilierten (nicht gebundleten) Module:
//   - Content-Laden (YAML -> JSON-Bundle -> scenarios.ts)
//   - Phasen-/Kanal-Logik (checkChannel, advancePhase, findPhase)
//   - Rubric-Aggregation & robustes Parsen (aggregateOverallScore, reconcileRubric)
//   - Prompt-Layout (Cache-Breakpoint nur auf Block A, Block A byte-identisch)
//
// Ruft bewusst NICHT turn.ts/evaluation.ts/handler.ts auf, da deren Module-Scope
// AWS-SDK-Clients konstruiert (Bedrock/Polly/STS) - das ist Sache eines echten
// Deploys/Smoketests (funkly-qa), nicht dieses Offline-Nachweises.
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, "..");
const verifyOut = join(backendRoot, ".verify-out");

function step(label, fn) {
  process.stdout.write(`- ${label} ... `);
  fn();
  console.log("OK");
}

console.log("1) Content-Bundle erzeugen (YAML -> JSON)");
execSync("node scripts/build-content.mjs", { cwd: backendRoot, stdio: "inherit" });

console.log("2) TypeScript fuer die Verifikation kompilieren (CommonJS, .verify-out)");
rmSync(verifyOut, { recursive: true, force: true });
execSync("npx tsc -p tsconfig.verify.json", { cwd: backendRoot, stdio: "inherit" });

// tsc kopiert importierte JSON-Assets nicht in outDir (das macht nur ein Bundler
// wie esbuild beim echten Lambda-Build) - fuer den Verify-Lauf hier von Hand nachbilden.
mkdirSync(join(verifyOut, "generated"), { recursive: true });
copyFileSync(
  join(backendRoot, "src", "generated", "scenarios.generated.json"),
  join(verifyOut, "generated", "scenarios.generated.json")
);

const require = createRequire(import.meta.url);
const scenarios = require(join(verifyOut, "scenarios.js"));
const prompts = require(join(verifyOut, "prompts.js"));

console.log("3) Assertions");

let radioCheck;
step("listScenarios() liefert mindestens ein Szenario", () => {
  const all = scenarios.listScenarios();
  assert.ok(Array.isArray(all) && all.length >= 1, "erwartet mindestens 1 Szenario");
  radioCheck = all.find((s) => s.id === "radio-check") ?? all[0];
  assert.ok(radioCheck, "kein Szenario gefunden");
});

step("getScenario(id) findet ein bekanntes Szenario, unbekannte ID -> undefined", () => {
  assert.equal(scenarios.getScenario(radioCheck.id)?.id, radioCheck.id);
  assert.equal(scenarios.getScenario("does-not-exist"), undefined);
});

step("findPhase: gueltige phaseId trifft, fehlende/unbekannte faellt auf Phase 0 zurueck", () => {
  const lastPhase = radioCheck.phases[radioCheck.phases.length - 1];
  const hit = scenarios.findPhase(radioCheck, lastPhase.id);
  assert.equal(hit.phase.id, lastPhase.id);
  assert.equal(hit.index, radioCheck.phases.length - 1);

  const fallback1 = scenarios.findPhase(radioCheck, undefined);
  assert.equal(fallback1.index, 0);
  const fallback2 = scenarios.findPhase(radioCheck, "unknown-phase-id");
  assert.equal(fallback2.index, 0);
});

step("checkChannel: passender Kanal ok, falscher Kanal -> wrong-channel", () => {
  const phase = radioCheck.phases[0];
  assert.ok(phase.expectedChannel !== undefined, "Testvoraussetzung: Phase hat expectedChannel");
  const ok = scenarios.checkChannel(phase, phase.expectedChannel);
  assert.equal(ok.ok, true);
  const wrong = scenarios.checkChannel(phase, 99);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "wrong-channel");
});

step("checkChannel: Kanal 70 sperrt Sprechfunk ausser bei DSC-Phasentypen", () => {
  const voicePhase = { id: "p", expect: "call", label: { en: "x", de: "x" }, expectedChannel: 16 };
  const blocked = scenarios.checkChannel(voicePhase, "70");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "channel-70-voice-blocked");

  const dscPhase = { id: "p2", expect: "dsc-alert", label: { en: "x", de: "x" } };
  const allowed = scenarios.checkChannel(dscPhase, 70);
  assert.equal(allowed.ok, true);
});

step("checkChannel: 'working' loest gegen den Arbeitskanal der Session auf", () => {
  const phase = { id: "p", expect: "message", label: { en: "x", de: "x" }, expectedChannel: "working" };
  const setup = { vessel: "BLUEBIRD", callsign: "DL4511", mmsi: "211423658", position: "x", workingChannel: 26 };

  assert.equal(scenarios.resolveExpectedChannel(phase, setup), 26);
  assert.equal(scenarios.checkChannel(phase, 26, setup).ok, true);

  const wrong = scenarios.checkChannel(phase, 24, setup);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "wrong-channel");

  // Ohne Arbeitskanal (Szenario ohne Pool) darf die Phase nicht gegen den
  // Sentinel-String vergleichen, sonst antwortet die Station nie.
  assert.equal(scenarios.resolveExpectedChannel(phase, undefined), undefined);
  assert.equal(scenarios.checkChannel(phase, 24, undefined).ok, true);
});

// Regression: wer erst den Kanal dreht und dann bestaetigt, bekam keine Antwort -
// und weil ein Turn auf falschem Kanal die Phase nicht weiterschiebt, kam er aus
// der switch-channel-Phase nie wieder heraus.
step("checkChannel: switch-channel-Phase akzeptiert Anrufkanal UND Arbeitskanal", () => {
  const setup = { vessel: "TARA", callsign: "DM3082", mmsi: "211423658", position: "x", workingChannel: 26 };
  const switchPhase = { id: "switch-channel", expect: "switch-channel", label: { en: "x", de: "x" }, expectedChannel: 16 };

  assert.equal(scenarios.checkChannel(switchPhase, 16, setup).ok, true, "Quittung auf dem Anrufkanal");
  assert.equal(scenarios.checkChannel(switchPhase, 26, setup).ok, true, "frueh gedreht: trotzdem Antwort");
  assert.equal(scenarios.isEarlySwitch(switchPhase, 26, setup), true);
  assert.equal(scenarios.isEarlySwitch(switchPhase, 16, setup), false);

  // Ein dritter, voellig falscher Kanal bleibt stumm.
  const wrong = scenarios.checkChannel(switchPhase, 24, setup);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "wrong-channel");

  // Kanal 70 bleibt auch hier fuer Sprechfunk gesperrt.
  assert.equal(scenarios.checkChannel(switchPhase, 70, setup).reason, "channel-70-voice-blocked");

  // Die Toleranz gilt nur fuer switch-channel-Phasen.
  const callPhase = { id: "call", expect: "call", label: { en: "x", de: "x" }, expectedChannel: 16 };
  assert.equal(scenarios.isEarlySwitch(callPhase, 26, setup), false);
  assert.equal(scenarios.checkChannel(callPhase, 26, setup).reason, "wrong-channel");

  // Ohne gezogenen Arbeitskanal gibt es nichts zu tolerieren.
  assert.equal(scenarios.isEarlySwitch(switchPhase, 26, undefined), false);
});

// Regression: der Phasenzeiger rueckt nur auf `phaseDone` des Modells vor. Hielt es
// die Anrufphase fuer unvollstaendig, obwohl die Station den Arbeitskanal schon
// zugewiesen hatte, bekam der Trainee Funkstille auf genau dem Kanal, auf den die
// Station ihn geschickt hatte (UC-03: "Channel six, over" -> no reply on CH 6).
step("stationAnnouncedChannel: nur Sendungen der Station, nur 'channel <nr>'", () => {
  const said = (content) => [{ role: "assistant", content }];
  assert.equal(scenarios.stationAnnouncedChannel(said("Calypso, this is Orion, channel six, over."), 6), true);
  assert.equal(scenarios.stationAnnouncedChannel(said("change to channel 26, over"), 26), true);
  assert.equal(scenarios.stationAnnouncedChannel(said("wechseln Sie auf Kanal zwei-sechs"), 26), true);

  // "channel sixteen" ist nicht Kanal 6.
  assert.equal(scenarios.stationAnnouncedChannel(said("stay on channel sixteen"), 6), false);
  assert.equal(scenarios.stationAnnouncedChannel(said("channel 16, over"), 6), false);
  // Eine nackte Zahl im Fliesstext ist keine Kanalzuweisung.
  assert.equal(scenarios.stationAnnouncedChannel(said("we are 6 miles north"), 6), false);
  // Was der Trainee sagt, zaehlt nicht - nur was die Station gesendet hat.
  assert.equal(scenarios.stationAnnouncedChannel([{ role: "user", content: "channel six, over" }], 6), false);
  assert.equal(scenarios.stationAnnouncedChannel(undefined, 6), false);
});

step("checkChannel: nach zugewiesenem Arbeitskanal antwortet die Station dort in JEDER Phase", () => {
  const setup = { vessel: "CALYPSO", callsign: "DK2077", mmsi: "211423658", position: "x", workingChannel: 6 };
  const callPhase = { id: "call", expect: "call", label: { en: "x", de: "x" }, expectedChannel: 16 };
  const assigned = [{ role: "assistant", content: "Calypso, this is Orion, channel six, over." }];

  // Vor der Zuweisung: Kanal 6 in der Anrufphase bleibt stumm (kein Vorpreschen).
  assert.equal(scenarios.checkChannel(callPhase, 6, setup, []).reason, "wrong-channel");
  assert.equal(scenarios.isEarlySwitch(callPhase, 6, setup, []), false);

  // Nach der Zuweisung: der Trainee darf dort senden, auch wenn die Phase haengt.
  assert.equal(scenarios.checkChannel(callPhase, 6, setup, assigned).ok, true);
  assert.equal(scenarios.isEarlySwitch(callPhase, 6, setup, assigned), true);

  // Ein anderer Kanal bleibt auch nach der Zuweisung stumm.
  assert.equal(scenarios.checkChannel(callPhase, 60, setup, assigned).reason, "wrong-channel");
});

step("advanceToWorkingChannelPhase: springt auf die erste Phase des Arbeitskanals", () => {
  const scenario = scenarios.getScenario("ship-to-ship");
  const setup = { vessel: "CALYPSO", callsign: "DK2077", mmsi: "211423658", position: "x", workingChannel: 6 };
  const workingIndex = scenario.phases.findIndex((p) => p.expectedChannel === "working");

  // Aus der haengenden Anrufphase (Index 0) direkt auf die Arbeitskanal-Phase.
  const jumped = scenarios.advanceToWorkingChannelPhase(scenario, 0, setup);
  assert.equal(jumped.newIndex, workingIndex);
  assert.equal(jumped.scenarioDone, false);
  assert.deepEqual(
    jumped.completedPhaseIds,
    scenario.phases.slice(0, workingIndex).map((p) => p.id),
    "die uebersprungenen Phasen gelten als erledigt"
  );

  // Steht der Trainee schon auf der Arbeitskanal-Phase, bleibt der Zeiger dort.
  assert.equal(scenarios.advanceToWorkingChannelPhase(scenario, workingIndex, setup).newIndex, workingIndex);

  // Ohne Arbeitskanal-Phase: normaler Ein-Phasen-Schritt.
  const radio = scenarios.getScenario("radio-check");
  assert.equal(scenarios.advanceToWorkingChannelPhase(radio, 0, setup).newIndex, 1);
});

step("Block C: frueher Kanalwechsel wird dem Modell als Bewertungsfehler angesagt", () => {
  const scenario = scenarios.getScenario("routine-coast-call");
  const phase = scenario.phases.find((p) => p.expect === "switch-channel");
  const setup = { vessel: "TARA", callsign: "DM3082", mmsi: "211423658", position: "x", workingChannel: 26 };

  // Zeilenumbrueche im Prompt sind Layout, nicht Inhalt: flach vergleichen.
  const flat = (s) => s.replace(/\s+/g, " ");
  const early = flat(prompts.buildDialogPrompt(scenario, phase, "en", setup, 26, 0)[2].text);
  assert.ok(early.includes("EARLY CHANNEL SWITCH"), "Hinweis fehlt");
  assert.ok(early.includes("do NOT set noReplyReason"), "Modell darf hier nicht schweigen");
  assert.ok(early.includes("do NOT send them back to channel 16"), "kein Zurueckschicken auf 16");
  assert.ok(/FAULT, never "pass"/.test(early), "muss als Fehler gewertet werden");
  assert.ok(early.includes("channel 16"), "der Anrufkanal muss benannt sein");

  // Auf dem Anrufkanal (regulaerer Weg) darf der Hinweis nicht erscheinen.
  const regular = flat(prompts.buildDialogPrompt(scenario, phase, "en", setup, 16, 0)[2].text);
  assert.ok(!regular.includes("EARLY CHANNEL SWITCH"));

  // Haengende Anrufphase + bereits zugewiesener Kanal: derselbe Hinweis, aus der History.
  const callPhase = scenario.phases[0];
  const assigned = [{ role: "assistant", content: "Bluebird, this is Lyngby Radio, change to channel two-six, over." }];
  const viaHistory = flat(prompts.buildDialogPrompt(scenario, callPhase, "en", setup, 26, 0, assigned)[2].text);
  assert.ok(viaHistory.includes("EARLY CHANNEL SWITCH"), "History-Fall fehlt");
  // Ohne History keine Toleranz - der Trainee darf der Anrufphase nicht vorpreschen.
  const noHistory = flat(prompts.buildDialogPrompt(scenario, callPhase, "en", setup, 26, 0, [])[2].text);
  assert.ok(!noHistory.includes("EARLY CHANNEL SWITCH"));
});

// Regression: das Modell rief auf einem Kanal, den die Engine gerade freigegeben
// hatte, selbst "wrong-channel" aus (weil der Trainee sich beim Zurueckreden
// verhaspelte). Die Station schwieg, die Phase blieb stehen - Sackgasse.
step("sanitizeNoReplyReason: Kanalgruende aus der Modellantwort werden verworfen", () => {
  assert.equal(scenarios.sanitizeNoReplyReason("wrong-channel", ""), undefined);
  assert.equal(scenarios.sanitizeNoReplyReason("channel-70-voice-blocked", ""), undefined);
  assert.equal(scenarios.sanitizeNoReplyReason("unintelligible", ""), "unintelligible");
  // "unintelligible" mit Antworttext ist widerspruechlich -> Antwort gewinnt.
  assert.equal(scenarios.sanitizeNoReplyReason("unintelligible", "say again, over"), undefined);
  assert.equal(scenarios.sanitizeNoReplyReason(undefined, "roger, out"), undefined);
  assert.equal(scenarios.sanitizeNoReplyReason("nonsense", ""), undefined);
});

step("Prompt: das Modell wird nicht mehr zur eigenen Kanalpruefung aufgefordert", () => {
  const scenario = scenarios.getScenario("ship-to-ship");
  const setup = { vessel: "PELIKAN", callsign: "DM3082", mmsi: "211423658", position: "x", workingChannel: 6 };
  const blocks = prompts.buildDialogPrompt(scenario, scenario.phases[0], "en", setup, 16, 0);
  const [blockA, blockB] = blocks.map((b) => b.text);

  assert.ok(!/return reply="" and the matching noReplyReason/.test(blockB));
  assert.ok(/ALWAYS answer/.test(blockB), "Block B muss zum Antworten verpflichten");
  assert.ok(/never set noReplyReason to a channel reason/.test(blockB));
  assert.ok(/NEVER go silent over a channel/.test(blockA), "Block A muss die Regel tragen");
  // Block A darf die Kanalgruende nicht mehr als gueltige Ausgabe anbieten.
  assert.ok(!/noReplyReason.*wrong-channel/.test(blockA));
});

step("randomSetup: zieht den Arbeitskanal aus dem Pool, sonst undefined", () => {
  const withPool = scenarios.getScenario("routine-coast-call");
  const setup = scenarios.randomSetup(withPool, "en");
  assert.ok(
    withPool.setup.workingChannelPool.includes(setup.workingChannel),
    `workingChannel ${setup.workingChannel} nicht aus dem Pool`
  );

  const noPool = scenarios.randomSetup(radioCheck, "en");
  assert.equal(noPool.workingChannel, undefined);
});

step("Content: keine Phase nennt 'working' ohne workingChannelPool", () => {
  for (const s of scenarios.listScenarios()) {
    const pool = s.setup?.workingChannelPool ?? [];
    for (const p of s.phases) {
      if (p.expectedChannel === "working") {
        assert.ok(pool.length > 0, `${s.id}/${p.id}: expectedChannel 'working' ohne Pool`);
      }
    }
  }
});

step("advancePhase: phaseDone steuert Fortschritt, letzte Phase setzt scenarioDone", () => {
  const notDone = scenarios.advancePhase(radioCheck, 0, false);
  assert.equal(notDone.newIndex, 0);
  assert.equal(notDone.scenarioDone, false);

  const advanced = scenarios.advancePhase(radioCheck, 0, true);
  assert.equal(advanced.newIndex, radioCheck.phases.length > 1 ? 1 : 0);
  assert.deepEqual(advanced.completedPhaseIds, [radioCheck.phases[0].id]);

  const lastIndex = radioCheck.phases.length - 1;
  const finished = scenarios.advancePhase(radioCheck, lastIndex, true);
  assert.equal(finished.scenarioDone, true);
  assert.equal(finished.newIndex, lastIndex);
});

step("aggregateOverallScore: gewichteter Durchschnitt, n-a ausgeschlossen", () => {
  const criteria = [
    { id: "a", weight: 1, criterion: { en: "a", de: "a" } },
    { id: "b", weight: 3, criterion: { en: "b", de: "b" } },
  ];
  const rubric = [
    { id: "a", verdict: "pass", score: 100, finding: "" },
    { id: "b", verdict: "fail", score: 0, finding: "" },
  ];
  // (1*100 + 3*0) / 4 = 25
  assert.equal(scenarios.aggregateOverallScore(rubric, criteria), 25);

  const withNA = [
    { id: "a", verdict: "n-a", score: 0, finding: "" },
    { id: "b", verdict: "pass", score: 90, finding: "" },
  ];
  assert.equal(scenarios.aggregateOverallScore(withNA, criteria), 90);

  assert.equal(scenarios.aggregateOverallScore([], []), 0);
});

step("reconcileRubric: ergaenzt fehlende IDs als n-a, verwirft unbekannte IDs, faengt kaputte Verdicts ab", () => {
  const model = [
    { id: radioCheck.rubric[0].id, verdict: "pass", score: 95, finding: "gut" },
    { id: "totally-unknown-id", verdict: "pass", score: 100, finding: "sollte verworfen werden" },
    { id: radioCheck.rubric[1]?.id ?? "x", verdict: "not-a-real-verdict", score: 50, finding: "kaputt" },
  ];
  const result = scenarios.reconcileRubric(radioCheck, "de", model);
  assert.equal(result.length, radioCheck.rubric.length, "genau ein Eintrag je Szenario-Rubric-ID");
  assert.ok(!result.some((r) => r.id === "totally-unknown-id"));
  const first = result.find((r) => r.id === radioCheck.rubric[0].id);
  assert.equal(first.verdict, "pass");
  assert.equal(first.score, 95);
  if (radioCheck.rubric[1]) {
    const second = result.find((r) => r.id === radioCheck.rubric[1].id);
    assert.equal(second.verdict, "n-a", "unbekanntes Verdict wird zu n-a normalisiert");
  }
});

step("reconcileRubric: komplett kaputte/fehlende Modellantwort -> vollstaendiges n-a-Fallback (kein Crash)", () => {
  const result = scenarios.reconcileRubric(radioCheck, "en", undefined);
  assert.equal(result.length, radioCheck.rubric.length);
  assert.ok(result.every((r) => r.verdict === "n-a"));
});

step("buildDialogPrompt: 3 Bloecke, Cache-Breakpoint nur auf Block A, Block A szenario-unabhaengig", () => {
  const setup = { vessel: "BLUEBIRD", callsign: "DL4511", mmsi: "211123456", position: "test" };
  const phase = radioCheck.phases[0];
  const blocksEn = prompts.buildDialogPrompt(radioCheck, phase, "en", setup, 16, 0);
  assert.equal(blocksEn.length, 3);
  assert.deepEqual(blocksEn[0].cache_control, { type: "ephemeral" });
  assert.equal(blocksEn[1].cache_control, undefined);
  assert.equal(blocksEn[2].cache_control, undefined);
  assert.ok(blocksEn[0].text.includes("OUTPUT (single JSON object)"));
  assert.ok(blocksEn[0].text.includes('"evaluation"'), "Block A muss die (Welle-1-Abweichung) Bewertung enthalten");

  // Block A ist konstant: identisch fuer andere Sprache/Kanal/Setup.
  const blocksDe = prompts.buildDialogPrompt(radioCheck, phase, "de", setup, 26, 2);
  assert.equal(blocksEn[0].text, blocksDe[0].text, "Block A muss byte-identisch bleiben (Cache-Stabilitaet)");
  assert.notEqual(blocksEn[2].text, blocksDe[2].text, "Block C ist turnspezifisch und darf sich unterscheiden");
});

step("spokenChannel: Kanalnummer ziffernweise, EN und DE", () => {
  assert.equal(scenarios.spokenChannel(26), "two-six");
  assert.equal(scenarios.spokenChannel(72, "en"), "seven-two");
  assert.equal(scenarios.spokenChannel(6, "en"), "six");
  assert.equal(scenarios.spokenChannel(26, "de"), "zwei-sechs");
  assert.equal(scenarios.spokenChannel("16"), "one-six");
});

step("renderChannelTemplate: Platzhalter -> Kanal, ohne Arbeitskanal neutrale Umschreibung", () => {
  const t = "change to channel {{workingChannelSpoken}} (ch {{workingChannel}})";
  assert.equal(scenarios.renderChannelTemplate(t, 24), "change to channel two-four (ch 24)");
  assert.equal(scenarios.renderChannelTemplate(t, 24, "de"), "change to channel zwei-vier (ch 24)");
  // Kein roher Platzhalter, wenn das Szenario keinen Arbeitskanal zieht.
  assert.ok(!scenarios.renderChannelTemplate(t, undefined).includes("{{"));
});

// Regression: stand ein fester Beispielkanal ("... change to channel two-six")
// in Direction/Musterloesung, nannte die Station diesen statt des gezogenen
// Arbeitskanals - der Trainee wechselte und bekam "no reply" auf genau dem
// Kanal, den die Station ihm zugewiesen hatte.
step("Content: Szenarien mit Arbeitskanal-Pool tragen keinen festen Beispielkanal", () => {
  for (const s of scenarios.listScenarios()) {
    const pool = s.setup?.workingChannelPool ?? [];
    if (!pool.length) continue;
    const texts = [
      ...s.phases.flatMap((p) => [p.direction ?? "", p.sampleSolution?.en ?? "", p.sampleSolution?.de ?? ""]),
      s.sampleSolution?.en ?? "",
      s.sampleSolution?.de ?? "",
    ];
    for (const ch of pool) {
      for (const lang of ["en", "de"]) {
        // Nur "channel/Kanal <ziffern>" trifft: eine blosse Ziffernfolge wie
        // "acht" (Kanal 8) steckt sonst in gewoehnlichen Woertern ("beabsichtige").
        const spoken = scenarios.spokenChannel(ch, lang);
        const named = new RegExp(`(channel|kanal)\\s+${spoken}\\b`, "i");
        for (const text of texts) {
          assert.ok(
            !named.test(text),
            `${s.id}: fester Kanal "${spoken}" im Content - stattdessen {{workingChannelSpoken}} verwenden`
          );
        }
      }
    }
  }
});

step("buildDialogBlockB: nennt den gezogenen Arbeitskanal, keinen anderen aus dem Pool", () => {
  const scenario = scenarios.getScenario("routine-coast-call");
  const setup = { vessel: "TARA", callsign: "DM3082", mmsi: "211423658", position: "x", workingChannel: 24 };
  const phase = scenario.phases[0];
  const blockB = prompts.buildDialogPrompt(scenario, phase, "en", setup, 16, 0)[1].text;
  const blockC = prompts.buildDialogPrompt(scenario, phase, "en", setup, 16, 0)[2].text;

  assert.ok(blockB.includes("two-four"), "Block B muss den gezogenen Kanal ausgesprochen nennen");
  assert.ok(!blockB.includes("{{"), "keine rohen Platzhalter im Prompt");
  assert.ok(blockC.includes("two-four") && blockC.includes("24"));
  for (const other of scenario.setup.workingChannelPool.filter((c) => c !== 24)) {
    const spoken = scenarios.spokenChannel(other, "en");
    assert.ok(!blockB.includes(spoken), `Block B nennt fremden Pool-Kanal "${spoken}"`);
  }
});

step("buildEvaluationPrompt: 3 Bloecke, Cache-Breakpoint nur auf Block A", () => {
  const setup = { vessel: "BLUEBIRD", callsign: "DL4511", mmsi: "211123456", position: "test" };
  const blocks = prompts.buildEvaluationPrompt(
    radioCheck,
    "en",
    setup,
    radioCheck.phases[0].id,
    16,
    0,
    "STATION: hello\nTRAINEE: hi",
    "radio check please"
  );
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0].cache_control, { type: "ephemeral" });
  assert.equal(blocks[1].cache_control, undefined);
  assert.equal(blocks[2].cache_control, undefined);
  assert.ok(blocks[0].text.includes("VERDICTS"));
});

console.log("\nAlle Verifikationen erfolgreich.");
