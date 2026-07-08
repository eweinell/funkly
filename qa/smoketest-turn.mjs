// Funkly QA — Smoketest fuer die Welle-1-Turn-Engine (backend/src/turn.ts), mit
// Bedrock (@anthropic-ai/bedrock-sdk) und Polly (@aws-sdk/client-polly) GEMOCKT
// (Modul-Level-Stub ueber Node's Module._load), damit netzwerkfrei geprueft
// werden kann, was backend/scripts/verify.mjs bewusst ausspart (siehe dessen
// Kopfkommentar): handleTurn() Ende-zu-Ende inkl. AWS-SDK-Aufrufen.
//
// Prueft (Auftrag Welle-1-Verifikation, Punkt 3):
//   1) Normaler Turn: Rubric-Scores vollstaendig (ein Eintrag je Szenario-Rubric-ID),
//      Phasenfortschritt (phaseDone -> naechste Phase), audioBase64 aus dem
//      gemockten Polly-Ergebnis.
//   2) Letzte Phase + phaseDone -> done=true, scenarioDone/newIndex korrekt.
//   3) Falscher Kanal -> KEIN Bedrock-Call (Zaehler bleibt 0), reply="", passender
//      noReplyReason, Coaching nur im training-Modus.
//   4) Kaputtes Modell-JSON -> Fallback-Rubric (alle n-a), kein Crash, reply=Rohtext.
//
// Aufruf: node qa/smoketest-turn.mjs   (aus dem Repo-Root)
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import Module from "node:module";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, "..", "backend");
const verifyOut = join(backendRoot, ".verify-out");

console.log("1) Content-Bundle erzeugen (YAML -> JSON)");
execSync("node scripts/build-content.mjs", { cwd: backendRoot, stdio: "inherit" });

console.log("2) TypeScript fuer die Verifikation kompilieren (CommonJS, .verify-out)");
rmSync(verifyOut, { recursive: true, force: true });
execSync("npx tsc -p tsconfig.verify.json", { cwd: backendRoot, stdio: "inherit" });
mkdirSync(join(verifyOut, "generated"), { recursive: true });
copyFileSync(
  join(backendRoot, "src", "generated", "scenarios.generated.json"),
  join(verifyOut, "generated", "scenarios.generated.json")
);

// --- Mock-Zustand ---------------------------------------------------------
let bedrockCallCount = 0;
let nextModelText = "";

class FakeAnthropicBedrock {
  constructor() {
    this.messages = {
      create: async () => {
        bedrockCallCount++;
        return { content: [{ type: "text", text: nextModelText }] };
      },
    };
  }
}

class FakePollyClient {
  async send() {
    return { AudioStream: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } };
  }
}
class FakeSynthesizeSpeechCommand {
  constructor(args) {
    Object.assign(this, args);
  }
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@anthropic-ai/bedrock-sdk") {
    return { AnthropicBedrock: FakeAnthropicBedrock };
  }
  if (request === "@aws-sdk/client-polly") {
    return { PollyClient: FakePollyClient, SynthesizeSpeechCommand: FakeSynthesizeSpeechCommand };
  }
  return originalLoad.apply(this, arguments);
};

const require2 = Module.createRequire(join(verifyOut, "turn.js"));
const { handleTurn } = require2(join(verifyOut, "turn.js"));
const scenarios = require2(join(verifyOut, "scenarios.js"));

const radioCheck = scenarios.getScenario("radio-check");
assert.ok(radioCheck, "radio-check Szenario nicht geladen");
const rubricIds = radioCheck.rubric.map((r) => r.id);

const baseReq = {
  scenarioId: "radio-check",
  language: "en",
  mode: "training",
  setup: { vessel: "BLUEBIRD", callsign: "DL4511", mmsi: "211123456", position: "test position" },
  history: [],
  transcript: "Lyngby Radio, this is Bluebird, radio check, over.",
  channel: 16,
};

function step(label, fn) {
  process.stdout.write(`- ${label} ... `);
  return Promise.resolve(fn()).then(() => console.log("OK"));
}

