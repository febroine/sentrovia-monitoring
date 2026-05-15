@echo off
setlocal
set "EXIT_CODE=0"

echo.
echo ============================================================
echo   Sentrovia Production Update (NSSM)
echo ============================================================
echo.

cd /d "%~dp0.."
set "PLAYWRIGHT_BROWSERS_PATH=0"

echo [STEP 1/8] Checking Node.js, npm, NSSM, and services...
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
  set "EXIT_CODE=1"
  goto :finish
)

call nssm status sentrovia-web >nul 2>nul
if errorlevel 1 (
  echo [ERROR] sentrovia-web service was not found. Run setup-production-windows-nssm.bat first.
  set "EXIT_CODE=1"
  goto :finish
)

call nssm status sentrovia-worker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] sentrovia-worker service was not found. Run setup-production-windows-nssm.bat first.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] NSSM services are present.

if not exist ".env.local" (
  echo [ERROR] .env.local was not found in the project root.
  set "EXIT_CODE=1"
  goto :finish
)

echo [STEP 2/8] Stopping services...
call nssm stop sentrovia-worker
call nssm stop sentrovia-web
echo [OK] Services stopped.

echo [STEP 3/8] Installing updated dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  set "EXIT_CODE=1"
  goto :restart
)
echo [OK] Dependencies are ready.

echo [STEP 4/8] Installing Playwright Chromium...
call npx playwright install chromium
if errorlevel 1 (
  echo [ERROR] Playwright Chromium installation failed.
  set "EXIT_CODE=1"
  goto :restart
)
echo [OK] Playwright Chromium is ready.

echo [STEP 5/8] Applying database schema...
call npm run db:push
if errorlevel 1 (
  echo [ERROR] Database schema update failed.
  set "EXIT_CODE=1"
  goto :restart
)
echo [OK] Database schema is current.

echo [STEP 6/8] Building production app...
call npm run build
if errorlevel 1 (
  echo [ERROR] Production build failed.
  set "EXIT_CODE=1"
  goto :restart
)
echo [OK] Production build completed.

call nssm set sentrovia-web AppEnvironmentExtra NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=0
call nssm set sentrovia-worker AppEnvironmentExtra NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=0

echo [STEP 7/8] Starting services...

:restart
call nssm start sentrovia-web
call nssm start sentrovia-worker

echo [STEP 8/8] Current service status:
call nssm status sentrovia-web
call nssm status sentrovia-worker

:finish
echo.
if "%EXIT_CODE%"=="0" (
  echo [RESULT] Update completed.
) else (
  echo [RESULT] Update had an error. Services were started again if possible.
)
pause
exit /b %EXIT_CODE%
