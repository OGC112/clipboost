param([string]$RepoRoot = '')
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $candidate = Split-Path -Parent $PSScriptRoot
    try {
        $gitRoot = (& git -C $candidate rev-parse --show-toplevel 2>$null | Select-Object -First 1)
        if ($LASTEXITCODE -eq 0 -and $gitRoot) { $RepoRoot = $gitRoot }
        else { $RepoRoot = $candidate }
    } catch { $RepoRoot = $candidate }
}
$RepoRoot = (Resolve-Path $RepoRoot).Path
$Watcher = Join-Path $RepoRoot 'scripts\watch-downloads.ps1'
if (-not (Test-Path $Watcher)) { throw "Missing watcher: $Watcher" }
if (-not (Test-Path (Join-Path $RepoRoot '.git'))) { throw "Not a Git repository: $RepoRoot" }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not available in PATH.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is not available in PATH.' }

$StateDir = Join-Path $env:LOCALAPPDATA 'ClipBoostAutoPublisher'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$PidFile = Join-Path $StateDir 'watcher.pid'
if (Test-Path $PidFile) {
    $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($oldPid -match '^\d+$') { Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

$Startup = [Environment]::GetFolderPath('Startup')
$Launcher = Join-Path $Startup 'ClipBoost Auto Publisher.cmd'
$launcherText = "@echo off`r`nstart `"`" /min powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Watcher`" -RepoRoot `"$RepoRoot`"`r`n"
Set-Content -Path $Launcher -Value $launcherText -Encoding ASCII

Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$Watcher`"",'-RepoRoot',"`"$RepoRoot`""
)
Start-Sleep -Seconds 2

Write-Host ''
Write-Host '====================================================' -ForegroundColor Green
Write-Host ' ClipBoost Auto Publisher v1.3 installed' -ForegroundColor Green
Write-Host '====================================================' -ForegroundColor Green
Write-Host ''
Write-Host "Repository: $RepoRoot"
Write-Host 'Windows Downloads folder is detected from Windows itself.'
Write-Host ''
Write-Host 'Next: run "Process Latest ClipBoost ZIP Now.bat" once to test the push.' -ForegroundColor Cyan
Write-Host ''
