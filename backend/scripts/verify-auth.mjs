// Nachweisskript fuer den Auth-Guard (Paket "Zugangsschutz V1", Querschnitt).
// Ruft den echten `handler` aus handler.ts dreimal mit synthetischen API-Gateway-
// v2-Events auf, bei gesetzten ACCESS_CODE/ORIGIN_SECRET-Env-Variablen:
//   1) ohne Header                              -> 403 (Origin fehlt, wird zuerst geprueft)
//   2) mit korrektem Origin, aber falschem Code -> 401
//   3) mit beiden korrekten Headern              -> Route laeuft (200, Szenarienliste)
// Netzwerkfrei: /api/scenarios ruft weder Bedrock noch Polly noch STS auf; das
// Konstruieren des STSClient im Modul-Scope von handler.ts macht selbst keinen
// Netzwerk-Call (der passiert erst bei .send()).
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, "..");
const verifyOut = join(backendRoot, ".verify-out");

async function step(label, fn) {
  process.stdout.write(`- ${label} ... `);
  await fn();
  console.log("OK");
}

console.log("1) Content-Bundle erzeugen (YAML -> JSON), damit /api/scenarios Daten hat");
execSync("node scripts/build-content.mjs", { cwd: backendRoot, stdio: "inherit" });

console.log("2) TypeScript fuer die Verifikation kompilieren (CommonJS, .verify-out)");
rmSync(verifyOut, { recursive: true, force: true });
execSync("npx tsc -p tsconfig.verify.json", { cwd: backendRoot, stdio: "inherit" });

// tsc kopiert importierte JSON-Assets nicht in outDir - fuer den Verify-Lauf
// von Hand nachbilden (wie in scripts/verify.mjs).
mkdirSync(join(verifyOut, "generated"), { recursive: true });
copyFileSync(
  join(backendRoot, "src", "generated", "scenarios.generated.json"),
  join(verifyOut, "generated", "scenarios.generated.json")
);

process.env.ACCESS_CODE = "s3cret-code";
process.env.ORIGIN_SECRET = "cloudfront-only-secret";

const require = createRequire(import.meta.url);
const { handler } = require(join(verifyOut, "handler.js"));

function makeEvent(headers) {
  return {
    requestContext: { http: { method: "GET" } },
    rawPath: "/api/scenarios",
    headers: headers ?? {},
  };
}

console.log("3) Assertions");

await step("ohne Header -> 403 (Origin-Pruefung greift zuerst)", async () => {
  const res = await handler(makeEvent({}));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(JSON.parse(res.body), { error: "forbidden" });
});

await step("mit korrektem Origin, aber falschem/fehlendem Zugangscode -> 401", async () => {
  const res = await handler(
    makeEvent({ "x-funkly-origin": "cloudfront-only-secret", "x-funkly-access": "wrong" })
  );
  assert.equal(res.statusCode, 401);
  assert.deepEqual(JSON.parse(res.body), { error: "unauthorized" });
});

await step("mit beiden korrekten Headern -> Route laeuft (200, Szenarienliste)", async () => {
  const res = await handler(
    makeEvent({ "x-funkly-origin": "cloudfront-only-secret", "x-funkly-access": "s3cret-code" })
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.scenarios) && body.scenarios.length >= 1);
});

await step("OPTIONS wird immer durchgelassen (204), auch ohne Header", async () => {
  const res = await handler({
    requestContext: { http: { method: "OPTIONS" } },
    rawPath: "/api/scenarios",
    headers: {},
  });
  assert.equal(res.statusCode, 204);
});

await step("Env-Variablen nicht gesetzt -> Pruefung entfaellt (Dev/Mock), Route laeuft", async () => {
  delete process.env.ACCESS_CODE;
  delete process.env.ORIGIN_SECRET;
  const res = await handler(makeEvent({}));
  assert.equal(res.statusCode, 200);
});

console.log("\nAlle Auth-Guard-Verifikationen erfolgreich.");
