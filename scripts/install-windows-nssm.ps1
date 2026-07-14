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
$PlaywrightBrowsersPath = Join-Path $ProjectRoot ".playwright-browsers"
$ProductionBuildPath = Join-Path $ProjectRoot ".next"
$ProductionBuildBackupPath = Join-Path $ProjectRoot ".next.sentrovia-update-backup"
$DefaultServiceNames = @("sentrovia-web", "sentrovia-worker")
$ServiceNames = $DefaultServiceNames
$RetiredSourcePaths = @(
  "src\app\api\incidents",
  "src\app\api\maintenance",
  "src\app\api\auth\register",
  "src\app\api\monitors\overview",
  "src\app\incidents",
  "src\app\maintenance",
  "src\lib\maintenance"
)
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
  return $null -ne (Get-Service -Name $Name -ErrorAction SilentlyContinue)
}

function Resolve-ExistingServiceNames {
  $KnownPairs = @(
    @("sentrovia-web", "sentrovia-worker"),
    @("SentroviaWeb", "SentroviaWorker")
  )

  foreach ($Pair in $KnownPairs) {
    if ((Test-NssmService -Name $Pair[0]) -and (Test-NssmService -Name $Pair[1])) {
      return $Pair
    }
  }

  $DetectedNames = @(Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "(?i)sentrovia" } |
    Select-Object -ExpandProperty Name)
  $DetectedText = if ($DetectedNames.Count -gt 0) { $DetectedNames -join ", " } else { "none" }
  throw "Sentrovia web and worker services were not found as a known pair. Detected Sentrovia services: $DetectedText."
}

function Stop-NssmService {
  param([string]$Name)
  $Service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $Service -or $Service.Status -eq "Stopped") {
    return
  }

  Invoke-NssmCommand -Arguments @("stop", $Name) -FailureMessage "Unable to stop the $Name service."
}

