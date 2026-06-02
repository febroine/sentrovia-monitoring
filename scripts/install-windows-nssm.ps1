param(
  [switch]$RecreateServices
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDir = Join-Path $ProjectRoot "logs"
$ServiceNames = @("sentrovia-web", "sentrovia-worker")

function Write-Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command($Name) {
  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $Command) {
    throw "$Name was not found in PATH."
  }

  return $Command.Source
}

function Stop-ServiceIfExists($Name) {
  $Status = & nssm status $Name 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Stopping $Name..."
    & nssm stop $Name | Out-Host
  }
}

function Remove-ServiceIfExists($Name) {
  $Status = & nssm status $Name 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Removing $Name..."
    & nssm remove $Name confirm | Out-Host
  }
}

function Configure-Service($Name, $DisplayName, $Description, $Parameters, $NodePath) {
  & nssm install $Name $NodePath | Out-Host
  & nssm set $Name AppDirectory $ProjectRoot | Out-Host
  & nssm set $Name AppParameters $Parameters | Out-Host
  & nssm set $Name AppEnvironmentExtra NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=0 | Out-Host
  & nssm set $Name DisplayName $DisplayName | Out-Host
  & nssm set $Name Description $Description | Out-Host
  & nssm set $Name Start SERVICE_AUTO_START | Out-Host
  & nssm set $Name AppStdout (Join-Path $LogDir "$Name.log") | Out-Host
  & nssm set $Name AppStderr (Join-Path $LogDir "$Name-error.log") | Out-Host
  & nssm set $Name AppRotateFiles 1 | Out-Host
  & nssm set $Name AppRotateOnline 1 | Out-Host
  & nssm set $Name AppRotateBytes 10485760 | Out-Host
}

Set-Location $ProjectRoot
$env:PLAYWRIGHT_BROWSERS_PATH = "0"

Write-Host ""
Write-Host "Sentrovia Windows NSSM installer" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

Write-Step "Checking prerequisites"
$NodePath = Require-Command "node"
Require-Command "npm" | Out-Null
Require-Command "nssm" | Out-Null

if (-not (Test-Path ".env.local")) {
  throw ".env.local was not found in the project root."
}

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

Write-Step "Stopping existing services"
foreach ($Name in $ServiceNames) {
  Stop-ServiceIfExists $Name
}

Write-Step "Installing dependencies"
npm install

Write-Step "Installing Playwright Chromium"
npx playwright install chromium

Write-Step "Applying database schema and manual migrations"
npm run db:push
npm run db:manual

Write-Step "Building production app"
npm run build

if ($RecreateServices) {
  Write-Step "Recreating NSSM services"
  foreach ($Name in $ServiceNames) {
    Remove-ServiceIfExists $Name
  }

  Configure-Service "sentrovia-web" "Sentrovia Web" "Sentrovia Next.js web console" "scripts\bootstrap-runtime.mjs web" $NodePath
  Configure-Service "sentrovia-worker" "Sentrovia Worker" "Sentrovia monitoring worker" "scripts\bootstrap-runtime.mjs worker" $NodePath
} else {
  Write-Step "Ensuring NSSM services exist"
  foreach ($Name in $ServiceNames) {
    & nssm status $Name 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "$Name was not found. Re-run with -RecreateServices for first-time setup."
    }
    & nssm set $Name AppEnvironmentExtra NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=0 | Out-Host
  }
}

Write-Step "Starting services"
& nssm start sentrovia-web | Out-Host
& nssm start sentrovia-worker | Out-Host

Write-Step "Service status"
& nssm status sentrovia-web | Out-Host
& nssm status sentrovia-worker | Out-Host

Write-Host ""
Write-Host "Sentrovia update completed." -ForegroundColor Green
