@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo       ClipBoost - Update Dev Copy
echo ========================================
echo.

git pull --rebase origin main
if errorlevel 1 (
  echo ERROR: Could not update from GitHub.
  pause
  exit /b 1
)

npm install
if errorlevel 1 (
  echo ERROR: npm install failed.
  pause
  exit /b 1
)

echo.
echo ClipBoost development files are up to date.
pause
