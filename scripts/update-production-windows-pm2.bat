@echo off
setlocal
set "EXIT_CODE=0"

echo.
echo ============================================================
echo   Sentrovia Production Update (PM2)
echo ============================================================
echo.

cd /d "%~dp0.."

echo [STEP 1/8] Node.js ve npm kontrol ediliyor...
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

echo [STEP 2/8] PM2 kontrol ediliyor...
where pm2 >nul 2>nul
if errorlevel 1 (
  echo [ERROR] PM2 bulunamadi.
  echo [HINT] Once production kurulumu tamamlanmali veya PM2 global kurulmalidir.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] PM2 mevcut.

if not exist ".env.local" (
  echo [ERROR] .env.local bulunamadi.
  echo [HINT] Update oncesi production ortam dosyasi mevcut olmali.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] .env.local bulundu.

echo [STEP 3/8] Git guncellemesi aliniyor...
git pull
if errorlevel 1 (
  echo [ERROR] git pull basarisiz oldu.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Kod tabani guncellendi.

echo [STEP 4/8] Bagimliliklar guncelleniyor...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install basarisiz oldu.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Bagimliliklar hazir.

echo [STEP 5/8] Veritabani semasi uygulanıyor...
call npm run db:push
if errorlevel 1 (
  echo [ERROR] Veritabani semasi uygulanamadi.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Veritabani semasi guncel.

echo [STEP 6/8] Production build aliniyor...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build basarisiz oldu.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] Production build tamamlandi.

echo [STEP 7/8] PM2 surecleri guncelleniyor...
call pm2 describe sentrovia-web >nul 2>nul
set "HAS_WEB=%ERRORLEVEL%"
call pm2 describe sentrovia-worker >nul 2>nul
set "HAS_WORKER=%ERRORLEVEL%"

if "%HAS_WEB%"=="0" if "%HAS_WORKER%"=="0" (
  call pm2 restart sentrovia-web
  if errorlevel 1 (
    echo [ERROR] sentrovia-web restart basarisiz oldu.
    set "EXIT_CODE=1"
    goto :finish
  )
  call pm2 restart sentrovia-worker
  if errorlevel 1 (
    echo [ERROR] sentrovia-worker restart basarisiz oldu.
    set "EXIT_CODE=1"
    goto :finish
  )
) else (
  echo [INFO] PM2 surecleri bulunamadi. npm scriptleri ile yeniden baslatiliyor...
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
)
echo [OK] PM2 surecleri guncellendi.

echo [STEP 8/8] PM2 kaydi aliniyor...
call pm2 save
if errorlevel 1 (
  echo [ERROR] pm2 save basarisiz oldu.
  set "EXIT_CODE=1"
  goto :finish
)
echo [OK] PM2 kaydi guncellendi.

echo.
echo [DONE] Sentrovia production update tamamlandi.
echo [INFO] Kontrol komutlari:
echo [INFO]   - pm2 status
echo [INFO]   - pm2 logs sentrovia-web --lines 50
echo [INFO]   - pm2 logs sentrovia-worker --lines 50

:finish
echo.
if "%EXIT_CODE%"=="0" (
  echo [RESULT] Update script tamamlandi.
) else (
  echo [RESULT] Update script hata ile sonlandi. Yukaridaki son ERROR satirina bak.
)
echo [INFO] Bu pencereyi kapatmadan once sonucu inceleyebilirsin.
pause
exit /b %EXIT_CODE%
