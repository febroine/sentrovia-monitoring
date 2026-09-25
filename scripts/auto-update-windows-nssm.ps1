param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [switch]$InstallTask
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$LogDirectory = Join-Path $ProjectRoot "logs"
$ExpectedOrigin = "https://github.com/febroine/sentrovia-monitoring.git"
$WorkflowRunsUrl = "https://api.github.com/repos/febroine/sentrovia-monitoring/actions/workflows/ci.yml/runs"
$DeployedCommitPath = Join-Path $LogDirectory "auto-update-deployed-commit"
$FailedCommitPath = Join-Path $LogDirectory "auto-update-failed-commit"

if ($InstallTask) {
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = [Security.Principal.WindowsPrincipal]::new($Identity)
  if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window on the NSSM server."
  }
  $Origin = & git -c "safe.directory=$ProjectRoot" -C $ProjectRoot remote get-url origin
  if ($LASTEXITCODE -ne 0 -or $Origin -notin @($ExpectedOrigin, ($ExpectedOrigin -replace '\.git$', ''))) {
    throw "origin must be the public Sentrovia GitHub HTTPS repository."
  }
  $Changes = & git -c "safe.directory=$ProjectRoot" -C $ProjectRoot status --porcelain --untracked-files=normal
  if ($LASTEXITCODE -ne 0 -or $Changes) {
    throw "The Git working tree must be clean before installing automatic updates."
  }
  New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
  if (-not (Test-Path -LiteralPath $DeployedCommitPath)) {
    $InstalledCommit = & git -c "safe.directory=$ProjectRoot" -C $ProjectRoot rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $InstalledCommit -notmatch '^[0-9a-f]{40}$') {
      throw "Could not identify the installed Git commit."
    }
    [IO.File]::WriteAllText($DeployedCommitPath, $InstalledCommit, [Text.UTF8Encoding]::new($false))
  }
  $TaskName = "Sentrovia GitHub Auto Update"
  $Action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ProjectRoot `"$ProjectRoot`"" `
    -WorkingDirectory $ProjectRoot
  $Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5)
  $Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Settings $Settings -User "SYSTEM" -RunLevel Highest -Force | Out-Null
  Write-Host "Installed '$TaskName'. It checks GitHub every five minutes."
  Write-Host "Run Start-ScheduledTask -TaskName '$TaskName' once and inspect logs/auto-update.log."
  exit 0
}

function Invoke-CheckedGit {
  param([string[]]$GitArguments)

  $Output = & git -c "safe.directory=$ProjectRoot" -C $ProjectRoot @GitArguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArguments[0]) failed with exit code $LASTEXITCODE."
  }
  return ($Output -join "`n").Trim()
}