async function main() {
  await step("normaler Turn: vollstaendige Rubric, Phasenfortschritt, Audio aus Polly-Mock", async () => {
    bedrockCallCount = 0;
    nextModelText = JSON.stringify({
      reply: "Bluebird, this is Lyngby Radio, I read you five, over.",
      stationId: "lyngby-radio",
      phaseId: "closing",
      phaseDone: true,
      done: false,
      evaluation: {
        overallScore: 88,
        rubric: rubricIds.map((id) => ({ id, verdict: "pass", score: 90, finding: "gut" })),
        expected: "model transmission",
      },
    });
    const res = await handleTurn({ ...baseReq, phaseId: "call" });
    assert.equal(bedrockCallCount, 1, "genau ein Bedrock-Call erwartet");
    assert.equal(res.evaluation.rubric.length, rubricIds.length, "ein Rubric-Eintrag je Szenario-Kriterium erwartet");
    assert.deepEqual(
      res.evaluation.rubric.map((r) => r.id).sort(),
      [...rubricIds].sort()
    );
    assert.equal(res.phase.currentPhaseId, "closing", "Phase muss nach phaseDone=true fortschreiten");
    assert.equal(res.phase.currentIndex, 1);
    assert.deepEqual(res.phase.completedPhaseIds, ["call"]);
    assert.equal(res.done, false, "letzte Phase noch nicht erreicht -> done=false");
    assert.ok(res.audioBase64.length > 0, "audioBase64 aus Polly-Mock erwartet");
    assert.equal(Buffer.from(res.audioBase64, "base64").toString(), Buffer.from([1, 2, 3]).toString());
  });

  await step("letzte Phase + phaseDone -> done=true", async () => {
    bedrockCallCount = 0;
    nextModelText = JSON.stringify({
      reply: "Bluebird, this is Lyngby Radio, roger, out.",
      stationId: "lyngby-radio",
      phaseDone: true,
      done: true,
      evaluation: {
        overallScore: 95,
        rubric: rubricIds.map((id) => ({ id, verdict: "pass", score: 95, finding: "gut" })),
      },
    });
    const res = await handleTurn({ ...baseReq, phaseId: "closing", transcript: "Lyngby Radio, this is Bluebird, received, out." });
    assert.equal(res.phase.currentPhaseId, "closing", "letzte Phase bleibt aktueller Index");
    assert.equal(res.done, true, "letzte Phase + phaseDone=true -> scenarioDone");
    assert.deepEqual(res.phase.completedPhaseIds, ["call", "closing"]);
  });

  await step("falscher Kanal -> KEIN Bedrock-Call, noReplyReason gesetzt, Coaching nur im Training", async () => {
    bedrockCallCount = 0;
    const res = await handleTurn({ ...baseReq, phaseId: "call", channel: 6, mode: "training" });
    assert.equal(bedrockCallCount, 0, "bei falschem Kanal darf Bedrock NICHT aufgerufen werden");
    assert.equal(res.reply, "");
    assert.equal(res.noReplyReason, "wrong-channel");
    assert.equal(res.evaluation.overallScore, 0);
    assert.ok(res.coaching, "Training-Modus soll Coaching-Hinweis liefern");
    assert.equal(res.audioBase64, "");

    const resExam = await handleTurn({ ...baseReq, phaseId: "call", channel: 6, mode: "exam" });
    assert.equal(resExam.coaching, undefined, "Pruefungsmodus darf keinen Coaching-Hinweis liefern");
  });

  await step("Kanal 70 sperrt Sprechfunk (channel-70-voice-blocked), kein Bedrock-Call", async () => {
    bedrockCallCount = 0;
    const res = await handleTurn({ ...baseReq, phaseId: "call", channel: 70 });
    assert.equal(bedrockCallCount, 0);
    assert.equal(res.noReplyReason, "channel-70-voice-blocked");
  });

  await step("kaputtes Modell-JSON -> Fallback-Rubric (alle n-a), kein Crash, reply = Rohtext", async () => {
    bedrockCallCount = 0;
    nextModelText = "Sorry, I cannot produce JSON right now, here is prose instead.";
    const res = await handleTurn({ ...baseReq, phaseId: "call" });
    assert.equal(bedrockCallCount, 1);
    assert.equal(res.evaluation.rubric.length, rubricIds.length);
    assert.ok(res.evaluation.rubric.every((r) => r.verdict === "n-a"), "Fallback muss alle Kriterien als n-a markieren");
    assert.equal(res.evaluation.overallScore, 0);
    assert.equal(res.reply, nextModelText.trim(), "Rohtext soll als reply durchgereicht werden (kein Crash)");
    assert.equal(res.done, false);
  });

  await step("Modell liefert unbekannte Rubric-IDs + kaputtes Verdict -> reconcileRubric raeumt auf", async () => {
    bedrockCallCount = 0;
    nextModelText = JSON.stringify({
      reply: "ok",
      stationId: "lyngby-radio",
      phaseDone: false,
      evaluation: {
        overallScore: 999, // wird ignoriert/serverseitig neu berechnet
        rubric: [
          { id: rubricIds[0], verdict: "pass", score: 100, finding: "ok" },
          { id: "does-not-exist-in-schema", verdict: "pass", score: 100, finding: "sollte verworfen werden" },
          { id: rubricIds[1], verdict: "totally-invalid", score: 50, finding: "kaputt" },
        ],
      },
    });
    const res = await handleTurn({ ...baseReq, phaseId: "call" });
    assert.equal(res.evaluation.rubric.length, rubricIds.length, "unbekannte IDs verworfen, fehlende ergaenzt");
    assert.ok(!res.evaluation.rubric.some((r) => r.id === "does-not-exist-in-schema"));
    const second = res.evaluation.rubric.find((r) => r.id === rubricIds[1]);
    assert.equal(second.verdict, "n-a", "ungueltiges Verdict wird zu n-a normalisiert");
    // overallScore wird server-seitig aus den (jetzt bereinigten) Einzelscores neu
    // berechnet, NICHT vom Modell uebernommen (999 darf nicht durchschlagen).
    assert.notEqual(res.evaluation.overallScore, 999);
  });

  console.log("\nAlle Turn-Engine-Smoketests (gemockt: Bedrock + Polly) erfolgreich.");
}

main().catch((err) => {
  console.error("\nSMOKETEST FEHLGESCHLAGEN:", err);
  process.exitCode = 1;
});
