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
$RetiredProjectPaths = @(
  "docker-compose.override.yml",
  "ecosystem.config.cjs",
  "errors.txt",
  "project_architecture_guide.md",
  "public\file.svg",
  "public\globe.svg",
  "public\next.svg",
  "public\vercel.svg",
  "public\window.svg",
  "scripts\setup-production-windows-nssm.bat",
  "scripts\setup-production-windows-pm2.bat",
  "scripts\update-production-windows-nssm.bat",
  "scripts\update-production-windows-pm2.bat",
  "src\app\api\app-update",
  "src\app\api\incidents",
  "src\app\api\maintenance",
  "src\app\api\auth\register",
  "src\app\api\monitors\overview",
  "src\app\incidents",
  "src\app\maintenance",
  "src\app\observability",
  "src\app\signup",
  "src\components\command-palette.tsx",
  "src\components\incidents",
  "src\components\maintenance",
  "src\components\monitoring\worker-observability-dashboard.tsx",
  "src\components\settings\app-update-card.tsx",
  "src\components\settings\maintenance-windows-editor.tsx",
  "src\components\update-banner.tsx",
  "src\lib\app-update",
  "src\lib\maintenance",
  "src\lib\reports\pdf.ts"
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

function Assert-NodeVersion {
  $RawVersion = (& node -p "process.versions.node" | Out-String).Trim()
  $ParsedVersion = $null
  if (-not [Version]::TryParse($RawVersion, [ref]$ParsedVersion) -or $ParsedVersion -lt [Version]"20.9.0") {
    throw "Node.js 20.9.0 or newer is required. Installed version: $RawVersion."
  }
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

  if ($Service.Status -ne "StopPending") {
    try {
      Stop-Service -Name $Name -ErrorAction Stop
    } catch {
      $Service = Get-Service -Name $Name -ErrorAction SilentlyContinue
      if (-not $Service -or $Service.Status -notin @("Stopped", "StopPending")) {
        throw
      }
    }
  }

  Wait-NssmServiceStatus -Name $Name -ExpectedStatus "Stopped" -TimeoutSeconds $ServiceStopTimeoutSeconds
}

function Stop-NssmServiceBestEffort {
  param([string]$Name)

  try {
    Stop-NssmService -Name $Name
  } catch {
    Write-Host "Unable to stop $Name during failure recovery: $($_.Exception.Message)" -ForegroundColor Yellow
  }
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
    $AddedDefaults = Add-SentroviaEnvironmentDefaults -Path $EnvironmentPath -Defaults ([ordered]@{
      AUTH_TRUST_PROXY_HEADERS = "false"
      MONITOR_ALLOW_PRIVATE_TARGETS = "true"
      WORKER_CONNECTIVITY_CHECK_ENABLED = "true"
      WORKER_CONNECTIVITY_TIMEOUT_MS = "5000"
      WORKER_AUTO_START = "true"
      DISABLE_EMBEDDED_WORKER_SPAWN = "true"
    })
    Write-Host "Using the existing .env.local file. Secrets were not changed."
    if ($AddedDefaults.Count -gt 0) {
      Write-Host "Added missing runtime defaults: $($AddedDefaults -join ', ')"
    }
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
    "AUTH_TRUST_PROXY_HEADERS=false",
    "APP_ENCRYPTION_SECRET=$(New-SentroviaSecret)",
    "WORKER_CONCURRENCY=20",
    "WORKER_POLL_INTERVAL_MS=10000",
    "WORKER_CONNECTIVITY_CHECK_ENABLED=true",
    "WORKER_CONNECTIVITY_TIMEOUT_MS=5000",
    "MONITOR_ALLOW_PRIVATE_TARGETS=true",
    "WORKER_AUTO_START=true",
    "DISABLE_EMBEDDED_WORKER_SPAWN=true"
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

function Remove-RetiredProjectFiles {
  foreach ($RelativePath in $RetiredProjectPaths) {
    $TargetPath = Resolve-ProjectChildPath -RelativePath $RelativePath
    if (Test-Path -LiteralPath $TargetPath) {
      Remove-Item -LiteralPath $TargetPath -Recurse -Force
      Write-Host "Removed retired project path: $RelativePath"
    }
  }
}

function Repair-InterruptedDirectoryBackup {
  param([string]$CurrentPath, [string]$BackupPath, [string]$Label)

  if (-not (Test-Path -LiteralPath $BackupPath)) {
    return
  }

  if (Test-Path -LiteralPath $CurrentPath) {
    Remove-Item -LiteralPath $CurrentPath -Recurse -Force
  }
  Move-Item -LiteralPath $BackupPath -Destination $CurrentPath
  Write-Host "Restored $Label from an interrupted update."
}

function Backup-Directory {
  param([string]$CurrentPath, [string]$BackupPath)

  if (-not (Test-Path -LiteralPath $CurrentPath)) {
    return $false
  }

  Move-Item -LiteralPath $CurrentPath -Destination $BackupPath
  return $true
}

function Restore-DirectoryBackup {
  param([string]$CurrentPath, [string]$BackupPath, [string]$Label)

  if (-not (Test-Path -LiteralPath $BackupPath)) {
    return
  }

  if (Test-Path -LiteralPath $CurrentPath) {
    Remove-Item -LiteralPath $CurrentPath -Recurse -Force
  }
  Move-Item -LiteralPath $BackupPath -Destination $CurrentPath
  Write-Host "Restored the previous $Label." -ForegroundColor Yellow
}

function Complete-DirectoryBackup {
  param([string]$BackupPath)

  if (Test-Path -LiteralPath $BackupPath) {
    Remove-Item -LiteralPath $BackupPath -Recurse -Force
  }
}

function Repair-PreviousUpdateState {
  if (Test-Path -LiteralPath $SuccessfulUpdateMarkerPath) {
    Complete-DirectoryBackup -BackupPath $ProductionBuildBackupPath
    Complete-DirectoryBackup -BackupPath $DependenciesBackupPath
    Remove-Item -LiteralPath $SuccessfulUpdateMarkerPath -Force
    return
  }

  Repair-InterruptedDirectoryBackup -CurrentPath $DependenciesPath -BackupPath $DependenciesBackupPath -Label "dependencies"
  Repair-InterruptedDirectoryBackup -CurrentPath $ProductionBuildPath -BackupPath $ProductionBuildBackupPath -Label "production build"
}

function Complete-UpdateBackups {
  [IO.File]::WriteAllText($SuccessfulUpdateMarkerPath, "completed", [Text.UTF8Encoding]::new($false))
  try {
    Complete-DirectoryBackup -BackupPath $ProductionBuildBackupPath
    Complete-DirectoryBackup -BackupPath $DependenciesBackupPath
    Remove-Item -LiteralPath $SuccessfulUpdateMarkerPath -Force
  } catch {
    Write-Host "Update succeeded, but old backup cleanup was deferred until the next run: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

function Set-NssmOption {
  param([string]$Name, [string]$Option, [object[]]$Value)
  $Arguments = @("set", $Name, $Option) + $Value
  Invoke-NssmCommand -Arguments $Arguments -FailureMessage "Unable to set $Option for $Name."
}

function Wait-NssmServiceStatus {
  param(
    [string]$Name,
    [ValidateSet("Stopped", "Running", "Paused")][string]$ExpectedStatus,
    [int]$TimeoutSeconds
  )

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $Service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($Service -and $Service.Status.ToString() -eq $ExpectedStatus) {
      return
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $Deadline)

  $ActualStatus = if ($Service) { $Service.Status.ToString().ToUpperInvariant() } else { "NOT_FOUND" }
  throw "$Name did not reach SERVICE_$($ExpectedStatus.ToUpperInvariant()) within $TimeoutSeconds seconds. Current status: SERVICE_$ActualStatus."
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

  if ($Service.Status -eq "StopPending") {
    Wait-NssmServiceStatus -Name $Name -ExpectedStatus "Stopped" -TimeoutSeconds $ServiceStopTimeoutSeconds
    $Service = Get-Service -Name $Name
  }
  if ($Service.Status -in @("StartPending", "ContinuePending")) {
    Wait-NssmServiceStatus -Name $Name -ExpectedStatus "Running" -TimeoutSeconds $ServiceStartTimeoutSeconds
    return
  }
  if ($Service.Status -eq "PausePending") {
    Wait-NssmServiceStatus -Name $Name -ExpectedStatus "Paused" -TimeoutSeconds $ServiceStartTimeoutSeconds
    $Service = Get-Service -Name $Name
  }
  if ($Service.Status -eq "Running") {
    return
  }

  $Action = if ($Service.Status -eq "Paused") { "continue" } else { "start" }
  Invoke-NssmCommand -Arguments @($Action, $Name) -FailureMessage "Unable to $Action $Name."
  Wait-NssmServiceStatus -Name $Name -ExpectedStatus "Running" -TimeoutSeconds $ServiceStartTimeoutSeconds
}

function Confirm-NssmServicesStable {
  param([string[]]$Names)

  Start-Sleep -Seconds $ServiceStabilityWaitSeconds
  foreach ($Name in $Names) {
    $Service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $Service -or $Service.Status -ne "Running") {
      $ActualStatus = if ($Service) { $Service.Status.ToString().ToUpperInvariant() } else { "NOT_FOUND" }
      throw "$Name did not remain running after startup. Current status: SERVICE_$ActualStatus. Review its error log under $LogDir."
    }
  }
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
  Set-NssmServiceRuntime -Name $Name -Parameters $Parameters -NodePath $NodePath
  Set-NssmOption $Name "DisplayName" @($DisplayName)
  Set-NssmOption $Name "Description" @($Description)
  Set-NssmOption $Name "Start" @("SERVICE_AUTO_START")
  Set-NssmOption $Name "AppStdout" @((Join-Path $LogDir "$Name.log"))
  Set-NssmOption $Name "AppStderr" @((Join-Path $LogDir "$Name-error.log"))
  Set-NssmOption $Name "AppRotateFiles" @(1)
  Set-NssmOption $Name "AppRotateOnline" @(1)
  Set-NssmOption $Name "AppRotateBytes" @(10485760)
}

function Set-NssmServiceRuntime {
  param(
    [string]$Name,
    [string]$Parameters,
    [string]$NodePath
  )

  Set-NssmOption $Name "Application" @($NodePath)
  Set-NssmOption $Name "AppDirectory" @($ProjectRoot)
  Set-NssmOption $Name "AppParameters" @($Parameters)
  Set-NssmOption $Name "AppEnvironmentExtra" @("NODE_ENV=production", "PLAYWRIGHT_BROWSERS_PATH=$PlaywrightBrowsersPath")
}

$OriginalLocation = Get-Location
$ServicesStopped = $false
$DependenciesBackupCreated = $false
$BuildBackupCreated = $false
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
