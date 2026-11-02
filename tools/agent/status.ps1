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
if ($progress.PSObject.Properties['last_discovery_at']) {
  Write-Host "Last discovery attempt: $($progress.last_discovery_at)"
}
Write-Host "Local progress: $progressPath"
Write-Host 'Published means a branch was pushed, NOT merged or Windows-validated.'
