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
      AUTH_SESSION_ID = $(New-SentroviaSecret -ByteLength 24)
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
    "AUTH_SESSION_ID=$(New-SentroviaSecret -ByteLength 24)",
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

