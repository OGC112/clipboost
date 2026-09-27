$StateDir = Join-Path $env:LOCALAPPDATA 'ClipBoostAutoPublisher'
$StatusFile = Join-Path $StateDir 'status.json'
$LogFile = Join-Path $StateDir 'auto-publisher.log'
$PidFile = Join-Path $StateDir 'watcher.pid'
Write-Host ''
Write-Host 'ClipBoost Auto Publisher v1.2' -ForegroundColor Cyan
Write-Host '==============================' -ForegroundColor Cyan
$running = $false
if (Test-Path $PidFile) {
    $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pidValue -match '^\d+$') {
        if (Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue) { $running = $true }
    }
}
if ($running) { Write-Host 'Watcher: RUNNING' -ForegroundColor Green }
else { Write-Host 'Watcher: NOT RUNNING' -ForegroundColor Red }
if (Test-Path $StatusFile) {
    try {
        $s = Get-Content $StatusFile -Raw | ConvertFrom-Json
        Write-Host "Repo:      $($s.repo)"
        Write-Host "Downloads: $($s.downloads)"
        Write-Host "State:     $($s.state)"
        Write-Host "Last:      $($s.last_message)"
        Write-Host "Updated:   $($s.updated_at)"
    } catch {}
}
Write-Host ''
Write-Host 'Last log lines:'
if (Test-Path $LogFile) { Get-Content $LogFile -Tail 25 }
else { Write-Host '(No log file yet)' }
Write-Host ''
