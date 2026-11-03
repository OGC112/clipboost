$ErrorActionPreference = 'Stop'
$backlogPath = Join-Path $PSScriptRoot 'backlog.json'
$progressPath = Join-Path (Join-Path $env:LOCALAPPDATA 'ClipBoostAgent') 'progress.json'
$backlog = Get-Content -LiteralPath $backlogPath -Raw | ConvertFrom-Json
if (Test-Path $progressPath) {
  $progress = Get-Content -LiteralPath $progressPath -Raw | ConvertFrom-Json
} else {
  $progress = [pscustomobject]@{ published = @(); blocked = @() }
}
$published = @($progress.published | ForEach-Object { $_.id })
$blocked = @($progress.blocked | ForEach-Object { $_.id })
$rows = @($backlog.tasks | Sort-Object priority | ForEach-Object {
  $state = if ($_.id -in $published) { 'Published (review needed)' }
    elseif ($_.id -in $blocked) { 'Blocked (review needed)' }
    else { 'Pending' }
  [pscustomobject]@{ Priority = $_.priority; Id = $_.id; Status = $state; Task = $_.title }
})
$rows | Format-Table -AutoSize -Wrap
$discoveryCount = @($progress.published | Where-Object { $_.id -like 'AUTO-*' }).Count
Write-Host "Autonomous discovery fixes published: $discoveryCount"
$focusAreas = @('UI/UX', 'Tools', 'Performance', 'Architecture', 'Video')
$history = @()
if ($progress.PSObject.Properties['discovery_runs']) {
  $history = @($progress.discovery_runs | Where-Object { $null -ne $_ })
}
Write-Host "Continuous discovery cycles attempted: $($history.Count)"
Write-Host "Next discovery focus: $($focusAreas[$history.Count % $focusAreas.Count])"
if ($history.Count -gt 0) {
  Write-Host "Most recent discovery: $($history[-1].focus) at $($history[-1].started_at)"
}
Write-Host "Local progress: $progressPath"
Write-Host 'Published means a branch was pushed, NOT merged or Windows-validated.'
