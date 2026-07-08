import { Construct } from "constructs";

/**
 * UC-27 Mehrbenutzer-Vorbereitung (Cognito) — Construct-Geruest, NICHT
 * instanziiert und NICHT von `funkly-stack.ts` importiert.
 *
 * V1.0 laeuft mit einfachem Zugangsschutz (kein Login); der Fortschritt
 * (UC-23, `ProgressTable` in `funkly-stack.ts`) wird ueber eine clientseitig
 * erzeugte Geraete-UUID gefuehrt (Entscheidung aus dem funkly-backend-Briefing,
 * Welle 2 — kein Login in V1). Dieses Construct haelt den vorgesehenen Umbau
 * auf echte Benutzerkonten fest, ohne dass irgendetwas davon bereits
 * produktiv genutzt wird:
 *
 *  - Cognito User Pool: Email- oder Benutzername-Login, Passwort-Policy,
 *    optional spaeter Social-IdP (Google/Apple) fuer Vereinsschulungen.
 *  - User Pool Client fuer das Frontend: kein Client-Secret (Public Client,
 *    SPA), Authorization-Code-Flow mit PKCE.
 *  - HTTP-API-Authorizer: `HttpUserPoolAuthorizer` vor den bestehenden Routen
 *    in `funkly-stack.ts` statt (oder zusaetzlich zu) dem heutigen einfachen
 *    Zugangsschutz.
 *  - Migration DynamoDB: `ProgressTable.userId` muesste von "Geraete-UUID" auf
 *    "Cognito sub" umgestellt werden; ein Mapping-/Merge-Schritt fuer
 *    bestehende Geraete-UUIDs (Bestandsnutzer ohne Konto) ist vorzusehen,
 *    bevor der Authorizer scharf geschaltet wird.
 *  - Optional Identity Pool: falls das Frontend AWS-Ressourcen (z. B.
 *    Transcribe-Streaming) spaeter mit foederierten Identitaeten statt der
 *    heutigen, vom Backend ausgestellten `sttRole`-Temp-Credentials
 *    (siehe `funkly-stack.ts`) direkt ansprechen soll.
 *
 * Aktivierung: Erst nach expliziter Produktentscheidung — UC-27 ist laut
 * UMSETZUNGSPLAN.md nicht Teil von Welle 1/2. Bis dahin bleibt diese Datei
 * unbenutztes Geruest: keine Ressourcen, kein `cognito`-Import, kein Aufruf
 * aus `funkly-stack.ts` (dort nur ein Kommentar/Feature-Flag-Hinweis auf
 * diese Datei).
 */
export class CognitoAuthPrep extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Bewusst NICHT instanziiert - Skizze fuer die spaetere Umsetzung:
    //
    // import * as cognito from "aws-cdk-lib/aws-cognito";
    // import * as cdk from "aws-cdk-lib";
    //
    // const userPool = new cognito.UserPool(this, "UserPool", {
    //   selfSignUpEnabled: true,
    //   signInAliases: { email: true },
    //   standardAttributes: { email: { required: true, mutable: false } },
    //   passwordPolicy: { minLength: 12, requireDigits: true, requireSymbols: true },
    //   accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    //   // Echte Nutzerkonten - nicht versehentlich beim Stack-Update verlieren.
    //   removalPolicy: cdk.RemovalPolicy.RETAIN,
    // });
    //
    // const userPoolClient = userPool.addClient("WebClient", {
    //   generateSecret: false,
    //   authFlows: { userSrp: true },
    //   oAuth: {
    //     flows: { authorizationCodeGrant: true },
    //     callbackUrls: ["https://<SiteUrl-Domain>/auth/callback"],
    //   },
    // });
    //
    // Spaeter in funkly-stack.ts statt/zusaetzlich zum einfachen Zugangsschutz:
    // import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
    // const authorizer = new HttpUserPoolAuthorizer("CognitoAuthorizer", userPool, {
    //   userPoolClients: [userPoolClient],
    // });
    // httpApi.addRoutes({ path: "/api/{proxy+}", methods: [...], integration, authorizer });
  }
}
