function New-SentroviaSecret {
  param([int]$ByteLength = 48)

  $Bytes = New-Object byte[] $ByteLength
  $Generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $Generator.GetBytes($Bytes)
  } finally {
    $Generator.Dispose()
  }

  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Read-SentroviaEnvironment {
  param([Parameter(Mandatory = $true)][string]$Path)

  $Values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $Values
  }

  foreach ($Line in Get-Content -LiteralPath $Path) {
    if ($Line -notmatch '^\s*(\w+)\s*=\s*(.*)$') {
      continue
    }

    $Value = $Matches[2].Trim()
    if ($Value.Length -ge 2 -and $Value[0] -eq '"' -and $Value[$Value.Length - 1] -eq '"') {
      $Value = $Value.Substring(1, $Value.Length - 2).Replace('\"', '"').Replace('\\', '\')
    }
    $Values[$Matches[1]] = $Value
  }

  return $Values
}

function Test-SentroviaUnsafeSecret {
  param([AllowEmptyString()][string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Trim().Length -lt 32) {
    return $true
  }

  $Normalized = $Value.Trim().ToLowerInvariant()
  return $Normalized.Contains("change-me") -or
    $Normalized.Contains("example") -or
    $Normalized.Contains("placeholder")
}

function Assert-SentroviaEnvironment {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][ValidateSet("Docker", "Nssm")][string]$Mode
  )

  $Values = Read-SentroviaEnvironment -Path $Path
  foreach ($Name in @("AUTH_SECRET", "APP_ENCRYPTION_SECRET")) {
    if (Test-SentroviaUnsafeSecret -Value $Values[$Name]) {
      throw "$Name in $Path is missing, too short, or a placeholder. Existing secrets are never rotated automatically."
    }
  }

  if ($Mode -eq "Docker" -and (Test-SentroviaUnsafeSecret -Value $Values["POSTGRES_PASSWORD"])) {
    throw "POSTGRES_PASSWORD in $Path is missing, too short, or a placeholder. Existing passwords are never rotated automatically."
  }

  if ([string]::IsNullOrWhiteSpace($Values["APP_URL"])) {
    throw "APP_URL is missing from $Path."
  }

  $HasDatabaseUrl = -not [string]::IsNullOrWhiteSpace($Values["DATABASE_URL"])
  $MissingDatabasePartCount = @("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB") |
    ForEach-Object { -not [string]::IsNullOrWhiteSpace($Values[$_]) } |
    Where-Object { -not $_ } |
    Measure-Object |
    Select-Object -ExpandProperty Count

  if ($Mode -eq "Nssm" -and -not $HasDatabaseUrl -and $MissingDatabasePartCount -gt 0) {
    throw "$Path must define DATABASE_URL or complete POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB values."
  }
}

function Write-SentroviaEnvironment {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string[]]$Lines
  )

  $Content = ($Lines -join [Environment]::NewLine) + [Environment]::NewLine
  $Encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $Encoding)
}

function Add-SentroviaEnvironmentDefaults {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Defaults
  )

  $Existing = Read-SentroviaEnvironment -Path $Path
  $MissingLines = @()
  foreach ($Entry in $Defaults.GetEnumerator()) {
    if (-not $Existing.ContainsKey([string]$Entry.Key)) {
      $MissingLines += "$($Entry.Key)=$($Entry.Value)"
    }
  }

  if ($MissingLines.Count -eq 0) {
    return @()
  }

  $CurrentContent = [System.IO.File]::ReadAllText($Path)
  $Prefix = if ($CurrentContent.Length -gt 0 -and -not $CurrentContent.EndsWith("`n")) {
    [Environment]::NewLine
  } else {
    ""
  }
  $Content = $Prefix + ($MissingLines -join [Environment]::NewLine) + [Environment]::NewLine
  [System.IO.File]::AppendAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
  return $MissingLines
}
