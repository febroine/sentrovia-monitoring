param(
  [string]$Tag,
  [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [switch]$EmitStages
)

$ErrorActionPreference = "Stop"
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$ReleasesRoot = Join-Path $InstallRoot "releases"
$LogDir = Join-Path $InstallRoot "logs"
$ServiceStartTimeoutSeconds = 30
$ServiceStopTimeoutSeconds = 300
$ServiceStabilityWaitSeconds = 5
. (Join-Path $PSScriptRoot "environment-utils.ps1")
. (Join-Path $PSScriptRoot "nssm-service.ps1")

function Invoke-RequiredCommand {
  param([string]$Name, [string[]]$Arguments)
  & $Name @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

function Write-UpdateStage {
  param([string]$Name)
  if ($EmitStages) { Write-Output "SENTROVIA_UPDATE_STAGE:$Name" }
}

function Get-NssmDirectory {
  param([string]$Name)
  $Value = (& nssm get $Name AppDirectory | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $Value -or -not (Test-Path -LiteralPath $Value -PathType Container)) {
    throw "Cannot read a valid AppDirectory for $Name."
  }
  return (Resolve-Path -LiteralPath $Value).Path
}

function Get-NssmBrowserPath {
  param([string]$Name)
  $Environment = (& nssm get $Name AppEnvironmentExtra | Out-String)
  if ($LASTEXITCODE -ne 0) { throw "Cannot read AppEnvironmentExtra for $Name." }
  $Match = [regex]::Match($Environment, '(?m)^PLAYWRIGHT_BROWSERS_PATH=(.+)\s*$')
  if (-not $Match.Success) { throw "$Name has no PLAYWRIGHT_BROWSERS_PATH setting." }
  return $Match.Groups[1].Value.Trim()
}

function Wait-ForHealth {
  param([int]$Port)
  $Url = "http://127.0.0.1:$Port/api/health"
  $Deadline = (Get-Date).AddSeconds(60)
  do {
    try {
      $Response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($Response.StatusCode -eq 200 -and $Response.Content.Trim() -eq "ok") { return }
    } catch {
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $Deadline)
  throw "The new web service did not pass $Url within 60 seconds."
}

function Assert-ReleaseAssetUrl {
  param([string]$Url, [string]$Repository, [string]$ReleaseTag, [string]$FileName)
  $Expected = "https://github.com/$Repository/releases/download/$ReleaseTag/$FileName"
  if ($Url -ne $Expected) { throw "Unexpected download URL for $FileName." }
}

function Resolve-ReleaseRepository {
  param([string]$Configured)
  if (-not $Configured) { return "febroine/sentrovia-monitoring" }
  $Normalized = $Configured.Trim() -replace '^https://github\.com/', '' -replace '^git@github\.com:', '' -replace '\.git$', ''
  $Parts = $Normalized.Split('/')
  if ($Parts.Count -ne 2 -or $Parts[0] -notmatch '^[A-Za-z0-9_.-]+$' -or $Parts[1] -notmatch '^[A-Za-z0-9_.-]+$' -or
      $Parts[0] -in @('.', '..') -or $Parts[1] -in @('.', '..')) {
    throw "APP_UPDATE_REPO must be a GitHub owner/repository slug."
  }
  return $Normalized
}

New-Item -ItemType Directory -Force -Path $ReleasesRoot, $LogDir | Out-Null
$LockPath = Join-Path $ReleasesRoot ".update.lock"
try {
  $UpdateLock = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch {
  throw "Another release update is already running, or $LockPath cannot be locked."
}
$TranscriptPath = Join-Path $LogDir ("sentrovia-release-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
Start-Transcript -Path $TranscriptPath | Out-Null
$OriginalLocation = Get-Location
$Stopped = $false
$OldDirectories = @{}
try {
  Write-UpdateStage -Name "checks"
  foreach ($Command in @("node", "npm", "npx", "nssm")) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { throw "$Command is required in PATH." }
  }
  $Services = @(Resolve-ExistingServiceNames)
  foreach ($Name in $Services) { $OldDirectories[$Name] = Get-NssmDirectory -Name $Name }
  if ($OldDirectories[$Services[0]] -ne $OldDirectories[$Services[1]]) {
    throw "Web and worker must run from the same release directory."
  }
  $ActiveRoot = $OldDirectories[$Services[0]]
  $BrowserPath = Get-NssmBrowserPath -Name $Services[1]
  $ActiveEnv = Join-Path $ActiveRoot ".env.local"
  Assert-SentroviaEnvironment -Path $ActiveEnv -Mode Nssm
  $Settings = Read-SentroviaEnvironment -Path $ActiveEnv
  $Repository = Resolve-ReleaseRepository -Configured $Settings["APP_UPDATE_REPO"]
  $Port = 3000
  if ($Settings["PORT"] -and (-not [int]::TryParse($Settings["PORT"], [ref]$Port) -or $Port -lt 1 -or $Port -gt 65535)) {
    throw "PORT in .env.local must be a valid TCP port."
  }

  Write-UpdateStage -Name "release"
  $ApiUrl = if ($Tag) {
    if ($Tag -notmatch '^v\d+\.\d+\.\d+$') { throw "Tag must be vMAJOR.MINOR.PATCH." }
    "https://api.github.com/repos/$Repository/releases/tags/$Tag"
  } else {
    "https://api.github.com/repos/$Repository/releases/latest"
  }
  $Headers = @{ "User-Agent" = "Sentrovia-Windows-Updater"; "Accept" = "application/vnd.github+json" }
  $Release = Invoke-RestMethod -Uri $ApiUrl -Headers $Headers -TimeoutSec 30
  $Tag = [string]$Release.tag_name
  if ($Tag -notmatch '^v\d+\.\d+\.\d+$' -or $Release.draft -or $Release.prerelease) {
    throw "The selected GitHub release is not a published stable version."
  }
  $ActivePackage = Get-Content -LiteralPath (Join-Path $ActiveRoot "package.json") -Raw | ConvertFrom-Json
  if ([version]$Tag.Substring(1) -le [version]$ActivePackage.version) {
    throw "Release $Tag is not newer than the running version $($ActivePackage.version)."
  }
  $ArchiveName = "sentrovia-monitoring-$Tag.zip"
  $ArchiveAsset = @($Release.assets | Where-Object { $_.name -eq $ArchiveName })
  $ChecksumAsset = @($Release.assets | Where-Object { $_.name -eq "SHA256SUMS" })
  if ($ArchiveAsset.Count -ne 1 -or $ChecksumAsset.Count -ne 1) {
    throw "Release $Tag must contain exactly one $ArchiveName and SHA256SUMS asset."
  }
  Assert-ReleaseAssetUrl -Url $ArchiveAsset[0].browser_download_url -Repository $Repository -ReleaseTag $Tag -FileName $ArchiveName
  Assert-ReleaseAssetUrl -Url $ChecksumAsset[0].browser_download_url -Repository $Repository -ReleaseTag $Tag -FileName "SHA256SUMS"
  Write-UpdateStage -Name "download"
  $Stage = Join-Path $ReleasesRoot ("$Tag-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $Stage | Out-Null
  $ArchivePath = Join-Path $Stage $ArchiveName
  $ChecksumPath = Join-Path $Stage "SHA256SUMS"
  Invoke-WebRequest -Uri $ArchiveAsset[0].browser_download_url -OutFile $ArchivePath -UseBasicParsing -TimeoutSec 300
  Invoke-WebRequest -Uri $ChecksumAsset[0].browser_download_url -OutFile $ChecksumPath -UseBasicParsing -TimeoutSec 30
  $Checksum = Get-Content -LiteralPath $ChecksumPath -Raw
  $ChecksumPattern = '(?m)^([a-fA-F0-9]{64})\s+\*?' + [regex]::Escape($ArchiveName) + '\s*$'
  $Match = [regex]::Match($Checksum, $ChecksumPattern)
  if (-not $Match.Success -or (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash -ne $Match.Groups[1].Value) {
    throw "Release archive SHA-256 does not match SHA256SUMS."
  }
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $Stage
  $NewRoot = Join-Path $Stage "sentrovia-monitoring-$Tag"
  if (-not (Test-Path -LiteralPath (Join-Path $NewRoot "package-lock.json") -PathType Leaf)) {
    throw "Release archive does not contain the expected application folder."
  }
  $NewPackage = Get-Content -LiteralPath (Join-Path $NewRoot "package.json") -Raw | ConvertFrom-Json
  if ($NewPackage.version -ne $Tag.Substring(1)) { throw "Archive version differs from release tag $Tag." }

  Write-UpdateStage -Name "prepare"
  Copy-Item -LiteralPath $ActiveEnv -Destination (Join-Path $NewRoot ".env.local")
  $BackupDirectory = $Settings["AUTOMATIC_BACKUP_DIRECTORY"]
  if (-not $BackupDirectory) { $BackupDirectory = "backups" }
  if (-not [System.IO.Path]::IsPathRooted($BackupDirectory)) {
    $BackupDirectory = [System.IO.Path]::GetFullPath((Join-Path $ActiveRoot $BackupDirectory))
  }
  Set-SentroviaEnvironmentValue -Path (Join-Path $NewRoot ".env.local") -Name "AUTOMATIC_BACKUP_DIRECTORY" -Value $BackupDirectory
  $env:PLAYWRIGHT_BROWSERS_PATH = $BrowserPath
  New-Item -ItemType Directory -Force -Path $env:PLAYWRIGHT_BROWSERS_PATH | Out-Null
  Set-Location $NewRoot
  Write-UpdateStage -Name "build"
  Invoke-RequiredCommand -Name "npm" -Arguments @("ci")
  Invoke-RequiredCommand -Name "npx" -Arguments @("playwright", "install", "chromium")
  Invoke-RequiredCommand -Name "npm" -Arguments @("run", "build")

  Set-Location $ActiveRoot
  Write-UpdateStage -Name "backup"
  Invoke-RequiredCommand -Name "npx" -Arguments @("tsx", "scripts/backup-before-release.ts")
  $Stopped = $true
  Write-UpdateStage -Name "stop"
  foreach ($Name in $Services) { Stop-NssmService -Name $Name }
  Set-Location $NewRoot
  Write-UpdateStage -Name "database"
  Invoke-RequiredCommand -Name "npm" -Arguments @("run", "db:sync")
  Write-UpdateStage -Name "start"
  foreach ($Name in $Services) { Set-NssmOption -Name $Name -Option "AppDirectory" -Value @($NewRoot) }
  foreach ($Name in $Services) { Start-NssmService -Name $Name }
  Confirm-NssmServicesStable -Names $Services
  Write-UpdateStage -Name "health"
  Wait-ForHealth -Port $Port
  Write-UpdateStage -Name "complete"
  Write-Host "Release $Tag is running. Previous application directory: $ActiveRoot" -ForegroundColor Green
  Write-Host "Backup directory: $BackupDirectory"
} catch {
  $Failure = $_
  if ($Stopped) {
    Write-UpdateStage -Name "rollback"
    Write-Host "Release failed. Restoring previous service directories..." -ForegroundColor Yellow
    foreach ($Name in $Services) { Stop-NssmServiceBestEffort -Name $Name }
    foreach ($Name in $Services) {
      try { Set-NssmOption -Name $Name -Option "AppDirectory" -Value @($OldDirectories[$Name]) }
      catch { Write-Host "Could not restore $Name AppDirectory: $($_.Exception.Message)" -ForegroundColor Red }
    }
    foreach ($Name in $Services) { Start-NssmServiceBestEffort -Name $Name }
    Write-Host "The database was not automatically rolled back. Verify compatibility before restoring its backup." -ForegroundColor Yellow
  }
  Write-UpdateStage -Name "failed"
  Write-Host "Release update failed: $($Failure.Exception.Message)" -ForegroundColor Red
  throw $Failure
} finally {
  Set-Location $OriginalLocation
  Stop-Transcript | Out-Null
  $UpdateLock.Dispose()
}
