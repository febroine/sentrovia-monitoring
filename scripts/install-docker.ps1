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

function Get-DockerComposeProjectName {
  if (-not [string]::IsNullOrWhiteSpace($env:COMPOSE_PROJECT_NAME)) {
    return $env:COMPOSE_PROJECT_NAME.Trim().ToLowerInvariant()
  }

  $DirectoryName = Split-Path -Leaf (Resolve-Path $ProjectRoot)
  $ProjectName = ($DirectoryName.ToLowerInvariant() -replace '[^a-z0-9_-]', '').TrimStart([char[]]'_-')
  if ([string]::IsNullOrWhiteSpace($ProjectName)) {
    throw "Unable to derive the Docker Compose project name from $ProjectRoot."
  }
  return $ProjectName
}

function Test-ExistingDockerDatabaseVolume {
  $ProjectName = Get-DockerComposeProjectName
  $Volumes = @(& docker volume ls `
    --filter "label=com.docker.compose.project=$ProjectName" `
    --filter "label=com.docker.compose.volume=pgdata" `
    --format "{{.Name}}")
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect existing Docker volumes."
  }
  return $Volumes.Count -gt 0
}

function Initialize-DockerEnvironment {
  param([string]$Path)

  if (Test-Path -LiteralPath $Path) {
    Assert-SentroviaEnvironment -Path $Path -Mode Docker
    $AddedDefaults = Add-SentroviaEnvironmentDefaults -Path $Path -Defaults ([ordered]@{
      AUTH_TRUST_PROXY_HEADERS = "false"
      MONITOR_ALLOW_PRIVATE_TARGETS = "true"
    })
    Write-Host "Using the existing .env file. Secrets were not changed."
    if ($AddedDefaults.Count -gt 0) {
      Write-Host "Added missing runtime defaults: $($AddedDefaults -join ', ')"
    }
    return
  }

  if (Test-ExistingDockerDatabaseVolume) {
    throw "The Docker PostgreSQL volume already exists, but .env is missing. Restore the original .env instead of generating a new database password."
  }

  Write-SentroviaEnvironment -Path $Path -Lines @(
    "POSTGRES_USER=postgres",
    "POSTGRES_PASSWORD=$(New-SentroviaSecret -ByteLength 36)",
    "POSTGRES_DB=uptimemonitoring",
    "",
    "APP_URL=http://localhost:3000",
    "AUTH_SECRET=$(New-SentroviaSecret)",
    "AUTH_TRUST_PROXY_HEADERS=false",
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
  & docker compose up -d --build --wait --wait-timeout 300
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose up failed with exit code $LASTEXITCODE."
  }

  & docker compose ps
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Docker Compose service status."
  }

  Write-Host "Sentrovia is running at http://localhost:3000" -ForegroundColor Green
} finally {
  Set-Location $OriginalLocation
}
