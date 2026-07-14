@echo off
setlocal
title Sentrovia Update
cd /d "%~dp0"

fltmc >nul 2>nul
if errorlevel 1 (
  if /I "%~1"=="--elevated" (
    echo [ERROR] Administrator permission is required.
    goto :failed
  )

  echo Requesting Administrator permission...
  set "SENTROVIA_UPDATER=%~f0"
  powershell.exe -NoProfile -Command "Start-Process -FilePath $env:SENTROVIA_UPDATER -ArgumentList '--elevated' -Verb RunAs"
  exit /b %ERRORLEVEL%
)

echo ============================================================
echo   Sentrovia NSSM Update
echo ============================================================
echo.
echo Existing environment settings and database records are kept.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\update-windows-nssm.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo [SUCCESS] Sentrovia was updated and both services were started.
) else (
  echo [ERROR] Update failed. Review the message above and the latest file in .\logs.
)
goto :finish

:failed
set "EXIT_CODE=1"

:finish
echo.
pause
exit /b %EXIT_CODE%
