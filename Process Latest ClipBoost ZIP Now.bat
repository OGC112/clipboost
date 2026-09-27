@echo off
cd /d "%~dp0"
echo Processing the newest ClipBoost ZIP from Downloads...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\process-latest.ps1"
echo.
pause
