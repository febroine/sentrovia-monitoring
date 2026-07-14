param(
  [switch]$RecreateServices,
  [switch]$ExistingInstallation,
  [string]$AppUrl = "http://localhost:3000",
  [string]$DatabaseHost = "localhost",
  [ValidateRange(1, 65535)][int]$DatabasePort = 5432,
  [string]$DatabaseUser = "postgres",
  [string]$DatabaseName = "uptimemonitoring",
  [securestring]$DatabasePassword,
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path $ProjectRoot
$LogDir = Join-Path $ProjectRoot "logs"
$EnvironmentPath = Join-Path $ProjectRoot ".env.local"
$ServiceNames = @("sentrovia-web", "sentrovia-worker")
. (Join-Path $PSScriptRoot "environment-utils.ps1")

if ($RecreateServices -and $ExistingInstallation) {
  throw "RecreateServices and ExistingInstallation cannot be used together."
}

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command {
  param([string]$Name)
  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $Command) {
    throw "$Name was not found in PATH. Install it before running this installer."
  }
  return $Command.Source
}

function Test-NssmService {
  param([string]$Name)
  & nssm status $Name *> $null
  return $LASTEXITCODE -eq 0
}

function Stop-NssmService {
  param([string]$Name)
  $Status = & nssm status $Name 2>$null
  if ($LASTEXITCODE -ne 0 -or $Status -eq "SERVICE_STOPPED") {
    return
  }

  & nssm stop $Name | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to stop the $Name service."
  }
}

function Remove-NssmService {
  param([string]$Name)
  if (Test-NssmService -Name $Name) {
    & nssm remove $Name confirm | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to remove the $Name service."
    }
  }
}

function ConvertFrom-SecurePassword {
  param([securestring]$Value)
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
  }
}

function Initialize-NssmEnvironment {
  if (Test-Path -LiteralPath $EnvironmentPath) {
    Assert-SentroviaEnvironment -Path $EnvironmentPath -Mode Nssm
    Write-Host "Using the existing .env.local file. Secrets were not changed."
    return
  }

  if ($ExistingInstallation) {
    throw ".env.local was not found. The updater will not create or replace environment settings for an existing installation."
  }

  $EffectivePassword = $DatabasePassword
  if (-not $EffectivePassword) {
    $EffectivePassword = Read-Host "PostgreSQL password for $DatabaseUser@$DatabaseHost" -AsSecureString
  }
  $PlainPassword = ConvertFrom-SecurePassword -Value $EffectivePassword
  if ([string]::IsNullOrWhiteSpace($PlainPassword)) {
    throw "PostgreSQL password cannot be empty."
  }

  $ParsedAppUrl = $null
  if (-not [Uri]::TryCreate($AppUrl, [UriKind]::Absolute, [ref]$ParsedAppUrl) -or $ParsedAppUrl.Scheme -notin @("http", "https")) {
    throw "AppUrl must be an absolute HTTP or HTTPS URL."
  }
  if ([string]::IsNullOrWhiteSpace($DatabaseHost) -or $DatabaseHost -match '\s') {
    throw "DatabaseHost cannot be empty or contain whitespace."
  }
  if ([string]::IsNullOrWhiteSpace($DatabaseUser) -or [string]::IsNullOrWhiteSpace($DatabaseName)) {
    throw "DatabaseUser and DatabaseName cannot be empty."
  }

  $EncodedUser = [Uri]::EscapeDataString($DatabaseUser)
  $EncodedPassword = [Uri]::EscapeDataString($PlainPassword)
  $EncodedDatabase = [Uri]::EscapeDataString($DatabaseName)
  $FormattedDatabaseHost = if ($DatabaseHost.Contains(":") -and -not $DatabaseHost.StartsWith("[")) {
    "[$DatabaseHost]"
  } else {
    $DatabaseHost
  }
  $DatabaseUrl = "postgres://${EncodedUser}:${EncodedPassword}@${FormattedDatabaseHost}:${DatabasePort}/${EncodedDatabase}"
  $PlainPassword = $null

  Write-SentroviaEnvironment -Path $EnvironmentPath -Lines @(
    "DATABASE_URL=$DatabaseUrl",
    "APP_URL=$AppUrl",
    "AUTH_SECRET=$(New-SentroviaSecret)",
    "APP_ENCRYPTION_SECRET=$(New-SentroviaSecret)",
    "WORKER_CONCURRENCY=20",
    "WORKER_POLL_INTERVAL_MS=10000",
    "MONITOR_ALLOW_PRIVATE_TARGETS=true"
  )
  Write-Host "Created .env.local with cryptographically strong application secrets."
}

function Invoke-CheckedCommand {
  param([string]$Command, [string[]]$Arguments, [string]$FailureMessage)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage Exit code: $LASTEXITCODE."
  }
}

function Set-NssmOption {
  param([string]$Name, [string]$Option, [object[]]$Value)
  $Arguments = @("set", $Name, $Option) + $Value
  Invoke-CheckedCommand -Command "nssm" -Arguments $Arguments -FailureMessage "Unable to set $Option for $Name."
}

