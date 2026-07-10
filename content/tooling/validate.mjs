// Validiert alle Szenario-YAMLs unter content/scenarios/ gegen content/schema/scenario.schema.json.
// Aufruf (aus content/tooling/):  npm install && npm run validate
// Aufruf mit einzelner Datei:     node validate.mjs ../scenarios/radio-check.yaml
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import yaml from "js-yaml";
import Ajv from "ajv";

const here = dirname(fileURLToPath(import.meta.url));
const contentRoot = resolve(here, "..");
const schemaPath = join(contentRoot, "schema", "scenario.schema.json");
const scenariosDir = join(contentRoot, "scenarios");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const args = process.argv.slice(2);
const files =
  args.length > 0
    ? args.map((a) => resolve(process.cwd(), a))
    : readdirSync(scenariosDir)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
        .map((f) => join(scenariosDir, f));

let failed = 0;
for (const file of files) {
  const data = yaml.load(readFileSync(file, "utf8"));
  const ok = validate(data);
  if (ok) {
    console.log(`PASS  ${file}`);
    // Zusatzchecks, die JSON-Schema allein nicht abdeckt:
    const semanticErrors = semanticChecks(data);
    if (semanticErrors.length) {
      failed++;
      console.log(`WARN  ${file} — semantische Hinweise:`);
      for (const e of semanticErrors) console.log(`        - ${e}`);
    }
  } else {
    failed++;
    console.log(`FAIL  ${file}`);
    for (const err of validate.errors ?? []) {
      console.log(`        ${err.instancePath || "/"} ${err.message}`);
    }
  }
}

// Referentielle Integritaet, die im JSON-Schema nicht ausdrueckbar ist.
function semanticChecks(s) {
  const errors = [];
  const stationIds = new Set((s.stations ?? []).map((st) => st.id));
  const phaseIds = new Set((s.phases ?? []).map((p) => p.id));
  const hasWorkingChannelPool = (s.setup?.workingChannelPool ?? []).length > 0;
  for (const p of s.phases ?? []) {
    if (p.station && !stationIds.has(p.station)) {
      errors.push(`phase '${p.id}' verweist auf unbekannte station '${p.station}'`);
    }
    if (p.expectedChannel === "working" && !hasWorkingChannelPool) {
      errors.push(`phase '${p.id}' erwartet den Arbeitskanal, aber setup.workingChannelPool fehlt`);
    }
  }
  for (const r of s.rubric ?? []) {
    for (const pid of r.appliesTo ?? []) {
      if (!phaseIds.has(pid)) errors.push(`rubric '${r.id}' appliesTo unbekannte phase '${pid}'`);
    }
  }
  const rubricIds = (s.rubric ?? []).map((r) => r.id);
  if (new Set(rubricIds).size !== rubricIds.length) errors.push("doppelte Rubric-IDs");
  return errors;
}

if (failed > 0) {
  console.error(`\n${failed} Datei(en) mit Fehlern/Hinweisen.`);
  process.exit(1);
}
console.log(`\nAlle ${files.length} Szenario-Datei(en) gueltig.`);
