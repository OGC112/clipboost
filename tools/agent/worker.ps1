param(
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [int]$MaxCyclesPerDay = 6,
  [int]$PauseMinutes = 10
)
$ErrorActionPreference = 'Stop'
$agentHome = Join-Path $env:LOCALAPPDATA 'ClipBoostAgent'
$logDir = Join-Path $agentHome 'logs'
$workspace = Join-Path $agentHome 'workspace'
$progressPath = Join-Path $agentHome 'progress.json'
$stopPath = Join-Path $agentHome 'stop.flag'
$runner = Join-Path $PSScriptRoot 'run.ps1'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$mutex = New-Object System.Threading.Mutex($false, 'Local\ClipBoostAgentContinuousWorker')
$locked = $false

function Wait-Interruptibly([int]$Seconds) {
  $remaining = [Math]::Max(0, $Seconds)
  while ($remaining -gt 0) {
    if (Test-Path -LiteralPath $stopPath) { return $false }
    $step = [Math]::Min(30, $remaining)
    Start-Sleep -Seconds $step
    $remaining -= $step
  }
  return (-not (Test-Path -LiteralPath $stopPath))
}
function Get-ProgressCounts {
  if (-not (Test-Path -LiteralPath $progressPath)) {
    return [pscustomobject]@{ published = 0; blocked = 0 }
  }
  $p = Get-Content -LiteralPath $progressPath -Raw | ConvertFrom-Json
  return [pscustomobject]@{
    published = @($p.published).Count
    blocked = @($p.blocked).Count
  }
}
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Write-Host 'ClipBoost continuous worker is already running.'; return }
  if (Test-Path -LiteralPath $stopPath) {
    Write-Host "Stop flag exists at $stopPath. Remove it before starting the worker."
    return
  }
  if ($MaxCyclesPerDay -lt 1 -or $MaxCyclesPerDay -gt 24) { throw 'MaxCyclesPerDay must be 1..24.' }
  if ($PauseMinutes -lt 1) { throw 'PauseMinutes must be at least 1.' }
  $day = (Get-Date).Date
  $cyclesToday = 0
  $consecutiveFailures = 0
  Write-Host "ClipBoost continuous worker started. Up to $MaxCyclesPerDay cycles/day, pause $PauseMinutes minutes."
  while (-not (Test-Path -LiteralPath $stopPath)) {
    $now = Get-Date
    if ($now.Date -ne $day) {
      $day = $now.Date
      $cyclesToday = 0
      $consecutiveFailures = 0
    }
    if ($cyclesToday -ge $MaxCyclesPerDay) {
      $seconds = [int][Math]::Ceiling((($day.AddDays(1)) - $now).TotalSeconds)
      Write-Host "Daily cycle cap reached. Waiting until next day."
      if (-not (Wait-Interruptibly ([Math]::Max(60, $seconds)))) { break }
      continue
    }
    if (Test-Path -LiteralPath $workspace) {
      $dirty = @(& git -C $workspace status --porcelain)
      if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) {
        Write-Warning 'Agent workspace has changes requiring review. Stopping worker to preserve them.'
        break
      }
    }
    $before = Get-ProgressCounts
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Write-Host "Starting agent cycle at $stamp"
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -RepoPath $RepoPath
    $code = $LASTEXITCODE
    $cyclesToday++
    if ($code -ne 0) {
      $consecutiveFailures++
      Write-Warning "Agent cycle failed (exit $code); failure $consecutiveFailures of 2."
      if ($consecutiveFailures -ge 2) {
        Write-Warning 'Two consecutive failures. Stopping to avoid repeated quota or environment errors.'
        break
      }
      Write-Host 'Waiting 60 minutes before a single retry (no automatic purchases).'
      if (-not (Wait-Interruptibly 3600)) { break }
      continue
    }
    $consecutiveFailures = 0
    $after = Get-ProgressCounts
    if ($after.published -gt $before.published) {
      Write-Host 'Task published successfully; continuing after cooldown.'
      $wait = $PauseMinutes * 60
    } elseif ($after.blocked -gt $before.blocked) {
      Write-Host 'Task blocked with no changes; moving to the next task after cooldown.'
      $wait = $PauseMinutes * 60
    } else {
      Write-Host 'No eligible task right now. Rechecking in 60 minutes.'
      $wait = 3600
    }
    if (-not (Wait-Interruptibly $wait)) { break }
  }
} finally {
  Write-Host 'ClipBoost continuous worker stopped. Check logs and task status if needed.'
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
