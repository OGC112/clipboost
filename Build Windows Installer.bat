@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing ClipBoost desktop dependencies...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
call npm run desktop:build
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Installer created in the release folder.
pause
