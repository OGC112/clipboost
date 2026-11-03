param(
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
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
    published = @($p.published | Where-Object { $null -ne $_ }).Count
    blocked = @($p.blocked | Where-Object { $null -ne $_ }).Count
  }
}
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Write-Host 'ClipBoost continuous worker is already running.'; return }
  if (Test-Path -LiteralPath $stopPath) {
    Write-Host "Stop flag exists at $stopPath. Remove it before starting the worker."
    return
  }
  if ($PauseMinutes -lt 1) { throw 'PauseMinutes must be at least 1.' }
  $consecutiveFailures = 0
  $consecutiveQuotaFailures = 0
  $consecutiveNoChange = 0
  Write-Host "ClipBoost continuous worker started. No daily cycle cap; pause $PauseMinutes minutes between tasks."
  while (-not (Test-Path -LiteralPath $stopPath)) {
    if (Test-Path -LiteralPath $workspace) {
      $dirty = @(& git -C $workspace status --porcelain)
      if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) {
        Write-Warning 'Agent workspace has changes requiring review. Stopping worker to preserve them.'
        break
      }
    }
    $before = Get-ProgressCounts
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $cycleStarted = Get-Date
    Write-Host "Starting agent cycle at $stamp"
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -RepoPath $RepoPath
    $code = $LASTEXITCODE
    if ($code -ne 0) {
      # Codex errors are recorded by run.ps1's transcript. Do not mistake
      # model capacity or quota exhaustion for a permanent technical failure.
      $logText = ''
      $lastLog = Get-ChildItem -LiteralPath $logDir -Filter 'run-*.log' -File |
        Where-Object { $_.LastWriteTime -ge $cycleStarted.AddMinutes(-1) } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($lastLog) {
        try { $logText = Get-Content -LiteralPath $lastLog.FullName -Raw -ErrorAction Stop }
        catch { Write-Warning "Cannot read agent transcript: $($_.Exception.Message)" }
      }
      if ($logText -match '(?i)(usage limit|rate limit|quota (exceeded|reached|exhausted)|credits exhausted|insufficient credits|out of credits|too many requests|http 429|error 429)') {
        $consecutiveQuotaFailures++
        $consecutiveFailures = 0
        $waitSeconds = if ($logText -match '(?i)(weekly|week limit|7.day)') { 86400 }
          elseif ($consecutiveQuotaFailures -ge 2) { 86400 }
          else { 18900 }
        Write-Warning "Codex usage quota/rate limit detected. Pausing $([int]($waitSeconds / 60)) minutes; no credit purchases."
        if (-not (Wait-Interruptibly $waitSeconds)) { break }
        continue
      }
      if ($logText -match '(?i)(selected model is at capacity|model is at capacity|model overloaded|server overloaded)') {
        $consecutiveFailures = 0
        Write-Warning 'Codex model temporarily at capacity. Retrying after 30 minutes.'
        if (-not (Wait-Interruptibly 1800)) { break }
        continue
      }
      $consecutiveFailures++
      Write-Warning "Agent cycle failed (exit $code); technical failure $consecutiveFailures of 2."
      if ($consecutiveFailures -ge 2) {
        Write-Warning 'Two consecutive technical failures. Stopping for manual review.'
        break
      }
      Write-Host 'Waiting 60 minutes before a single retry.'
      if (-not (Wait-Interruptibly 3600)) { break }
      continue
    }
    $consecutiveFailures = 0
    $consecutiveQuotaFailures = 0
    $after = Get-ProgressCounts
    if ($after.published -gt $before.published) {
      $consecutiveNoChange = 0
      Write-Host 'Task published successfully; continuing after cooldown.'
      $wait = $PauseMinutes * 60
    } elseif ($after.blocked -gt $before.blocked) {
      $consecutiveNoChange++
      if ($consecutiveNoChange -ge 5) {
        Write-Host 'Five consecutive investigations yielded no changes. Cooling down for 4 hours before trying new focus areas.'
        $wait = 14400
        $consecutiveNoChange = 0
      } else {
        Write-Host 'No changes; rotating to the next improvement focus after cooldown.'
        $wait = $PauseMinutes * 60
      }
    } else {
      Write-Host 'No work published this cycle. Rechecking in 60 minutes.'
      $wait = 3600
    }
    if (-not (Wait-Interruptibly $wait)) { break }
  }
} finally {
  Write-Host 'ClipBoost continuous worker stopped. Check logs and task status if needed.'
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
