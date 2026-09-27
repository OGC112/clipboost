@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo       ClipBoost - Publish Update
echo ========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git is not installed or not available in PATH.
  pause
  exit /b 1
)

git status --short
set /p MSG=Update description [ClipBoost update]: 
if "%MSG%"=="" set "MSG=ClipBoost update"

echo.
echo Adding files...
git add -A

git diff --cached --quiet
if not errorlevel 1 (
  echo Nothing changed. There is nothing to publish.
  pause
  exit /b 0
)

echo Creating commit...
git commit -m "%MSG%"
if errorlevel 1 (
  echo ERROR: Commit failed.
  pause
  exit /b 1
)

echo Uploading source to GitHub...
git push origin main
if errorlevel 1 (
  echo ERROR: Git push failed.
  pause
  exit /b 1
)

echo.
echo SUCCESS.
echo GitHub Actions is now building the Windows installer and publishing the next version automatically.
echo You can follow progress in GitHub - Actions.
pause
