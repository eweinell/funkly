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
