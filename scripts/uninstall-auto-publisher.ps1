$ErrorActionPreference = "SilentlyContinue"

$StateDir = Join-Path $env:LOCALAPPDATA "ClipBoostAutoPublisher"
$PidFile = Join-Path $StateDir "watcher.pid"

if (Test-Path $PidFile) {
    $pidValue = Get-Content $PidFile | Select-Object -First 1
    if ($pidValue -match '^\d+$') {
        Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
    }
}

Remove-Item $PidFile -Force -ErrorAction SilentlyContinue

$Startup = [Environment]::GetFolderPath("Startup")
Remove-Item (Join-Path $Startup "ClipBoost Auto Publisher.cmd") -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "ClipBoost Auto Publisher disabled." -ForegroundColor Yellow
Write-Host ""
