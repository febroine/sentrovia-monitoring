param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path $ProjectRoot
$LogDirectory = Join-Path $ProjectRoot "logs"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TranscriptPath = Join-Path $LogDirectory "sentrovia-update-$Timestamp.log"
$ExitCode = 0

if (-not (Test-Path -LiteralPath $LogDirectory)) {
  New-Item -ItemType Directory -Path $LogDirectory | Out-Null
}

Start-Transcript -Path $TranscriptPath | Out-Null
try {
  Write-Host "Sentrovia NSSM update" -ForegroundColor Green
  Write-Host "Project: $ProjectRoot"
  Write-Host "Log: $TranscriptPath"

  & (Join-Path $PSScriptRoot "install-windows-nssm.ps1") `
    -ExistingInstallation `
    -ProjectRoot $ProjectRoot

  Write-Host "Update completed successfully." -ForegroundColor Green
} catch {
  $ExitCode = 1
  Write-Host ""
  Write-Host "Update failed: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "The full output is available at $TranscriptPath" -ForegroundColor Yellow
} finally {
  Stop-Transcript | Out-Null
}

exit $ExitCode
