param(
  [string]$InstallRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
)

$ErrorActionPreference = "Stop"
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$UpdaterScript = Join-Path $PSScriptRoot "update-windows-release.ps1"
$ServiceScript = Join-Path $PSScriptRoot "nssm-service.ps1"
$LogDir = Join-Path $InstallRoot "logs"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:UpdateProcess = $null
$script:LogFiles = @()
$script:StageNames = @{
  checks = "Checking installation and services"
  release = "Checking the latest stable release"
  download = "Downloading and verifying release files"
  prepare = "Preparing the new release"
  build = "Installing dependencies and building"
  backup = "Creating and verifying database backup"
  stop = "Stopping Sentrovia services"
  database = "Applying database updates"
  start = "Starting the new release"
  health = "Checking service health"
  rollback = "Restoring the previous service directories"
  complete = "Update complete"
  failed = "Update failed"
}

function Get-InstalledVersion {
  . $script:ServiceScript
  foreach ($Command in @("node", "npm", "npx", "nssm")) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
      throw "$Command is required in PATH."
    }
  }

  $Services = @(Resolve-ExistingServiceNames)
  $Directories = @(
    foreach ($Name in $Services) {
      $Directory = (& nssm get $Name AppDirectory | Out-String).Trim()
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Directory -PathType Container)) {
        throw "Cannot read a valid AppDirectory for $Name."
      }
      (Resolve-Path -LiteralPath $Directory).Path
    }
  )
  if ($Directories[0] -ne $Directories[1]) {
    throw "Web and worker must run from the same release directory."
  }

  $Package = Get-Content -LiteralPath (Join-Path $Directories[0] "package.json") -Raw | ConvertFrom-Json
  if (-not $Package.version) { throw "The active release has no version in package.json." }
  return "v$($Package.version)"
}

function Read-SharedLogFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return "" }

  $Stream = New-Object System.IO.FileStream($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  $Reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::UTF8, $true)
  try {
    return $Reader.ReadToEnd()
  } finally {
    $Reader.Dispose()
  }
}

function Add-OutputLine {
  param([string]$Line)
  if ($Line.StartsWith("SENTROVIA_UPDATE_STAGE:")) {
    $Stage = $Line.Substring("SENTROVIA_UPDATE_STAGE:".Length)
    if ($script:StageNames.ContainsKey($Stage)) {
      $script:StatusLabel.Text = $script:StageNames[$Stage]
    }
    return
  }
  if (-not $Line) { return }

  $script:OutputBox.AppendText($Line + [Environment]::NewLine)
  if ($script:OutputBox.TextLength -gt 120000) {
    $script:OutputBox.Text = $script:OutputBox.Text.Substring($script:OutputBox.TextLength - 100000)
  }
  $script:OutputBox.SelectionStart = $script:OutputBox.TextLength
  $script:OutputBox.ScrollToCaret()
}

function Read-UpdateOutput {
  param([switch]$Flush)
  foreach ($File in $script:LogFiles) {
    try {
      $Content = Read-SharedLogFile -Path $File.Path
    } catch [System.IO.IOException] {
      continue
    }
    if ($Content.Length -lt $File.Length) {
      $File.Length = 0
      $File.Pending = ""
    }
    $File.Pending += $Content.Substring($File.Length)
    $File.Length = $Content.Length

    while (($Newline = $File.Pending.IndexOf("`n")) -ge 0) {
      $Line = $File.Pending.Substring(0, $Newline).TrimEnd("`r")
      $File.Pending = $File.Pending.Substring($Newline + 1)
      Add-OutputLine -Line $Line
    }
    if ($Flush -and $File.Pending) {
      Add-OutputLine -Line $File.Pending
      $File.Pending = ""
    }
  }
}

