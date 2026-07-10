#!/usr/bin/env node
/**
 * Kleiner Dev-Mock fuer das Funkly-Backend (Turn-API v2), erlaubt vom
 * Umsetzungsplan fuer lokale Frontend-Verifikation ohne echtes AWS-Backend.
 *
 * Start: node dev/mock-server.mjs [port]   (Default-Port 8787)
 * Vite proxied /api dorthin, wenn VITE_API_BASE nicht gesetzt ist
 * (siehe vite.config.ts).
 *
 * Liefert TurnResponseV2-foermige Antworten (backend/src/contracts.ts) fuer
 * ein paar Demo-Szenarien, inkl. Kanal-Mechanik (§1: falscher Kanal -> keine
 * Antwort) und Phasen-Metadaten fuer den Stepper (s. Luecken-Hinweis in
 * frontend/src/api.ts). Kein echtes Bewertungsmodell — die Verdicts sind
 * deterministisch nach Turn-Index generiert, nur zum Durchklicken der UI.
 */
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? process.env.MOCK_PORT ?? 8787);

/** @typedef {{id:string, expect:string, label:{en:string,de:string}, expectedChannel?:number|"working", hints?:{en:string,de:string}}} MockPhase */

const SCENARIOS = [
  {
    id: "radio-check",
    useCase: "UC-01",
    title: { en: "Radio Check", de: "Radio Check" },
    briefing: {
      en: "Call Lyngby Radio on channel 16 and request a radio check.",
      de: "Rufen Sie Lyngby Radio auf Kanal 16 und bitten Sie um einen Radio Check.",
    },
    rubric: ["calling-structure", "prowords", "phonetic-alphabet", "brevity-channel-discipline"],
    phases: /** @type {MockPhase[]} */ ([
      {
        id: "call",
        expect: "call",
        label: { en: "Call & request", de: "Anruf & Anliegen" },
        expectedChannel: 16,
        hints: { en: "Call Lyngby Radio on channel 16 and ask for a radio check.", de: "Rufe Lyngby Radio auf Kanal 16 und bitte um einen Radio Check." },
      },
      {
        id: "closing",
        expect: "closing",
        label: { en: "Acknowledge & close", de: "Bestätigen & beenden" },
        expectedChannel: 16,
        hints: { en: "Acknowledge the readability report and close with OUT.", de: "Bestätige den Report und beende mit OUT." },
      },
    ]),
  },
  {
    id: "wrong-channel-drill",
    useCase: "UC-06",
    title: { en: "Channel discipline drill", de: "Kanaldisziplin-Übung" },
    briefing: {
      en: "The coast station only listens on working channel 26. Switch before calling.",
      de: "Die Küstenfunkstelle hört nur auf Arbeitskanal 26. Wechseln Sie den Kanal, bevor Sie rufen.",
    },
    rubric: ["channel-discipline"],
    phases: /** @type {MockPhase[]} */ ([
      {
        id: "call-26",
        expect: "call",
        label: { en: "Call on working channel", de: "Anruf auf Arbeitskanal" },
        expectedChannel: 26,
        hints: { en: "The station is waiting on channel 26.", de: "Die Gegenstelle wartet auf Kanal 26." },
      },
    ]),
  },
  {
    id: "dsc-alert-demo",
    useCase: "UC-14",
    title: { en: "DSC alert received", de: "DSC-Alert empfangen" },
    briefing: {
      en: "An all-ships distress alert arrives on your DSC controller. Do not acknowledge by DSC — listen on channel 16.",
      de: "Ein All-Ships-Distress-Alert geht auf Ihrem DSC-Controller ein. Nicht per DSC quittieren — auf Kanal 16 mithören.",
    },
    rubric: ["relay-decision"],
    phases: /** @type {MockPhase[]} */ ([
      {
        id: "monitor-16",
        expect: "free",
        label: { en: "Monitor CH 16", de: "CH 16 mithören" },
        expectedChannel: 16,
        hints: { en: "Stay on channel 16 and consider a MAYDAY RELAY.", de: "Auf Kanal 16 bleiben, ggf. MAYDAY RELAY erwägen." },
      },
    ]),
  },
  {
    id: "mayday",
    useCase: "UC-07",
    title: { en: "Distress call & message (MAYDAY)", de: "Notmeldung absetzen (MAYDAY)" },
    briefing: {
      en: "Fire on board. Transmit a complete distress call and message on channel 16.",
      de: "Feuer an Bord. Setzen Sie Notanruf und Notmeldung auf Kanal 16 ab.",
    },
    rubric: ["distress-call", "distress-message", "position-format", "english-language"],
    phases: /** @type {MockPhase[]} */ ([
      { id: "distress-call", expect: "call", label: { en: "Distress call", de: "Notanruf" }, expectedChannel: 16 },
      { id: "distress-message", expect: "message", label: { en: "Distress message", de: "Notmeldung" }, expectedChannel: 16 },
    ]),
  },
];

