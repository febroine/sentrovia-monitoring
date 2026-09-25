@echo off
setlocal
title Sentrovia Update
cd /d "%~dp0"
if /I "%~1"=="--repair" goto :repair
set "CLI_MODE="
if /I "%~1"=="--cli" set "CLI_MODE=1"
if /I "%~2"=="--cli" set "CLI_MODE=1"

fltmc >nul 2>nul
if errorlevel 1 (
  if /I "%~1"=="--elevated" (
    echo [ERROR] Administrator permission is required.
    goto :failed
  )

  echo Requesting Administrator permission...
  set "SENTROVIA_UPDATER=%~f0"
  set "SENTROVIA_UPDATER_ARGS=--elevated"
  if defined CLI_MODE set "SENTROVIA_UPDATER_ARGS=--elevated --cli"
  powershell.exe -NoProfile -Command "Start-Process -FilePath $env:SENTROVIA_UPDATER -ArgumentList $env:SENTROVIA_UPDATER_ARGS -Verb RunAs"
  exit /b %ERRORLEVEL%
)

if not defined CLI_MODE (
  start "" powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\update-windows-gui.ps1"
  exit /b %ERRORLEVEL%
)

echo ============================================================
echo   Sentrovia Release Update
echo ============================================================
echo.
echo The latest stable GitHub release will be verified and installed.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\update-windows-release.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo [SUCCESS] Sentrovia release is healthy and both services are running.
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

:repair
title Sentrovia Database Repair
echo ============================================================
echo   Sentrovia Database Check and Repair
echo ============================================================
echo.
echo This process synchronizes the schema, repairs invalid state,
echo applies retention rules, and reports unknown database objects.
echo User accounts, active monitors, credentials, and valid settings
echo are preserved.
echo.

set "RUN_IN_DOCKER=false"
where docker >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%I in ('docker compose ps -q db 2^>nul') do set "RUN_IN_DOCKER=true"
)
if /I "%RUN_IN_DOCKER%"=="true" goto :repair_docker

set "REPAIR_ROOT=%CD%"
set "REPAIR_SERVICE="
sc query sentrovia-web >nul 2>nul
if not errorlevel 1 set "REPAIR_SERVICE=sentrovia-web"
if not defined REPAIR_SERVICE (
  sc query SentroviaWeb >nul 2>nul
  if not errorlevel 1 set "REPAIR_SERVICE=SentroviaWeb"
)
if defined REPAIR_SERVICE (
  set "REPAIR_ROOT="
  for /f "delims=" %%I in ('nssm get "%REPAIR_SERVICE%" AppDirectory 2^>nul') do set "REPAIR_ROOT=%%I"
)
if not defined REPAIR_ROOT (
  echo [ERROR] The active Sentrovia application directory could not be read.
  goto :repair_failed
)
if not exist "%REPAIR_ROOT%\package.json" (
  echo [ERROR] The active application directory has no package.json.
  goto :repair_failed
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  goto :repair_failed
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  goto :repair_failed
)

pushd "%REPAIR_ROOT%"
if errorlevel 1 goto :repair_failed
set "REPAIR_PUSHED=1"

echo [1/2] Synchronizing schema and migrations...
call npm run db:sync
if errorlevel 1 goto :repair_failed
echo.
echo [2/2] Checking and repairing database records...
node scripts\repair-database.mjs
if errorlevel 1 goto :repair_failed
goto :repair_success

:repair_docker
echo [INFO] Running Sentrovia Docker installation detected.
echo [1/2] Building a current maintenance image and synchronizing schema...
docker compose run --rm --build --no-deps web npm run db:sync
if errorlevel 1 goto :repair_failed
echo.
echo [2/2] Checking and repairing database records...
docker compose run --rm --no-deps web node scripts\repair-database.mjs
if errorlevel 1 goto :repair_failed

:repair_success
if defined REPAIR_PUSHED popd
echo.
echo [SUCCESS] Database check and repair completed.
set "EXIT_CODE=0"
goto :finish

:repair_failed
if defined REPAIR_PUSHED popd
echo.
echo [ERROR] Database repair stopped. No partially completed repair
echo transaction was kept. Review the error above.
set "EXIT_CODE=1"
goto :finish
