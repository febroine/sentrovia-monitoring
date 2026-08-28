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
$DependenciesPath = Join-Path $ProjectRoot "node_modules"
$DependenciesBackupPath = Join-Path $ProjectRoot ".node_modules.sentrovia-update-backup"
$ProductionBuildPath = Join-Path $ProjectRoot ".next"
$ProductionBuildBackupPath = Join-Path $ProjectRoot ".next.sentrovia-update-backup"
$SuccessfulUpdateMarkerPath = Join-Path $ProjectRoot ".sentrovia-update-success"
$ServiceStartTimeoutSeconds = 30
$ServiceStopTimeoutSeconds = 300
$ServiceStabilityWaitSeconds = 5
$DefaultServiceNames = @("sentrovia-web", "sentrovia-worker")
$ServiceNames = $DefaultServiceNames
# Keep these upgrade cleanup targets until installations predating their removal are no longer supported.
$RetiredProjectPathsFile = Join-Path $PSScriptRoot "retired-project-paths.json"
if (-not (Test-Path -LiteralPath $RetiredProjectPathsFile)) {
  throw "Retired project paths manifest is missing: $RetiredProjectPathsFile"
}
$RetiredProjectPaths = @(Get-Content -LiteralPath $RetiredProjectPathsFile -Raw | ConvertFrom-Json)
. (Join-Path $PSScriptRoot "environment-utils.ps1")
. (Join-Path $PSScriptRoot "nssm-environment.ps1")
. (Join-Path $PSScriptRoot "nssm-service.ps1")
. (Join-Path $PSScriptRoot "nssm-update-state.ps1")

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

function Assert-NodeVersion {
  $RawVersion = (& node -p "process.versions.node" | Out-String).Trim()
  $ParsedVersion = $null
  if (-not [Version]::TryParse($RawVersion, [ref]$ParsedVersion) -or $ParsedVersion -lt [Version]"20.9.0") {
    throw "Node.js 20.9.0 or newer is required. Installed version: $RawVersion."
  }
}



function Invoke-CheckedCommand {
  param([string]$Command, [string[]]$Arguments, [string]$FailureMessage)
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage Exit code: $LASTEXITCODE."
  }
}




$OriginalLocation = Get-Location
$ServicesStopped = $false
$DependenciesBackupCreated = $false
$BuildBackupCreated = $false
$EnvironmentBackupContent = $null
$SessionIdRotated = $false
try {
Set-Location $ProjectRoot
$env:PLAYWRIGHT_BROWSERS_PATH = $PlaywrightBrowsersPath
Initialize-PlaywrightBrowserCache
Repair-PreviousUpdateState

Write-Host "Sentrovia Windows NSSM installer" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

Write-Step "Checking prerequisites"
$NodePath = Require-Command "node"
Assert-NodeVersion
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
$ServicesStopped = $true
foreach ($Name in $ServiceNames) {
  Stop-NssmService -Name $Name
}

Write-Step "Removing retired project files"
Remove-RetiredProjectFiles

Write-Step "Installing exact dependencies"
$DependenciesBackupCreated = Backup-Directory -CurrentPath $DependenciesPath -BackupPath $DependenciesBackupPath
Invoke-CheckedCommand -Command "npm" -Arguments @("ci") -FailureMessage "npm ci failed."

Write-Step "Ensuring the required Playwright Chromium version is installed"
Invoke-CheckedCommand -Command "npx" -Arguments @("playwright", "install", "chromium") -FailureMessage "Playwright installation failed."

Write-Step "Building production app"
$BuildBackupCreated = Backup-Directory -CurrentPath $ProductionBuildPath -BackupPath $ProductionBuildBackupPath
Invoke-CheckedCommand -Command "npm" -Arguments @("run", "build") -FailureMessage "Production build failed."

Write-Step "Synchronizing database schema and manual migrations"
Invoke-CheckedCommand -Command "npm" -Arguments @("run", "db:sync") -FailureMessage "Database schema synchronization failed."

if ($ExistingInstallation) {
  Write-Step "Invalidating browser sessions from the previous release"
  $EnvironmentBackupContent = [System.IO.File]::ReadAllText($EnvironmentPath)
  Set-SentroviaEnvironmentValue -Path $EnvironmentPath -Name "AUTH_SESSION_ID" -Value (New-SentroviaSecret -ByteLength 24)
  $SessionIdRotated = $true
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

Set-NssmServiceRuntime -Name $ServiceNames[0] -Parameters "scripts\bootstrap-runtime.mjs web" -NodePath $NodePath
Set-NssmServiceRuntime -Name $ServiceNames[1] -Parameters "scripts\bootstrap-runtime.mjs worker" -NodePath $NodePath
foreach ($Name in $ServiceNames) {
  Set-NssmServiceRecovery -Name $Name
}

Write-Step "Starting services"
foreach ($Name in $ServiceNames) {
  Start-NssmService -Name $Name
}
Confirm-NssmServicesStable -Names $ServiceNames

Write-Step "Service status"
foreach ($Name in $ServiceNames) {
  $Status = (Get-Service -Name $Name).Status
  Write-Host "$Name`: SERVICE_$($Status.ToString().ToUpperInvariant())"
}

Complete-UpdateBackups
$BuildBackupCreated = $false
$DependenciesBackupCreated = $false

Write-Host "Sentrovia NSSM installation completed." -ForegroundColor Green
} catch {
  if ($ServicesStopped) {
    foreach ($Name in $ServiceNames) {
      Stop-NssmServiceBestEffort -Name $Name
    }
  }
  if ($BuildBackupCreated) {
    Restore-DirectoryBackup -CurrentPath $ProductionBuildPath -BackupPath $ProductionBuildBackupPath -Label "production build"
  }
  if ($DependenciesBackupCreated) {
    Restore-DirectoryBackup -CurrentPath $DependenciesPath -BackupPath $DependenciesBackupPath -Label "dependencies"
  }
  if ($SessionIdRotated -and $null -ne $EnvironmentBackupContent) {
    [System.IO.File]::WriteAllText(
      $EnvironmentPath,
      $EnvironmentBackupContent,
      (New-Object System.Text.UTF8Encoding($false))
    )
    Write-Host "Restored the previous session configuration." -ForegroundColor Yellow
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

