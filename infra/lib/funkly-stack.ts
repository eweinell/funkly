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
    // API-Lambda: /api/scenarios, /api/turn, /api/stt-credentials
    // ------------------------------------------------------------------
    const backendDir = path.join(__dirname, "..", "..", "backend");

    const apiFn = new NodejsFunction(this, "ApiFunction", {
      entry: path.join(backendDir, "src", "handler.ts"),
      depsLockFilePath: path.join(backendDir, "package-lock.json"),
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      bundling: {
        format: OutputFormat.CJS,
        externalModules: [], // alles bundeln (inkl. AWS SDK v3 + Anthropic SDK)
      },
      environment: {
        MODEL_ID: "anthropic.claude-haiku-4-5",
      },
    });

    // Bedrock: Claude-Modelle (Foundation Models + regionale Inference-Profile)
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/anthropic.*",
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        ],
      })
    );

    // Polly: Sprachausgabe
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
        allowHeaders: ["content-type"],
      },
    });

    const integration = new HttpLambdaIntegration("ApiIntegration", apiFn);
    httpApi.addRoutes({ path: "/api/{proxy+}", methods: [apigwv2.HttpMethod.ANY], integration });

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
          origin: new origins.HttpOrigin(apiDomain),
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
    new cdk.CfnOutput(this, "ApiEndpoint", { value: httpApi.apiEndpoint });
  }
}
