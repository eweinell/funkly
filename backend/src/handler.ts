import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { TurnRequestV2 } from "./contracts";
import { getScenario, listScenarios, randomSetup } from "./scenarios";
import { handleTurn } from "./turn";
import { evaluateTranscript, EvaluateRequest } from "./evaluation";

const REGION = process.env.AWS_REGION ?? "eu-west-1";
const sts = new STSClient({ region: REGION });

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/+$/, "");

  if (method === "OPTIONS") {
    // CORS-Preflight beantwortet i. d. R. schon das HTTP API selbst; erreicht
    // trotzdem eine OPTIONS-Anfrage die Lambda, vor jeder Auth-Pruefung durchlassen.
    return { statusCode: 204, headers: { "access-control-allow-origin": "*" }, body: "" };
  }

  const denied = authorize(event);
  if (denied) return denied;

  try {
    if (method === "GET" && path === "/api/scenarios") {
      return json(200, {
        scenarios: listScenarios().map((s) => ({
          id: s.id,
          useCase: s.useCase,
          title: s.title,
          briefing: s.briefing,
          difficulty: s.difficulty,
          tags: s.tags ?? [],
          // Vollstaendige, geordnete Phasenliste VOR dem ersten Turn (Stepper,
          // UI-SPEZIFIKATION §3) - schliesst die von funkly-frontend in api.ts
          // dokumentierte Vertragsluecke (ScenarioInfo.phases).
          phases: s.phases.map((p) => ({ id: p.id, label: p.label })),
        })),
      });
    }

    if (method === "POST" && path === "/api/session") {
      // Stammdaten fuer eine neue Uebungssession, aus den setup-Pools DES
      // gewaehlten Szenarios gezogen. scenarioId ist optional (Abwaertskompatibilitaet
      // zu aelteren Aufrufen ohne Body); ohne gueltige scenarioId wird das erste
      // geladene Szenario als Fallback-Pool verwendet (siehe Abschlussbericht).
      const body = safeJson(event.body);
      const requestedId = typeof body.scenarioId === "string" ? body.scenarioId : undefined;
      const language = body.language === "de" ? "de" : "en";
      const scenario = (requestedId && getScenario(requestedId)) ?? listScenarios()[0];
      if (!scenario) return json(500, { error: "no scenarios loaded" });
      // Der Fallback liefert die Pools des ERSTEN Szenarios - Arbeitskanal und
      // Position passen dann nicht zur Uebung. Stillschweigend war das lange
      // unsichtbar, daher hier laut.
      if (scenario.id !== requestedId) {
        console.warn("session setup drawn from fallback scenario", {
          requestedId: requestedId ?? "(none)",
          usedScenarioId: scenario.id,
        });
      }
      return json(200, { setup: randomSetup(scenario, language) });
    }

    if (method === "GET" && path === "/api/stt-credentials") {
      const roleArn = process.env.STT_ROLE_ARN;
      if (!roleArn) return json(500, { error: "STT_ROLE_ARN not configured" });
      const res = await sts.send(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: "funkly-stt",
          DurationSeconds: 900,
        })
      );
      const c = res.Credentials!;
      return json(200, {
        region: REGION,
        credentials: {
          accessKeyId: c.AccessKeyId,
          secretAccessKey: c.SecretAccessKey,
          sessionToken: c.SessionToken,
          expiration: c.Expiration?.toISOString(),
        },
      });
    }

    if (method === "POST" && path === "/api/turn") {
      const body = JSON.parse(event.body ?? "{}") as TurnRequestV2;
      const result = await handleTurn(body);
      return json(200, result);
    }

    if (method === "POST" && path === "/api/evaluate") {
      // Geruest fuer Abschluss-/Pruefungsauswertung (EVAL_MODEL_ID, Sonnet),
      // nicht Teil des Dialog-Turns. Wird von Welle 2 (UC-09/17) ausgebaut.
      const body = JSON.parse(event.body ?? "{}") as EvaluateRequest;
      const result = await evaluateTranscript(body);
      return json(200, result);
    }

    return json(404, { error: `no route: ${method} ${path}` });
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    console.error("request failed", { method, path, error: err?.message ?? String(err) });
    return json(status, { error: err?.message ?? "internal error" });
  }
}

/**
 * Zugangsschutz V1 (Querschnitt, siehe Abschlussbericht/Briefing): zieht eine
 * kleine, kostenfreie Huerde vor alle Routen, damit Bedrock/Polly/STS nicht von
 * jedem Anrufer der blossen URL ausgeloest werden koennen. Cognito-Login bleibt
 * UC-27/V2 (infra/lib/auth-prep.ts) - hier NICHT umgesetzt.
 *
 * Reihenfolge (bindend, mit funkly-infra/funkly-frontend abgestimmt):
 *   1. ORIGIN_SECRET gesetzt und x-funkly-origin fehlt/falsch -> 403.
 *   2. ACCESS_CODE gesetzt und x-funkly-access fehlt/falsch -> 401.
 *   3. Fehlt eine der beiden Env-Variablen, entfaellt die jeweilige Pruefung
 *      (Dev/Mock) - dann einmaliges console.warn (ohne Werte zu loggen).
 * Gibt bei Ablehnung eine fertige Response zurueck, sonst undefined (Route laeuft).
 */
function authorize(event: APIGatewayProxyEventV2): APIGatewayProxyResultV2 | undefined {
  const originSecret = process.env.ORIGIN_SECRET;
  const accessCode = process.env.ACCESS_CODE;

  if (!originSecret) {
    console.warn("auth check skipped", { reason: "ORIGIN_SECRET not configured" });
  } else if (getHeader(event, "x-funkly-origin") !== originSecret) {
    console.warn("auth rejected", { reason: "origin mismatch" });
    return json(403, { error: "forbidden" });
  }

  if (!accessCode) {
    console.warn("auth check skipped", { reason: "ACCESS_CODE not configured" });
  } else if (getHeader(event, "x-funkly-access") !== accessCode) {
    console.warn("auth rejected", { reason: "access code mismatch" });
    return json(401, { error: "unauthorized" });
  }

  return undefined;
}

/** Case-insensitiver Header-Zugriff (API Gateway v2 liefert Keys i. d. R.
 *  bereits kleingeschrieben, aber verlass dich nicht darauf). */
function getHeader(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const headers = event.headers ?? {};
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

function safeJson(body: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(body ?? "{}");
  } catch {
    return {};
  }
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  };
}