function Restart-ExistingServices {
  foreach ($Name in @("sentrovia-web", "sentrovia-worker", "SentroviaWeb", "SentroviaWorker")) {
    $Service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $Service) { continue }
    if ($Service.Status -eq "Running") {
      Restart-Service -Name $Name -Force -ErrorAction Stop
    } else {
      Start-Service -Name $Name -ErrorAction Stop
    }
  }
}

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
$LockPath = Join-Path $LogDirectory "auto-update.lock"
try {
  $Lock = [IO.File]::Open($LockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
} catch [IO.IOException] {
  Write-Host "An update check is already running."
  exit 0
}

$LogPath = Join-Path $LogDirectory "auto-update.log"
if ((Test-Path -LiteralPath $LogPath) -and (Get-Item -LiteralPath $LogPath).Length -ge 10MB) {
  Move-Item -LiteralPath $LogPath -Destination (Join-Path $LogDirectory "auto-update.previous.log") -Force
}
$TranscriptStarted = $false
$OriginalPromptSetting = $env:GIT_TERMINAL_PROMPT
try {
  Start-Transcript -Path $LogPath -Append | Out-Null
  $TranscriptStarted = $true
  $env:GIT_TERMINAL_PROMPT = "0"

  $Origin = Invoke-CheckedGit -GitArguments @("remote", "get-url", "origin")
  if ($Origin -notin @($ExpectedOrigin, ($ExpectedOrigin -replace '\.git$', ''))) {
    throw "origin must be the public Sentrovia GitHub HTTPS repository."
  }
  if (Invoke-CheckedGit -GitArguments @("status", "--porcelain", "--untracked-files=normal")) {
    throw "The working tree has local changes. Resolve them before automatic updates."
  }

  if (-not (Test-Path -LiteralPath $DeployedCommitPath)) {
    throw "The deployed commit record is missing. Reinstall the scheduled task after verifying the current version."
  }
  $PreviousCommit = [IO.File]::ReadAllText($DeployedCommitPath).Trim()
  if ($PreviousCommit -notmatch '^[0-9a-f]{40}$' -or
      (Invoke-CheckedGit -GitArguments @("rev-parse", "HEAD")) -ne $PreviousCommit) {
    throw "Git HEAD differs from the recorded deployed commit. Recover the interrupted update manually."
  }
  Invoke-CheckedGit -GitArguments @("fetch", "--quiet", "--no-tags", "origin", "main") | Out-Null
  $TargetCommit = Invoke-CheckedGit -GitArguments @("rev-parse", "FETCH_HEAD")
  if ($PreviousCommit -eq $TargetCommit) {
    Write-Host "Already running $PreviousCommit."
    exit 0
  }
  if ((Test-Path -LiteralPath $FailedCommitPath) -and
      [IO.File]::ReadAllText($FailedCommitPath).Trim() -eq $TargetCommit) {
    Write-Host "Deployment of $TargetCommit previously failed. Awaiting a new commit or manual recovery."
    exit 0
  }

  & git -c "safe.directory=$ProjectRoot" -C $ProjectRoot merge-base --is-ancestor $PreviousCommit $TargetCommit
  if ($LASTEXITCODE -ne 0) {
    throw "The current commit is not an ancestor of origin/main. Manual review is required."
  }

  $Runs = Invoke-RestMethod -Uri "$WorkflowRunsUrl`?head_sha=$TargetCommit&branch=main&event=push&per_page=10" `
    -Headers @{ Accept = "application/vnd.github+json"; "User-Agent" = "Sentrovia-Auto-Update" } `
    -TimeoutSec 30
  $LatestRun = @($Runs.workflow_runs | Where-Object {
    $_.head_sha -eq $TargetCommit -and $_.head_branch -eq "main" -and $_.event -eq "push"
  } | Sort-Object id -Descending | Select-Object -First 1)
  if ($LatestRun.Count -eq 0 -or $LatestRun[0].status -ne "completed" -or $LatestRun[0].conclusion -ne "success") {
    Write-Host "Waiting for successful CI for $TargetCommit."
    exit 0
  }

  Write-Host "Creating a verified database backup before deploying $TargetCommit."
  Push-Location $ProjectRoot
  try {
    & npm run backup:before-update
    if ($LASTEXITCODE -ne 0) { throw "The pre-update database backup failed." }
  } finally {
    Pop-Location
  }

  try {
    Invoke-CheckedGit -GitArguments @("checkout", "--quiet", "--detach", $TargetCommit) | Out-Null
    & (Join-Path $ProjectRoot "scripts\update-windows-nssm.ps1") -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) { throw "The NSSM updater failed." }
  } catch {
    $UpdateError = $_
    Write-Host "Update failed; restoring source commit $PreviousCommit."
    try {
      Invoke-CheckedGit -GitArguments @("checkout", "--quiet", "--force", "--detach", $PreviousCommit) | Out-Null
      Restart-ExistingServices
    } catch {
      Write-Host "Source or service recovery failed: $($_.Exception.Message)"
    }
    try {
      [IO.File]::WriteAllText($FailedCommitPath, $TargetCommit, [Text.UTF8Encoding]::new($false))
    } catch {
      Write-Host "Could not record the failed commit: $($_.Exception.Message)"
    }
    throw $UpdateError
  }
  [IO.File]::WriteAllText($DeployedCommitPath, $TargetCommit, [Text.UTF8Encoding]::new($false))
  if (Test-Path -LiteralPath $FailedCommitPath) { Remove-Item -LiteralPath $FailedCommitPath -Force }
  Write-Host "Deployed $TargetCommit successfully."
} catch {
  Write-Host "Automatic update failed: $($_.Exception.Message)"
  exit 1
} finally {
  $env:GIT_TERMINAL_PROMPT = $OriginalPromptSetting
  if ($TranscriptStarted) { Stop-Transcript | Out-Null }
  $Lock.Dispose()
}
