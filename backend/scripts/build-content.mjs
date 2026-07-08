// Buendelt alle Szenario-YAMLs unter content/scenarios/ zu einer einzigen JSON-
// Datei (backend/src/generated/scenarios.generated.json), die backend/src/scenarios.ts
// per statischem Import laedt. esbuild (CDK NodejsFunction) inlined JSON-Importe
// beim Lambda-Bundling automatisch — die Datei muss also nur zum Zeitpunkt von
// `tsc`/`cdk synth`/`cdk deploy` auf der Platte liegen, nicht separat kopiert werden.
//
// Dies ist KEINE vollstaendige Schema-Validierung (das leistet content/tooling/validate.mjs
// mit ajv gegen content/schema/scenario.schema.json) — nur ein guenstiger,
// abhaengigkeitsarmer Sanity-Check, der offensichtlich kaputten Content vor dem
// Buendeln abfaengt statt ihn stillschweigend durchzureichen.
//
// Aufruf: node scripts/build-content.mjs   (aus backend/, per `npm run build:content`)
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import yaml from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, "..");
const contentRoot = resolve(backendRoot, "..", "content");
const scenariosDir = join(contentRoot, "scenarios");
const outDir = join(backendRoot, "src", "generated");
const outFile = join(outDir, "scenarios.generated.json");

const REQUIRED_FIELDS = [
  "schemaVersion",
  "id",
  "useCase",
  "module",
  "difficulty",
  "title",
  "briefing",
  "stations",
  "phases",
  "rubric",
];

let files;
try {
  files = readdirSync(scenariosDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
} catch (err) {
  console.error(`Kann Szenario-Verzeichnis nicht lesen: ${scenariosDir}\n${err.message}`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`Keine Szenario-Dateien unter ${scenariosDir} gefunden.`);
  process.exit(1);
}

const scenarios = [];
const seenIds = new Set();
let failed = 0;

for (const file of files) {
  const full = join(scenariosDir, file);
  let data;
  try {
    data = yaml.load(readFileSync(full, "utf8"));
  } catch (err) {
    console.error(`FEHLER beim Parsen von ${file}: ${err.message}`);
    failed++;
    continue;
  }

  const missing = REQUIRED_FIELDS.filter((f) => data?.[f] === undefined);
  if (missing.length) {
    console.error(`FEHLER in ${file}: Pflichtfelder fehlen: ${missing.join(", ")}`);
    failed++;
    continue;
  }
  if (data.schemaVersion !== 2) {
    console.error(`FEHLER in ${file}: schemaVersion muss 2 sein (ist ${data.schemaVersion}).`);
    failed++;
    continue;
  }
  const expectedId = file.replace(/\.ya?ml$/, "");
  if (data.id !== expectedId) {
    console.error(`FEHLER in ${file}: id '${data.id}' entspricht nicht dem Dateinamen ('${expectedId}' erwartet).`);
    failed++;
    continue;
  }
  if (seenIds.has(data.id)) {
    console.error(`FEHLER: doppelte Szenario-ID '${data.id}' (${file}).`);
    failed++;
    continue;
  }
  if (!Array.isArray(data.stations) || data.stations.length === 0) {
    console.error(`FEHLER in ${file}: stations muss mindestens einen Eintrag haben.`);
    failed++;
    continue;
  }
  if (!Array.isArray(data.phases) || data.phases.length === 0) {
    console.error(`FEHLER in ${file}: phases muss mindestens einen Eintrag haben.`);
    failed++;
    continue;
  }
  if (!Array.isArray(data.rubric) || data.rubric.length === 0) {
    console.error(`FEHLER in ${file}: rubric muss mindestens einen Eintrag haben.`);
    failed++;
    continue;
  }

  seenIds.add(data.id);
  scenarios.push(data);
}

if (failed > 0) {
  console.error(
    `\n${failed} Datei(en) mit Fehlern - Bundle wird NICHT geschrieben.\n` +
      `Vollstaendige Validierung gegen das JSON-Schema: content/tooling (npm install && npm run validate).`
  );
  process.exit(1);
}

scenarios.sort((a, b) => a.id.localeCompare(b.id));

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify({ schemaVersion: 2, scenarios }, null, 2) + "\n", "utf8");
console.log(`OK: ${scenarios.length} Szenario(s) aus ${scenariosDir} nach ${outFile} gebuendelt.`);
for (const s of scenarios) console.log(`  - ${s.id} (${s.useCase})`);
