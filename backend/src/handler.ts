import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SCENARIOS, randomSetup } from "./scenarios";
import { handleTurn, TurnRequest } from "./turn";

const REGION = process.env.AWS_REGION ?? "eu-west-1";
const sts = new STSClient({ region: REGION });

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath.replace(/\/+$/, "");

  try {
    if (method === "GET" && path === "/api/scenarios") {
      return json(200, {
        scenarios: SCENARIOS.map((s) => ({ id: s.id, useCase: s.useCase, title: s.title, briefing: s.briefing })),
      });
    }

    if (method === "POST" && path === "/api/session") {
      // Stammdaten fuer eine neue Uebungssession (Schiff, Callsign, MMSI, Position)
      return json(200, { setup: randomSetup() });
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
      const body = JSON.parse(event.body ?? "{}") as TurnRequest;
      const result = await handleTurn(body);
      return json(200, result);
    }

    return json(404, { error: `no route: ${method} ${path}` });
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    console.error("request failed", { method, path, error: err?.message ?? String(err) });
    return json(status, { error: err?.message ?? "internal error" });
  }
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  };
}
