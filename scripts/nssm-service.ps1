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

function Request-NssmServiceStart {
  param(
    [string]$Name,
    [bool]$ResumePausedService
  )

  try {
    if ($ResumePausedService) {
      Resume-Service -Name $Name -ErrorAction Stop
    } else {
      Start-Service -Name $Name -ErrorAction Stop
    }
  } catch {
    $Service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    $AcceptedStatuses = if ($ResumePausedService) {
      @("Running", "ContinuePending")
    } else {
      @("Running", "StartPending")
    }

    if (-not $Service -or $Service.Status.ToString() -notin $AcceptedStatuses) {
      throw
    }
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

  Request-NssmServiceStart -Name $Name -ResumePausedService ($Service.Status -eq "Paused")
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

function Set-NssmServiceRecovery {
  param([string]$Name)

  Set-NssmOption $Name "Start" @("SERVICE_AUTO_START")
  Set-NssmOption $Name "AppExit" @("Default", "Restart")
  Set-NssmOption $Name "AppRestartDelay" @(5000)
  Set-NssmOption $Name "AppThrottle" @(5000)
}

