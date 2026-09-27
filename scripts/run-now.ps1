param([string]$RepoRoot = "")
$ErrorActionPreference = "Stop"
if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $PSScriptRoot }
$RepoRoot = (Resolve-Path $RepoRoot).Path
$Watcher = Join-Path $RepoRoot "scripts\watch-downloads.ps1"
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile","-ExecutionPolicy","Bypass",
    "-File","`"$Watcher`"",
    "-RepoRoot","`"$RepoRoot`""
)
Write-Host "ClipBoost Auto Publisher started."
