#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { FunklyStack } from "../lib/funkly-stack";

const app = new cdk.App();

new FunklyStack(app, "FunklyStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: "Funkly - Funksprech-Trainer (Seefunk SRC): Hosting, API, Sprach-Pipeline",
});

// Pflicht-Tag fuer alle jetzigen und kuenftigen Ressourcen der App
cdk.Tags.of(app).add("app", "funkly");
