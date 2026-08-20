@echo off
setlocal
title Sentrovia Database Repair
cd /d "%~dp0"

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

if /I "%RUN_IN_DOCKER%"=="true" goto :docker

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  goto :failed
)

echo [1/2] Synchronizing schema and migrations...
call npm run db:sync
if errorlevel 1 goto :failed

echo.
echo [2/2] Checking and repairing database records...
node scripts\repair-database.mjs
if errorlevel 1 goto :failed
goto :success

:docker
echo [INFO] Running Sentrovia Docker installation detected.
echo [1/2] Building a current maintenance image and synchronizing schema...
docker compose run --rm --build --no-deps web npm run db:sync
if errorlevel 1 goto :failed

echo.
echo [2/2] Checking and repairing database records...
docker compose run --rm --no-deps web node scripts\repair-database.mjs
if errorlevel 1 goto :failed
goto :success

:success
echo.
echo [SUCCESS] Database check and repair completed.
set "EXIT_CODE=0"
goto :finish

:failed
echo.
echo [ERROR] Database repair stopped. No partially completed repair
echo transaction was kept. Review the error above.
set "EXIT_CODE=1"

:finish
echo.
pause
exit /b %EXIT_CODE%