function findScenario(id) {
  return SCENARIOS.find((s) => s.id === id);
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function handleTurn(body) {
  const scenario = findScenario(body.scenarioId);
  if (!scenario) {
    return { status: 400, body: { error: `unknown scenario: ${body.scenarioId}` } };
  }
  const phases = scenario.phases;
  const currentIndex = Math.max(
    0,
    body.phaseId ? phases.findIndex((p) => p.id === body.phaseId) : 0
  );
  const phase = phases[currentIndex] ?? phases[0];

  const channelStr = String(body.channel);
  // "working" = der je Session gezogene Arbeitskanal (siehe backend/src/scenarios.ts).
  const expectedChannel =
    phase.expectedChannel === "working" ? body.setup?.workingChannel : phase.expectedChannel;
  if (expectedChannel !== undefined && channelStr !== String(expectedChannel)) {
    return {
      status: 200,
      body: {
        reply: "",
        stationId: "mock-station",
        noReplyReason: "wrong-channel",
        evaluation: { overallScore: 0, rubric: [] },
        phase: {
          currentPhaseId: phase.id,
          currentIndex,
          completedPhaseIds: phases.slice(0, currentIndex).map((p) => p.id),
          totalPhases: phases.length,
        },
        done: false,
        audioBase64: "",
      },
    };
  }

  const nextIndex = Math.min(currentIndex + 1, phases.length - 1);
  const isLast = currentIndex >= phases.length - 1;
  const nextPhase = phases[nextIndex];

  const rubric = scenario.rubric.map((id, i) => ({
    id,
    verdict: i % 4 === 3 ? "partial" : "pass",
    score: i % 4 === 3 ? 60 : 90,
    finding:
      body.language === "de"
        ? `(Mock) Kriterium "${id}" bewertet fuer Turn "${phase.id}".`
        : `(Mock) Criterion "${id}" evaluated for turn "${phase.id}".`,
  }));
  const overallScore = Math.round(rubric.reduce((sum, r) => sum + r.score, 0) / rubric.length);

  const reply =
    body.language === "de"
      ? `(Mock-Antwort) Verstanden, ${body.setup?.vessel ?? "Schiff"}. Phase "${phase.id}" quittiert.`
      : `(Mock reply) Received, ${body.setup?.vessel ?? "vessel"}. Phase "${phase.id}" acknowledged.`;

  return {
    status: 200,
    body: {
      reply,
      stationId: "mock-station",
      evaluation: { overallScore, rubric, expected: "(mock sample transmission)" },
      phase: {
        currentPhaseId: isLast ? phase.id : nextPhase.id,
        currentIndex: isLast ? currentIndex : nextIndex,
        completedPhaseIds: phases.slice(0, currentIndex + 1).map((p) => p.id),
        totalPhases: phases.length,
      },
      coaching:
        body.mode === "training" && !isLast
          ? nextPhase.hints?.[body.language] ?? undefined
          : undefined,
      done: isLast,
      audioBase64: "",
    },
  };
}

function randomSetup() {
  const vessels = ["ALBATROS", "BLUEBIRD", "CALYPSO", "NORDWIND"];
  const callsigns = ["DK2077", "DL4511", "DM3082"];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  return {
    vessel: pick(vessels),
    callsign: pick(callsigns),
    mmsi: "211" + String(Math.floor(100000 + Math.random() * 899999)),
    position: "54 degrees 32 minutes north, 011 degrees 05 minutes east",
    workingChannel: pick([24, 25, 26, 27, 28]),
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, "");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && path === "/api/scenarios") {
      return json(res, 200, {
        scenarios: SCENARIOS.map((s) => ({
          id: s.id,
          useCase: s.useCase,
          title: s.title,
          briefing: s.briefing,
          phases: s.phases.map((p) => ({ id: p.id, label: p.label, hints: p.hints })),
        })),
      });
    }

    if (req.method === "POST" && path === "/api/session") {
      return json(res, 200, { setup: randomSetup() });
    }

    if (req.method === "GET" && path === "/api/stt-credentials") {
      return json(res, 200, {
        region: "eu-west-1",
        credentials: {
          accessKeyId: "MOCK",
          secretAccessKey: "MOCK",
          sessionToken: "MOCK",
          expiration: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
      });
    }

    if (req.method === "POST" && path === "/api/turn") {
      const body = await readBody(req);
      const result = handleTurn(body);
      return json(res, result.status, result.body);
    }

    return json(res, 404, { error: `no route: ${req.method} ${path}` });
  } catch (err) {
    console.error("mock request failed", err);
    return json(res, 500, { error: String(err?.message ?? err) });
  }
});

server.listen(PORT, () => {
  console.log(`funkly dev mock listening on http://localhost:${PORT}`);
});
