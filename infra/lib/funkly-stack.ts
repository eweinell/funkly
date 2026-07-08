import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as path from "path";
import * as fs from "fs";

export class FunklyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------
    // Frontend-Hosting: S3 (privat) + CloudFront
    // ------------------------------------------------------------------
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ------------------------------------------------------------------
    // DynamoDB: Fortschrittstabelle (UC-23)
    // ------------------------------------------------------------------
    // Schluesseldesign: PK "userId" ist die Geraete-UUID, die das Frontend beim
    // ersten Start erzeugt und in localStorage haelt (V1 hat kein Login -
    // Entscheidung aus dem funkly-backend-Briefing, Welle 2). SK "itemKey"
    // kombiniert die geuebte Einheit mit dem Zeitpunkt, z. B.
    // "SCENARIO#radio-check#2026-07-06T12:00:00.000Z" oder "QUIZ#q-042#...#":
    //   - Query(userId, begins_with(itemKey, "SCENARIO#radio-check#")) liefert
    //     die Zeitreihe fuer genau diese Uebung (Scores ueber Zeit, UC-23).
    //   - Query(userId) allein liefert die gesamte Historie fuer die
    //     Schwachstellen-Auswertung; bei einem Einzelnutzer-Trainer bleibt das
    //     Datenvolumen klein genug, um ohne zusaetzliche GSI serverseitig zu
    //     gruppieren. Braucht es spaeter einen rein zeitlich sortierten Feed
    //     ueber alle Uebungen hinweg, laesst sich eine GSI (PK userId, SK
    //     timestamp) ergaenzen - bewusst nicht spekulativ vorab angelegt.
    // Das genaue Trennzeichen-/Praefixschema entscheidet funkly-backend
    // (Welle 2) verbindlich; dieser Kommentar haelt nur den Entwurf fest, an
    // den sich Backend und Infra halten.
    //
    // On-Demand-Billing: Nutzung ist sessionsgetrieben und unregelmaessig,
    // Kapazitaetsplanung lohnt sich fuer diese Groessenordnung nicht.
    // RemovalPolicy RETAIN (bewusst anders als der Site-Bucket): das sind
    // echte, nicht reproduzierbare Nutzerdaten - ein versehentliches
    // Stack-Update/-Loeschen darf die Trainingshistorie nicht mitreissen.
    // Wer die Tabelle wirklich loeschen will, tut das explizit von Hand.
    const progressTable = new dynamodb.Table(this, "ProgressTable", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "itemKey", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ------------------------------------------------------------------
    // S3: TTS-Cache (UC-25)
    // ------------------------------------------------------------------
    // Reiner Cache (Text+Stimme -> deterministisches Polly-Ergebnis): im
    // Gegensatz zur Fortschrittstabelle jederzeit verlustfrei neu befuellbar,
    // daher wie der Site-Bucket DESTROY + autoDeleteObjects. Lifecycle-Regel
    // raeumt selten gebrauchte Ansagen nach `ttsCacheExpirationDays` auf
    // (Default 90 Tage, per CDK-Context uebersteuerbar) und haelt Speicher-
    // kosten niedrig, ohne den eigentlichen Zweck (weniger Synthesize-Calls)
    // zu gefaehrden. Privat, nur fuer die Lambda lesbar/schreibbar (Grant unten).
    const ttsCacheExpirationDays = Number(this.node.tryGetContext("ttsCacheExpirationDays") ?? 90);

    const ttsCacheBucket = new s3.Bucket(this, "TtsCacheBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(ttsCacheExpirationDays),
        },
      ],
    });

    // ------------------------------------------------------------------
    // API-Lambda: /api/scenarios, /api/turn, /api/stt-credentials
    // ------------------------------------------------------------------
    const backendDir = path.join(__dirname, "..", "..", "backend");

    // Bewertungsmodell fuer Abschluss-/Pruefungsauswertung (Sonnet) - per
    // Context uebersteuerbar, falls im Ziel-Account nur ein regionales
    // Inference-Profil verfuegbar ist (analog MODEL_ID, siehe README).
    const evalModelId =
      (this.node.tryGetContext("evalModelId") as string | undefined) ?? "anthropic.claude-sonnet-5";

    // Zugangsschutz V1 (Querschnitt, siehe README.md): kein Login in V1, daher
    // zwei geteilte Geheimnisse statt Cognito (bleibt UC-27/V2, lib/auth-prep.ts).
    // Werte kommen ausschliesslich per CDK-Context, nie hart codiert. Fehlt ein
    // Wert, wird bewusst KEINE stille Fehlkonfiguration erzeugt (Env bliebe
    // einfach unbesetzt, Backend-Pruefung entfaellt dann laut Vertrag) - statt-
    // dessen eine `cdk synth`-Warnung, damit ein fehlender Schutz in Prod nicht
    // unbemerkt bleibt.
    const accessCode = this.node.tryGetContext("accessCode") as string | undefined;
    const originSecret = this.node.tryGetContext("originSecret") as string | undefined;
    if (!accessCode) {
      cdk.Annotations.of(this).addWarning(
        "Kein Zugangscode gesetzt - CDK-Context 'accessCode' fehlt (siehe README.md). ACCESS_CODE bleibt unbesetzt, die Backend-Pruefung entfaellt (nur fuer Dev akzeptabel)."
      );
    }
    if (!originSecret) {
      cdk.Annotations.of(this).addWarning(
        "Kein Origin-Secret gesetzt - CDK-Context 'originSecret' fehlt (siehe README.md). ORIGIN_SECRET bleibt unbesetzt und CloudFront gibt keinen Origin-Header mit - die Backend-Pruefung entfaellt (nur fuer Dev akzeptabel)."
      );
    }

    const apiFn = new NodejsFunction(this, "ApiFunction", {
      entry: path.join(backendDir, "src", "handler.ts"),
      depsLockFilePath: path.join(backendDir, "package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      // NodejsFunction buendelt `handler.ts` lokal mit esbuild und loest esbuild
      // aus dem `backend`-Verzeichnis auf (`npx --no-install esbuild ...`). Deshalb
      // ist `esbuild` eine noetige devDependency in backend/package.json - sieht
      // ungenutzt aus (kein Import im Backend-Code), ohne sie schlaegt `cdk synth`
      // aber am Bundling fehl. NICHT entfernen.
      bundling: {
        format: OutputFormat.CJS,
        externalModules: [], // alles bundeln (inkl. AWS SDK v3 + Anthropic SDK)
      },
      environment: {
        MODEL_ID: "anthropic.claude-haiku-4-5",
        EVAL_MODEL_ID: evalModelId,
        PROGRESS_TABLE_NAME: progressTable.tableName,
        TTS_CACHE_BUCKET_NAME: ttsCacheBucket.bucketName,
        ...(accessCode ? { ACCESS_CODE: accessCode } : {}),
        ...(originSecret ? { ORIGIN_SECRET: originSecret } : {}),
      },
    });

    // Tabelle/Bucket: RW ausschliesslich auf diese eine Ressource (grant*
    // erzeugt eine Policy mit der konkreten Tabellen-/Bucket-ARN, kein "*").
    progressTable.grantReadWriteData(apiFn);
    ttsCacheBucket.grantReadWrite(apiFn);

    // Bedrock: Claude-Modelle (Foundation Models + regionale Inference-Profile).
    // Deckt sowohl MODEL_ID (Haiku, Dialog-Turns) als auch EVAL_MODEL_ID
    // (Sonnet, Bewertungs-/Pruefungsauswertung) ab: beide sind entweder ein
    // "anthropic.*"-Foundation-Model oder ueber ein Inference-Profil im Account
    // erreichbar. Ein regionales "eu."-Praefix (z. B.
    // "eu.anthropic.claude-sonnet-5") steckt nur in der Profil-ID, nicht im
    // ARN-Pfad - der bestehende Wildcard `inference-profile/*` deckt das ohne
    // Aenderung ab, eine zusaetzliche Policy-Anweisung fuer das Eval-Modell
    // waere redundant.
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/anthropic.*",
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        ],
      })
    );

    // Polly: Sprachausgabe.
    // Bewusste Ausnahme zur "keine *-Ressourcen"-Leitplanke: polly:SynthesizeSpeech
    // kennt keine ressourcenscharfen ARNs (keine benannte Polly-Ressource), die
    // Action laesst sich nur auf "*" beschraenken. Kein Risiko-Zuwachs, da es keine
    // adressierbare Ziel-Ressource gibt.
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["polly:SynthesizeSpeech"],
        resources: ["*"],
      })
    );

    // Eng begrenzte Rolle, die das Frontend (via STS-Temp-Credentials)
    // fuer Transcribe-Streaming direkt aus dem Browser nutzt
    const sttRole = new iam.Role(this, "SttStreamingRole", {
      assumedBy: new iam.ArnPrincipal(apiFn.role!.roleArn),
      description: "Temp-Credentials fuer Amazon Transcribe Streaming aus dem Browser (Funkly)",
      maxSessionDuration: cdk.Duration.hours(1),
    });
    // Bewusste Ausnahme zur "keine *-Ressourcen"-Leitplanke: die Transcribe-
    // Streaming-Actions unterstuetzen keine ressourcenscharfen ARNs, nur "*".
    // Der Schaden ist durch die eng befristeten STS-Temp-Credentials (15 Min,
    // s. handler.ts) und die auf genau diese zwei Actions begrenzte Rolle gedeckelt.
    sttRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "transcribe:StartStreamTranscription",
          "transcribe:StartStreamTranscriptionWebSocket",
        ],
        resources: ["*"],
      })
    );
    sttRole.grantAssumeRole(apiFn.role!);
    apiFn.addEnvironment("STT_ROLE_ARN", sttRole.roleArn);

    // ------------------------------------------------------------------
    // HTTP API
    // ------------------------------------------------------------------
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "funkly-api",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        // x-funkly-access: Zugangscode-Header (Zugangsschutz V1) - sonst blockt
        // der Preflight des rohen (nicht ueber CloudFront laufenden) Endpoints
        // den Header, bevor der Handler ihn ueberhaupt sehen kann.
        allowHeaders: ["content-type", "x-funkly-access"],
      },
    });

    const integration = new HttpLambdaIntegration("ApiIntegration", apiFn);
    httpApi.addRoutes({ path: "/api/{proxy+}", methods: [apigwv2.HttpMethod.ANY], integration });

    // Throttling als Schadensdeckel (Zugangsschutz V1): begrenzt Kosten/Missbrauch
    // unabhaengig vom Zugangscode-Check, z. B. bei geleaktem Code oder einfachem
    // Wiederholungs-Traffic. Ueber das L1 gesetzt, weil HttpStage (L2) noch keine
    // Throttling-Properties exponiert.
    const apiRateLimit = Number(this.node.tryGetContext("apiRateLimit") ?? 5);
    const apiBurstLimit = Number(this.node.tryGetContext("apiBurstLimit") ?? 10);
    (httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage).defaultRouteSettings = {
      throttlingRateLimit: apiRateLimit,
      throttlingBurstLimit: apiBurstLimit,
    };

    // ------------------------------------------------------------------
    // CloudFront: / -> S3, /api/* -> HTTP API (same-origin, kein CORS im Betrieb)
    // ------------------------------------------------------------------
    const apiDomain = cdk.Fn.select(2, cdk.Fn.split("/", httpApi.apiEndpoint));

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Funkly PWA + API",
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        "/api/*": {
          // x-funkly-origin: Geheimwert, den nur CloudFront der Origin-Anfrage
          // mitgibt (Zugangsschutz V1) - macht den direkten Weg am rohen
          // ApiEndpoint vorbei fuer die Backend-Pruefung erkennbar/blockierbar.
          // Ohne originSecret bleibt der Header schlicht weg (Dev-Fall).
          origin: new origins.HttpOrigin(apiDomain, {
            customHeaders: originSecret ? { "x-funkly-origin": originSecret } : {},
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      errorResponses: [
        // SPA-Fallback
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
    });

    // Frontend-Build deployen, sofern vorhanden (frontend/dist)
    const distDir = path.join(__dirname, "..", "..", "frontend", "dist");
    if (fs.existsSync(distDir)) {
      new s3deploy.BucketDeployment(this, "SiteDeployment", {
        sources: [s3deploy.Source.asset(distDir)],
        destinationBucket: siteBucket,
        distribution,
        distributionPaths: ["/*"],
      });
    } else {
      cdk.Annotations.of(this).addWarning(
        "frontend/dist fehlt - erst `npm run build` im frontend ausfuehren, dann erneut deployen."
      );
    }

    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    // Bleibt als Output bestehen (bestehendes Verfahren nicht brechen), ist bei
    // gesetztem originSecret aber ohne den von CloudFront mitgegebenen
    // x-funkly-origin-Header faktisch tot: Aufrufe direkt gegen diesen
    // Endpoint scheitern am Backend-Check mit 403. Nur ueber SiteUrl (/api/*)
    // funktioniert der Zugriff produktiv.
    new cdk.CfnOutput(this, "ApiEndpoint", { value: httpApi.apiEndpoint });

    // ------------------------------------------------------------------
    // AWS Budget: monatlicher Kostenalarm
    // ------------------------------------------------------------------
    // Die Empfaenger-Adresse wird nie hart codiert, sondern kommt ausschliess-
    // lich per CDK-Context (`-c budgetNotificationEmail=...` oder per
    // cdk.context.json). Fehlt sie, entsteht bewusst KEIN Budget (Warnung statt
    // stiller Fehlkonfiguration mit falscher/fremder Adresse).
    const budgetLimitEur = Number(this.node.tryGetContext("budgetLimitEur") ?? 10);
    const budgetNotificationEmail = this.node.tryGetContext("budgetNotificationEmail") as string | undefined;

    if (budgetNotificationEmail) {
      new budgets.CfnBudget(this, "MonthlyCostBudget", {
        budget: {
          budgetName: "funkly-monthly-cost",
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: budgetLimitEur, unit: "EUR" },
          // Nur Kosten der mit app=funkly getaggten Ressourcen. Dafuer muss der
          // Tag-Schluessel "app" einmalig in der Billing-Konsole als
          // Cost-Allocation-Tag aktiviert werden - das kann CloudFormation/CDK
          // nicht automatisieren (Hinweis fuer den Menschen im Bericht).
          costFilters: {
            TagKeyValue: ["user:app$funkly"],
          },
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 80,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: budgetNotificationEmail }],
          },
          {
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 100,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: budgetNotificationEmail }],
          },
          {
            notification: {
              notificationType: "FORECASTED",
              comparisonOperator: "GREATER_THAN",
              threshold: 100,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: budgetNotificationEmail }],
          },
        ],
      });
    } else {
      cdk.Annotations.of(this).addWarning(
        "Kein Budget-Alarm angelegt - CDK-Context 'budgetNotificationEmail' fehlt (siehe README.md)."
      );
    }

    // ------------------------------------------------------------------
    // UC-27 Mehrbenutzer-Vorbereitung (Cognito) - noch NICHT provisioniert
    // ------------------------------------------------------------------
    // V1 bleibt beim einfachen Zugangsschutz (siehe README.md). Das Konstruk-
    // tionsgeruest fuer die spaetere Umstellung liegt in lib/auth-prep.ts,
    // wird hier aber bewusst nicht importiert/instanziiert. Der Flag existiert
    // nur, damit ein spaeterer Rollout ueber eine bewusste Context-Aenderung
    // laeuft statt "leise" beim naechsten Deploy zu passieren.
    if (this.node.tryGetContext("enableCognitoPrep") === true) {
      cdk.Annotations.of(this).addInfo(
        "enableCognitoPrep ist gesetzt, aber UC-27 ist noch nicht implementiert (siehe lib/auth-prep.ts)."
      );
    }
  }
}
