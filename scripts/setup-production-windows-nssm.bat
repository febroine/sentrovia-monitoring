@echo off
setlocal
set "EXIT_CODE=0"

echo.
echo ============================================================
echo   Sentrovia Production Setup (NSSM)
echo ============================================================
echo.

cd /d "%~dp0.."

echo [STEP 1/8] Checking Node.js, npm, and NSSM...
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 20.9+ first.
  set "EXIT_CODE=1"
  goto :finish
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Check the Node.js installation.
  set "EXIT_CODE=1"
  goto :finish
)

where nssm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] NSSM was not found in PATH.
  echo [HINT] Download NSSM and add the folder containing nssm.exe to PATH.
  set "EXIT_CODE=1"
  goto :finish
)

for /f "delims=" %%i in ('where node') do if not defined NODE_EXE set "NODE_EXE=%%i"
echo [OK] Runtime tools are ready.

if not exist ".env.local" (
  echo [ERROR] .env.local was not found in the project root.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] .env.local found.

if not exist "logs" mkdir "logs"

echo [STEP 2/8] Installing dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Dependencies are ready.

echo [STEP 3/8] Installing Playwright Chromium...
call npx playwright install chromium
if errorlevel 1 (
  echo [ERROR] Playwright Chromium installation failed.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Playwright Chromium is ready.

echo [STEP 4/8] Applying database schema...
call npm run db:push
if errorlevel 1 (
  echo [ERROR] Database schema update failed.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Database schema is current.

echo [STEP 5/8] Building production app...
call npm run build
if errorlevel 1 (
  echo [ERROR] Production build failed.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Production build completed.

echo [STEP 6/8] Recreating NSSM services...
call nssm stop sentrovia-web >nul 2>nul
call nssm stop sentrovia-worker >nul 2>nul
call nssm remove sentrovia-web confirm >nul 2>nul
call nssm remove sentrovia-worker confirm >nul 2>nul

call nssm install sentrovia-web "%NODE_EXE%"
call nssm set sentrovia-web AppDirectory "%CD%"
call nssm set sentrovia-web AppParameters "scripts\bootstrap-runtime.mjs web"
call nssm set sentrovia-web AppEnvironmentExtra NODE_ENV=production
call nssm set sentrovia-web DisplayName "Sentrovia Web"
call nssm set sentrovia-web Description "Sentrovia Next.js web console"
call nssm set sentrovia-web Start SERVICE_AUTO_START
call nssm set sentrovia-web AppStdout "%CD%\logs\sentrovia-web.log"
call nssm set sentrovia-web AppStderr "%CD%\logs\sentrovia-web-error.log"
call nssm set sentrovia-web AppRotateFiles 1
call nssm set sentrovia-web AppRotateOnline 1
call nssm set sentrovia-web AppRotateBytes 10485760

call nssm install sentrovia-worker "%NODE_EXE%"
call nssm set sentrovia-worker AppDirectory "%CD%"
call nssm set sentrovia-worker AppParameters "scripts\bootstrap-runtime.mjs worker"
call nssm set sentrovia-worker AppEnvironmentExtra NODE_ENV=production
call nssm set sentrovia-worker DisplayName "Sentrovia Worker"
call nssm set sentrovia-worker Description "Sentrovia monitoring worker"
call nssm set sentrovia-worker Start SERVICE_AUTO_START
call nssm set sentrovia-worker AppStdout "%CD%\logs\sentrovia-worker.log"
call nssm set sentrovia-worker AppStderr "%CD%\logs\sentrovia-worker-error.log"
call nssm set sentrovia-worker AppRotateFiles 1
call nssm set sentrovia-worker AppRotateOnline 1
call nssm set sentrovia-worker AppRotateBytes 10485760
echo [OK] NSSM services are configured.

echo [STEP 7/8] Starting NSSM services...
call nssm start sentrovia-web
if errorlevel 1 (
  echo [ERROR] sentrovia-web could not be started.
  set "EXIT_CODE=1"
  goto :finish
)

call nssm start sentrovia-worker
if errorlevel 1 (
  echo [ERROR] sentrovia-worker could not be started.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] NSSM services started.

echo [STEP 8/8] Setup verification commands:
echo [INFO]   - nssm status sentrovia-web
echo [INFO]   - nssm status sentrovia-worker
echo [INFO]   - type logs\sentrovia-web.log
echo [INFO]   - type logs\sentrovia-worker.log

:finish
echo.
if "%EXIT_CODE%"=="0" (
  echo [RESULT] Setup completed.
) else (
  echo [RESULT] Setup failed. Check the latest ERROR line above.
)
pause
exit /b %EXIT_CODE%
