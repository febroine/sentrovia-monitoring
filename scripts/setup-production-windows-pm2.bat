@echo off
setlocal
set "EXIT_CODE=0"

echo.
echo ============================================================
echo   Sentrovia Production Setup (PM2)
echo ============================================================
echo.

cd /d "%~dp0.."

echo [STEP 1/7] Node.js ve npm kontrol ediliyor...
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js bulunamadi. Lutfen once Node.js 20+ kurun.
  set "EXIT_CODE=1"
  goto :finish
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm bulunamadi. Lutfen Node.js kurulumunu kontrol edin.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Node.js ve npm hazir.

echo [STEP 2/7] PM2 kontrol ediliyor...
where pm2 >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PM2 bulunamadi.
  echo [HINT] PM2'yi global olarak kurun: npm install -g pm2
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] PM2 mevcut.

if not exist ".env.local" (
  echo [ERROR] .env.local bulunamadi.
  echo [HINT] Setup oncesi production ortam dosyasi hazir olmali.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] .env.local bulundu.

echo [STEP 3/7] Bagimliliklar kuruluyor...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install basarisiz oldu.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Bagimliliklar hazir.

echo [STEP 4/7] Veritabani semasi uygulanÄ±yor...
call npm run db:push
if errorlevel 1 (
  echo [ERROR] Veritabani semasi uygulanamadi.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Veritabani semasi guncel.

echo [STEP 5/7] Production build aliniyor...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build basarisiz oldu.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Production build tamamlandi.

echo [STEP 6/7] PM2 surecleri baslatiliyor...
call pm2 delete sentrovia-web >nul 2>nul
call pm2 delete sentrovia-worker >nul 2>nul
call pm2 start npm --name sentrovia-web -- run start
if errorlevel 1 (
  echo [ERROR] sentrovia-web PM2 ile baslatilamadi.
  set "EXIT_CODE=1"
  goto :finish
)
call pm2 start npm --name sentrovia-worker -- run worker:start
if errorlevel 1 (
  echo [ERROR] sentrovia-worker PM2 ile baslatilamadi.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] PM2 surecleri baslatildi.

echo [STEP 7/7] PM2 kaydi aliniyor...
call pm2 save
if errorlevel 1 (
  echo [ERROR] pm2 save basarisiz oldu.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] PM2 kaydi guncellendi.

echo.
echo [DONE] Sentrovia production setup tamamlandi.
echo [INFO] Kontrol komutlari:
echo [INFO]   - pm2 status
echo [INFO]   - pm2 logs sentrovia-web --lines 50
echo [INFO]   - pm2 logs sentrovia-worker --lines 50

:finish
echo.
if "%EXIT_CODE%"=="0" (
  echo [RESULT] Setup script tamamlandi.
) else (
  echo [RESULT] Setup script hata ile sonlandi. Yukaridaki son ERROR satirina bak.
)
echo [INFO] Bu pencereyi kapatmadan once sonucu inceleyebilirsin.
pause
exit /b %EXIT_CODE%
