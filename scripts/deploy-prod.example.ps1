<#
  Funkly - produktives Deployment (Vorlage)

  Vorgehen:
    1. Diese Datei nach scripts/deploy-prod.ps1 kopieren (liegt in .gitignore,
       damit echte Secrets nie versehentlich committet werden).
    2. Unten die Platzhalter durch echte Werte ersetzen.
    3. Skript aus einem PowerShell-Terminal im Repo-Root ausfuehren:
         .\scripts\deploy-prod.ps1
         .\scripts\deploy-prod.ps1 -AwsProfile mein-profil   # optional: anderes AWS-CLI-Profil/-Rolle
#>

param(
    # Optional: Name eines AWS-CLI-Profils (~/.aws/config), z.B. ein SSO-Profil
    # mit eigener Rolle. Leer = Default-Credentials der Shell (AWS_PROFILE/
    # Standard-Profil) werden verwendet.
    [string]$AwsProfile = ""
)

# --- Region -----------------------------------------------------------
$Region = "eu-west-1"

# --- Zugangsschutz V1 (siehe README.md#zugangsschutz-secrets-erzeugen-v1) --
# accessCode: kurzer, tippbarer Code fuers Zugangs-Gate der Nutzer:innen.
# originSecret: langes Zufalls-Secret, nur maschinell (CloudFront <-> Lambda).
$AccessCode   = "CHANGE_ME_ACCESS_CODE"
$OriginSecret = "CHANGE_ME_ORIGIN_SECRET"

# --- Budget-Alarm -------------------------------------------------------
# BudgetCurrency muss exakt der Zahlungswaehrung des AWS-Accounts entsprechen
# (Billing-Konsole -> Zahlungspraeferenzen), sonst CREATE_FAILED beim Deploy.
$BudgetNotificationEmail = "CHANGE_ME@example.com"
$BudgetLimitEur = 15
$BudgetCurrency = "USD"

# --- Claude-Modelle (nur setzen, falls im Ziel-Account/Region ein
#     regionales Inference-Profil noetig ist statt des Foundation-Models,
#     siehe README.md#konfiguration). Leer lassen = Stack-Defaults nutzen. --
$ModelId     = ""   # z.B. "eu.anthropic.claude-haiku-4-5"
$EvalModelId = ""   # z.B. "eu.anthropic.claude-sonnet-5"

# =========================================================================
# Ab hier nichts mehr aendern
# =========================================================================

$ErrorActionPreference = "Stop"

$placeholders = @($AccessCode, $OriginSecret, $BudgetNotificationEmail) |
    Where-Object { $_ -like "CHANGE_ME*" }
if ($placeholders.Count -gt 0) {
    throw "Bitte zuerst alle CHANGE_ME-Platzhalter in diesem Skript durch echte Werte ersetzen."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$env:CDK_DEFAULT_REGION = $Region

$cdkGlobalArgs = @()
if ($AwsProfile) {
    $env:AWS_PROFILE = $AwsProfile
    $cdkGlobalArgs += @("--profile", $AwsProfile)
    Write-Host "== AWS-Profil: $AwsProfile ==" -ForegroundColor Cyan
}

Write-Host "== Frontend bauen ==" -ForegroundColor Cyan
Set-Location (Join-Path $repoRoot "frontend")
npm run build

Write-Host "== Infra-Abhaengigkeiten installieren ==" -ForegroundColor Cyan
Set-Location (Join-Path $repoRoot "infra")
npm install

Write-Host "== CDK-Bootstrap (idempotent, einmalig pro Account/Region) ==" -ForegroundColor Cyan
npx cdk bootstrap @cdkGlobalArgs

$cdkContextArgs = @(
    "-c", "accessCode=$AccessCode",
    "-c", "originSecret=$OriginSecret",
    "-c", "budgetNotificationEmail=$BudgetNotificationEmail",
    "-c", "budgetLimitEur=$BudgetLimitEur",
    "-c", "budgetCurrency=$BudgetCurrency"
)
if ($ModelId)     { $cdkContextArgs += @("-c", "modelId=$ModelId") }
if ($EvalModelId) { $cdkContextArgs += @("-c", "evalModelId=$EvalModelId") }

Write-Host "== CDK-Deploy ==" -ForegroundColor Cyan
npx cdk deploy @cdkGlobalArgs @cdkContextArgs

Set-Location $repoRoot