function Remove-NssmService {
  param([string]$Name)
  if (Test-NssmService -Name $Name) {
    Invoke-NssmCommand -Arguments @("remove", $Name, "confirm") -FailureMessage "Unable to remove the $Name service."
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

function Invoke-NssmCommand {
  param([string[]]$Arguments, [string]$FailureMessage)

  $PreviousPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    & nssm @Arguments 2>&1 | Out-Host
    $ExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousPreference
  }

  if ($ExitCode -ne 0) {
    throw "$FailureMessage Exit code: $ExitCode."
  }
}

function Initialize-PlaywrightBrowserCache {
  if (Test-Path -LiteralPath $PlaywrightBrowsersPath) {
    return
  }

  $LegacyPath = Join-Path $ProjectRoot "node_modules\playwright-core\.local-browsers"
  if (Test-Path -LiteralPath $LegacyPath) {
    Move-Item -LiteralPath $LegacyPath -Destination $PlaywrightBrowsersPath
    Write-Host "Preserved the existing Playwright browser cache."
    return
  }

  New-Item -ItemType Directory -Path $PlaywrightBrowsersPath | Out-Null
}

function Resolve-ProjectChildPath {
  param([string]$RelativePath)

  $RootPrefix = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\') + '\'
  $TargetPath = [IO.Path]::GetFullPath((Join-Path $ProjectRoot $RelativePath))
  if (-not $TargetPath.StartsWith($RootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to access a path outside the project directory: $RelativePath"
  }
  return $TargetPath
}

function Remove-RetiredSourceFiles {
  foreach ($RelativePath in $RetiredSourcePaths) {
    $TargetPath = Resolve-ProjectChildPath -RelativePath $RelativePath
    if (Test-Path -LiteralPath $TargetPath) {
      Remove-Item -LiteralPath $TargetPath -Recurse -Force
      Write-Host "Removed retired source path: $RelativePath"
    }
  }
}

function Repair-InterruptedBuildBackup {
  if (-not (Test-Path -LiteralPath $ProductionBuildBackupPath)) {
    return
  }

  if (Test-Path -LiteralPath $ProductionBuildPath) {
    Remove-Item -LiteralPath $ProductionBuildPath -Recurse -Force
  }
  Move-Item -LiteralPath $ProductionBuildBackupPath -Destination $ProductionBuildPath
  Write-Host "Restored the production build from an interrupted update."
}

function Backup-ProductionBuild {
  if (-not (Test-Path -LiteralPath $ProductionBuildPath)) {
    return $false
  }

  Move-Item -LiteralPath $ProductionBuildPath -Destination $ProductionBuildBackupPath
  return $true
}

function Restore-ProductionBuild {
  if (-not (Test-Path -LiteralPath $ProductionBuildBackupPath)) {
    return
  }

  if (Test-Path -LiteralPath $ProductionBuildPath) {
    Remove-Item -LiteralPath $ProductionBuildPath -Recurse -Force
  }
  Move-Item -LiteralPath $ProductionBuildBackupPath -Destination $ProductionBuildPath
  Write-Host "Restored the previous production build." -ForegroundColor Yellow
}

function Complete-ProductionBuild {
  if (Test-Path -LiteralPath $ProductionBuildBackupPath) {
    Remove-Item -LiteralPath $ProductionBuildBackupPath -Recurse -Force
  }
}

function Set-NssmOption {
  param([string]$Name, [string]$Option, [object[]]$Value)
  $Arguments = @("set", $Name, $Option) + $Value
  Invoke-NssmCommand -Arguments $Arguments -FailureMessage "Unable to set $Option for $Name."
}

function Wait-NssmServiceRunning {
  param([string]$Name)

  for ($Attempt = 1; $Attempt -le 15; $Attempt += 1) {
    $Service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($Service -and $Service.Status -eq "Running") {
      return
    }
    Start-Sleep -Seconds 2
  }

  throw "$Name did not reach SERVICE_RUNNING within 30 seconds. Check the logs directory."
}

function Start-NssmServiceBestEffort {
  param([string]$Name)

  try {
    Start-NssmService -Name $Name
  } catch {
    Write-Host "Unable to restart $Name during failure recovery: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

function Start-NssmService {
  param([string]$Name)

  $Service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $Service) {
    throw "The $Name service was not found."
  }
  if ($Service.Status -eq "Running") {
    return
  }

  $Action = if ($Service.Status -eq "Paused") { "continue" } else { "start" }
  Invoke-NssmCommand -Arguments @($Action, $Name) -FailureMessage "Unable to $Action $Name."
}

function Configure-NssmService {
  param(
    [string]$Name,
    [string]$DisplayName,
    [string]$Description,
    [string]$Parameters,
    [string]$NodePath
  )

  Invoke-NssmCommand -Arguments @("install", $Name, $NodePath) -FailureMessage "Unable to install $Name."
  Set-NssmOption $Name "AppDirectory" @($ProjectRoot)
  Set-NssmOption $Name "AppParameters" @($Parameters)
  Set-NssmOption $Name "AppEnvironmentExtra" @("NODE_ENV=production", "PLAYWRIGHT_BROWSERS_PATH=$PlaywrightBrowsersPath")
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
$BuildBackupCreated = $false
try {
Set-Location $ProjectRoot
$env:PLAYWRIGHT_BROWSERS_PATH = $PlaywrightBrowsersPath
Initialize-PlaywrightBrowserCache
Repair-InterruptedBuildBackup

Write-Host "Sentrovia Windows NSSM installer" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

Write-Step "Checking prerequisites"
$NodePath = Require-Command "node"
Require-Command "npm" | Out-Null
Require-Command "nssm" | Out-Null
Initialize-NssmEnvironment

if ($ExistingInstallation) {
  $ServiceNames = @(Resolve-ExistingServiceNames)
  Write-Host "Using NSSM services: $($ServiceNames -join ', ')"
}

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

Write-Step "Stopping existing services"
foreach ($Name in $ServiceNames) {
  Stop-NssmService -Name $Name
}
$ServicesStopped = $true

Write-Step "Removing retired source files"
Remove-RetiredSourceFiles

Write-Step "Installing exact dependencies"
Invoke-CheckedCommand -Command "npm" -Arguments @("ci") -FailureMessage "npm ci failed."

Write-Step "Ensuring the required Playwright Chromium version is installed"
Invoke-CheckedCommand -Command "npx" -Arguments @("playwright", "install", "chromium") -FailureMessage "Playwright installation failed."

Write-Step "Synchronizing database schema and manual migrations"
Invoke-CheckedCommand -Command "npm" -Arguments @("run", "db:sync") -FailureMessage "Database schema synchronization failed."

Write-Step "Building production app"
$BuildBackupCreated = Backup-ProductionBuild
try {
  Invoke-CheckedCommand -Command "npm" -Arguments @("run", "build") -FailureMessage "Production build failed."
  Complete-ProductionBuild
  $BuildBackupCreated = $false
} catch {
  if ($BuildBackupCreated) {
    Restore-ProductionBuild
    $BuildBackupCreated = $false
  }
  throw
}

if ($RecreateServices) {
  foreach ($Name in $ServiceNames) {
    Remove-NssmService -Name $Name
  }
}

Write-Step "Configuring NSSM services"
if (-not $ExistingInstallation) {
  if (-not (Test-NssmService -Name $DefaultServiceNames[0])) {
    Configure-NssmService $DefaultServiceNames[0] "Sentrovia Web" "Sentrovia Next.js web console" "scripts\bootstrap-runtime.mjs web" $NodePath
  }
  if (-not (Test-NssmService -Name $DefaultServiceNames[1])) {
    Configure-NssmService $DefaultServiceNames[1] "Sentrovia Worker" "Sentrovia monitoring worker" "scripts\bootstrap-runtime.mjs worker" $NodePath
  }
}

foreach ($Name in $ServiceNames) {
  Set-NssmOption $Name "AppEnvironmentExtra" @("NODE_ENV=production", "PLAYWRIGHT_BROWSERS_PATH=$PlaywrightBrowsersPath")
}

Write-Step "Starting services"
foreach ($Name in $ServiceNames) {
  Start-NssmService -Name $Name
}

Write-Step "Service status"
foreach ($Name in $ServiceNames) {
  Wait-NssmServiceRunning -Name $Name
  $Status = (Get-Service -Name $Name).Status
  Write-Host "$Name`: SERVICE_$($Status.ToString().ToUpperInvariant())"
}

Write-Host "Sentrovia NSSM installation completed." -ForegroundColor Green
} catch {
  if ($BuildBackupCreated) {
    Restore-ProductionBuild
  }
  if ($ExistingInstallation -and $ServicesStopped) {
    Write-Host "Update failed. Attempting to restart the existing services..." -ForegroundColor Yellow
    foreach ($Name in $ServiceNames) {
      Start-NssmServiceBestEffort -Name $Name
    }
  }
  throw
} finally {
  Set-Location $OriginalLocation
}
