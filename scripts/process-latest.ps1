$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
try {
    $gitRoot = (& git -C $RepoRoot rev-parse --show-toplevel 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -eq 0 -and $gitRoot) { $RepoRoot = $gitRoot }
} catch {}
$Watcher = Join-Path $RepoRoot 'scripts\watch-downloads.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Watcher -RepoRoot $RepoRoot -Once -ForceLatest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