function Wait-NssmServiceRunning {
  param([string]$Name)

  for ($Attempt = 1; $Attempt -le 15; $Attempt += 1) {
    $Status = & nssm status $Name 2>$null
    if ($LASTEXITCODE -eq 0 -and $Status -eq "SERVICE_RUNNING") {
      return
    }
    Start-Sleep -Seconds 2
  }

  throw "$Name did not reach SERVICE_RUNNING within 30 seconds. Check the logs directory."
}

function Configure-NssmService {
  param(
    [string]$Name,
    [string]$DisplayName,
    [string]$Description,
    [string]$Parameters,
    [string]$NodePath
  )

  Invoke-CheckedCommand -Command "nssm" -Arguments @("install", $Name, $NodePath) -FailureMessage "Unable to install $Name."
  Set-NssmOption $Name "AppDirectory" @($ProjectRoot)
  Set-NssmOption $Name "AppParameters" @($Parameters)
  Set-NssmOption $Name "AppEnvironmentExtra" @("NODE_ENV=production", "PLAYWRIGHT_BROWSERS_PATH=0")
  Set-NssmOption $Name "DisplayName" @($DisplayName)
  Set-NssmOption $Name "Description" @($Description)
  Set-NssmOption $Name "Start" @("SERVICE_AUTO_START")
  Set-NssmOption $Name "AppStdout" @((Join-Path $LogDir "$Name.log"))
  Set-NssmOption $Name "AppStderr" @((Join-Path $LogDir "$Name-error.log"))
  Set-NssmOption $Name "AppRotateFiles" @(1)
  Set-NssmOption $Name "AppRotateOnline" @(1)
  Set-NssmOption $Name "AppRotateBytes" @(10485760)
}

$OriginalLocation = Get-Location
$ServicesStopped = $false
try {
Set-Location $ProjectRoot
$env:PLAYWRIGHT_BROWSERS_PATH = "0"

Write-Host "Sentrovia Windows NSSM installer" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

Write-Step "Checking prerequisites"
$NodePath = Require-Command "node"
Require-Command "npm" | Out-Null
Require-Command "nssm" | Out-Null
Initialize-NssmEnvironment

if ($ExistingInstallation) {
  foreach ($Name in $ServiceNames) {
    if (-not (Test-NssmService -Name $Name)) {
      throw "$Name was not found. Use the first-time NSSM installer before running an update."
    }
  }
}

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

Write-Step "Stopping existing services"
foreach ($Name in $ServiceNames) {
  Stop-NssmService -Name $Name
}
$ServicesStopped = $true

Write-Step "Installing exact dependencies"
Invoke-CheckedCommand -Command "npm" -Arguments @("ci") -FailureMessage "npm ci failed."

Write-Step "Installing Playwright Chromium"
Invoke-CheckedCommand -Command "npx" -Arguments @("playwright", "install", "chromium") -FailureMessage "Playwright installation failed."

Write-Step "Applying database schema and manual migrations"
Invoke-CheckedCommand -Command "npm" -Arguments @("run", "db:push:bootstrap") -FailureMessage "Database schema update failed."
Invoke-CheckedCommand -Command "npm" -Arguments @("run", "db:manual") -FailureMessage "Manual database migrations failed."

Write-Step "Building production app"
Invoke-CheckedCommand -Command "npm" -Arguments @("run", "build") -FailureMessage "Production build failed."

if ($RecreateServices) {
  foreach ($Name in $ServiceNames) {
    Remove-NssmService -Name $Name
  }
}

Write-Step "Configuring NSSM services"
if (-not (Test-NssmService -Name "sentrovia-web")) {
  Configure-NssmService "sentrovia-web" "Sentrovia Web" "Sentrovia Next.js web console" "scripts\bootstrap-runtime.mjs web" $NodePath
}
if (-not (Test-NssmService -Name "sentrovia-worker")) {
  Configure-NssmService "sentrovia-worker" "Sentrovia Worker" "Sentrovia monitoring worker" "scripts\bootstrap-runtime.mjs worker" $NodePath
}

foreach ($Name in $ServiceNames) {
  Set-NssmOption $Name "AppEnvironmentExtra" @("NODE_ENV=production", "PLAYWRIGHT_BROWSERS_PATH=0")
}

Write-Step "Starting services"
foreach ($Name in $ServiceNames) {
  Invoke-CheckedCommand -Command "nssm" -Arguments @("start", $Name) -FailureMessage "Unable to start $Name."
}

Write-Step "Service status"
foreach ($Name in $ServiceNames) {
  Wait-NssmServiceRunning -Name $Name
  $Status = & nssm status $Name
  Write-Host "$Name`: $Status"
}

Write-Host "Sentrovia NSSM installation completed." -ForegroundColor Green
} catch {
  if ($ExistingInstallation -and $ServicesStopped) {
    Write-Host "Update failed. Attempting to restart the existing services..." -ForegroundColor Yellow
    foreach ($Name in $ServiceNames) {
      & nssm start $Name 2>&1 | Out-Host
    }
  }
  throw
} finally {
  Set-Location $OriginalLocation
}
