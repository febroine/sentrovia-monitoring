@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-windows-nssm.ps1" -RecreateServices
exit /b %ERRORLEVEL%