function Test-Administrator {
  $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = New-Object System.Security.Principal.WindowsPrincipal($Identity)
  return $Principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

$Form = New-Object System.Windows.Forms.Form
$Form.Text = "Sentrovia Update"
$Form.ClientSize = New-Object System.Drawing.Size(760, 600)
$Form.MinimumSize = New-Object System.Drawing.Size(650, 520)
$Form.StartPosition = "CenterScreen"
$Form.Font = [System.Drawing.SystemFonts]::MessageBoxFont
$Form.BackColor = [System.Drawing.Color]::White

$Heading = New-Object System.Windows.Forms.Label
$Heading.Text = "Sentrovia release update"
$Heading.Font = New-Object System.Drawing.Font($Form.Font.FontFamily, 17, [System.Drawing.FontStyle]::Bold)
$Heading.Location = New-Object System.Drawing.Point(24, 22)
$Heading.Size = New-Object System.Drawing.Size(690, 34)
$Heading.Anchor = "Top,Left,Right"
$Form.Controls.Add($Heading)

$Description = New-Object System.Windows.Forms.Label
$Description.Text = "Update the Windows web and worker services from a published stable release."
$Description.Location = New-Object System.Drawing.Point(24, 62)
$Description.Size = New-Object System.Drawing.Size(700, 24)
$Description.Anchor = "Top,Left,Right"
$Form.Controls.Add($Description)

$Divider = New-Object System.Windows.Forms.Panel
$Divider.BackColor = [System.Drawing.Color]::FromArgb(218, 225, 231)
$Divider.Location = New-Object System.Drawing.Point(24, 101)
$Divider.Size = New-Object System.Drawing.Size(712, 1)
$Divider.Anchor = "Top,Left,Right"
$Form.Controls.Add($Divider)

$InstalledLabel = New-Object System.Windows.Forms.Label
$InstalledLabel.Text = "Installed version"
$InstalledLabel.Location = New-Object System.Drawing.Point(24, 120)
$InstalledLabel.Size = New-Object System.Drawing.Size(154, 24)
$Form.Controls.Add($InstalledLabel)

$script:InstalledValue = New-Object System.Windows.Forms.Label
$script:InstalledValue.Text = "Checking..."
$script:InstalledValue.Location = New-Object System.Drawing.Point(184, 120)
$script:InstalledValue.Size = New-Object System.Drawing.Size(520, 24)
$script:InstalledValue.Anchor = "Top,Left,Right"
$Form.Controls.Add($script:InstalledValue)

$TargetLabel = New-Object System.Windows.Forms.Label
$TargetLabel.Text = "Target"
$TargetLabel.Location = New-Object System.Drawing.Point(24, 150)
$TargetLabel.Size = New-Object System.Drawing.Size(154, 24)
$Form.Controls.Add($TargetLabel)

$TargetValue = New-Object System.Windows.Forms.Label
$TargetValue.Text = "Latest stable GitHub release"
$TargetValue.Location = New-Object System.Drawing.Point(184, 150)
$TargetValue.Size = New-Object System.Drawing.Size(520, 24)
$TargetValue.Anchor = "Top,Left,Right"
$Form.Controls.Add($TargetValue)

$Notice = New-Object System.Windows.Forms.Label
$Notice.Text = "The updater verifies the download and creates a database backup before stopping services. Database changes are not automatically reversed if an update fails."
$Notice.Location = New-Object System.Drawing.Point(24, 187)
$Notice.Size = New-Object System.Drawing.Size(700, 50)
$Notice.Anchor = "Top,Left,Right"
$Form.Controls.Add($Notice)

$script:StartButton = New-Object System.Windows.Forms.Button
$script:StartButton.Text = "Install update"
$script:StartButton.Location = New-Object System.Drawing.Point(24, 252)
$script:StartButton.Size = New-Object System.Drawing.Size(150, 36)
$script:StartButton.BackColor = [System.Drawing.Color]::FromArgb(23, 88, 123)
$script:StartButton.ForeColor = [System.Drawing.Color]::White
$script:StartButton.FlatStyle = "Flat"
$script:StartButton.FlatAppearance.BorderSize = 0
$Form.Controls.Add($script:StartButton)

$OpenLogsButton = New-Object System.Windows.Forms.Button
$OpenLogsButton.Text = "Open logs"
$OpenLogsButton.Location = New-Object System.Drawing.Point(184, 252)
$OpenLogsButton.Size = New-Object System.Drawing.Size(116, 36)
$OpenLogsButton.Add_Click({ Invoke-Item -LiteralPath $LogDir })
$Form.Controls.Add($OpenLogsButton)

$CloseButton = New-Object System.Windows.Forms.Button
$CloseButton.Text = "Close"
$CloseButton.Location = New-Object System.Drawing.Point(640, 252)
$CloseButton.Size = New-Object System.Drawing.Size(96, 36)
$CloseButton.Anchor = "Top,Right"
$CloseButton.Add_Click({ $Form.Close() })
$Form.Controls.Add($CloseButton)

$script:StatusLabel = New-Object System.Windows.Forms.Label
$script:StatusLabel.Text = "Ready"
$script:StatusLabel.Font = New-Object System.Drawing.Font($Form.Font, [System.Drawing.FontStyle]::Bold)
$script:StatusLabel.Location = New-Object System.Drawing.Point(24, 313)
$script:StatusLabel.Size = New-Object System.Drawing.Size(700, 25)
$script:StatusLabel.Anchor = "Top,Left,Right"
$Form.Controls.Add($script:StatusLabel)

$script:Progress = New-Object System.Windows.Forms.ProgressBar
$script:Progress.Location = New-Object System.Drawing.Point(24, 344)
$script:Progress.Size = New-Object System.Drawing.Size(712, 8)
$script:Progress.Anchor = "Top,Left,Right"
$Form.Controls.Add($script:Progress)

$OutputLabel = New-Object System.Windows.Forms.Label
$OutputLabel.Text = "Update output"
$OutputLabel.Location = New-Object System.Drawing.Point(24, 371)
$OutputLabel.Size = New-Object System.Drawing.Size(690, 22)
$Form.Controls.Add($OutputLabel)

$script:OutputBox = New-Object System.Windows.Forms.RichTextBox
$script:OutputBox.ReadOnly = $true
$script:OutputBox.WordWrap = $false
$script:OutputBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$script:OutputBox.Location = New-Object System.Drawing.Point(24, 396)
$script:OutputBox.Size = New-Object System.Drawing.Size(712, 180)
$script:OutputBox.Anchor = "Top,Bottom,Left,Right"
$Form.Controls.Add($script:OutputBox)

$Timer = New-Object System.Windows.Forms.Timer
$Timer.Interval = 750
$Timer.Add_Tick({
  if (-not $script:UpdateProcess) { return }
  Read-UpdateOutput
  if (-not $script:UpdateProcess.HasExited) { return }

  Read-UpdateOutput -Flush
  $Timer.Stop()
  $script:Progress.Style = "Blocks"
  if ($script:UpdateProcess.ExitCode -eq 0) {
    $script:Progress.Value = 100
    $script:StatusLabel.Text = "Update complete"
    try { $script:InstalledValue.Text = Get-InstalledVersion }
    catch { Add-OutputLine -Line "Unable to read the installed version: $($_.Exception.Message)" }
  } else {
    $script:Progress.Value = 0
    $script:StatusLabel.Text = "Update failed. Check the output and logs."
    $script:StartButton.Enabled = $true
  }
  $script:UpdateProcess.Dispose()
  $script:UpdateProcess = $null
})

$script:StartButton.Add_Click({
  $Choice = [System.Windows.Forms.MessageBox]::Show(
    $Form,
    "Install the latest stable release? Sentrovia services will briefly stop after the verified database backup. Database changes cannot be automatically rolled back.",
    "Confirm update",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Warning
  )
  if ($Choice -ne [System.Windows.Forms.DialogResult]::Yes) { return }

  try {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $RunId = (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + [guid]::NewGuid().ToString("N")
    $OutputPath = Join-Path $LogDir "sentrovia-update-$RunId.out.log"
    $ErrorPath = Join-Path $LogDir "sentrovia-update-$RunId.err.log"
    $Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$UpdaterScript`" -InstallRoot `"$InstallRoot`" -EmitStages"
    $script:UpdateProcess = Start-Process -FilePath (Join-Path $PSHOME "powershell.exe") `
      -ArgumentList $Arguments -WindowStyle Hidden -RedirectStandardOutput $OutputPath `
      -RedirectStandardError $ErrorPath -PassThru
    $script:LogFiles = @(
      @{ Path = $OutputPath; Length = 0; Pending = "" },
      @{ Path = $ErrorPath; Length = 0; Pending = "" }
    )
    $script:OutputBox.Clear()
    $script:StartButton.Enabled = $false
    $script:Progress.Style = "Marquee"
    $script:StatusLabel.Text = "Starting update"
    $Timer.Start()
  } catch {
    $script:StatusLabel.Text = "Could not start the updater"
    Add-OutputLine -Line $_.Exception.Message
  }
})

$Form.Add_FormClosing({
  param($Sender, $EventArgs)
  if ($script:UpdateProcess -and -not $script:UpdateProcess.HasExited) {
    $EventArgs.Cancel = $true
    [System.Windows.Forms.MessageBox]::Show(
      $Form,
      "The update is still running. Leave this window open until it finishes.",
      "Update in progress",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
  }
})

try {
  if (-not (Test-Administrator)) { throw "Run UPDATE-SENTROVIA.bat as Administrator." }
  if (-not (Test-Path -LiteralPath $UpdaterScript -PathType Leaf)) { throw "The release updater script is missing." }
  $script:InstalledValue.Text = Get-InstalledVersion
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
} catch {
  $script:InstalledValue.Text = "Unavailable"
  $script:StatusLabel.Text = "Cannot start update"
  $script:StartButton.Enabled = $false
  Add-OutputLine -Line $_.Exception.Message
}
$OpenLogsButton.Enabled = Test-Path -LiteralPath $LogDir -PathType Container

[System.Windows.Forms.Application]::Run($Form)
