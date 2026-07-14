param(
  [switch]$SkipStart,
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "environment-utils.ps1")

function Require-DockerCompose {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker was not found in PATH. Install Docker Desktop or Docker Engine first."
  }

  & docker compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose is not available."
  }
}

function Initialize-DockerEnvironment {
  param([string]$Path)

  if (Test-Path -LiteralPath $Path) {
    Assert-SentroviaEnvironment -Path $Path -Mode Docker
    Write-Host "Using the existing .env file. Secrets were not changed."
    return
  }

  Write-SentroviaEnvironment -Path $Path -Lines @(
    "POSTGRES_USER=postgres",
    "POSTGRES_PASSWORD=$(New-SentroviaSecret -ByteLength 36)",
    "POSTGRES_DB=uptimemonitoring",
    "",
    "APP_URL=http://localhost:3000",
    "AUTH_SECRET=$(New-SentroviaSecret)",
    "APP_ENCRYPTION_SECRET=$(New-SentroviaSecret)",
    "",
    "WORKER_CONCURRENCY=20",
    "WORKER_POLL_INTERVAL_MS=10000",
    "MONITOR_ALLOW_PRIVATE_TARGETS=true"
  )
  Write-Host "Created .env with cryptographically strong secrets."
}

$OriginalLocation = Get-Location
try {
  Set-Location (Resolve-Path $ProjectRoot)
  $EnvironmentPath = Join-Path (Get-Location) ".env"

  Write-Host "Sentrovia Docker installer" -ForegroundColor Green
  Require-DockerCompose
  Initialize-DockerEnvironment -Path $EnvironmentPath

  if ($SkipStart) {
    Write-Host "Environment preparation completed. Docker startup was skipped."
    return
  }

  Write-Host "Building and starting PostgreSQL, web, and worker services..." -ForegroundColor Cyan
  & docker compose up -d --build
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose up failed with exit code $LASTEXITCODE."
  }

  & docker compose ps
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Docker Compose service status."
  }

  Write-Host "Sentrovia is starting at http://localhost:3000" -ForegroundColor Green
} finally {
  Set-Location $OriginalLocation
}
