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

