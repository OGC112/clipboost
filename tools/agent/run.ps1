param([string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)
$ErrorActionPreference = 'Stop'
$homeDir = Join-Path $env:LOCALAPPDATA 'ClipBoostAgent'
$workspace = Join-Path $homeDir 'workspace'
$logDir = Join-Path $homeDir 'logs'
$progressPath = Join-Path $homeDir 'progress.json'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $logDir "report-$stamp.md"
$mutex = New-Object System.Threading.Mutex($false, 'Local\ClipBoostAgentRunner')
$locked = $false
$transcribing = $false
function Run([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Program exited with code $LASTEXITCODE" }
}
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { Write-Host 'ClipBoost Agent already running; skipping.'; return }
  Start-Transcript -Path (Join-Path $logDir "run-$stamp.log") | Out-Null
  $transcribing = $true
  $RepoPath = (Resolve-Path $RepoPath).Path
  foreach ($command in @('git', 'npm.cmd', 'codex')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Missing: $command. See tools/agent/README.md" }
  }
  $remote = (& git -C $RepoPath remote get-url origin).Trim()
  if ($LASTEXITCODE -ne 0 -or $remote -notmatch '(?i)OGC112/clipboost(\.git)?$') {
    throw 'RepoPath must point to a clone of OGC112/clipboost.'
  }
  Run 'codex' @('login', 'status')
  Run 'git' @('-C', $RepoPath, 'fetch', '--quiet', 'origin', 'main')
  if (-not (Test-Path $workspace)) {
    Run 'git' @('-C', $RepoPath, 'worktree', 'add', '--detach', $workspace, 'origin/main')
  }
  $dirty = @(& git -C $workspace status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw 'Agent workspace is not a valid Git worktree.' }
  if ($dirty.Count -gt 0) { throw "Uncommitted agent changes need review: $workspace" }
  $backlogPath = Join-Path $PSScriptRoot 'backlog.json'
  $backlog = Get-Content -LiteralPath $backlogPath -Raw | ConvertFrom-Json
  if (-not $backlog.tasks) { throw 'Backlog is empty or invalid.' }
  if (Test-Path $progressPath) {
    $progress = Get-Content -LiteralPath $progressPath -Raw | ConvertFrom-Json
  } else {
    $progress = [pscustomobject]@{ published = @(); blocked = @() }
  }
  $publishedIds = @($progress.published | ForEach-Object { $_.id })
  $blockedIds = @($progress.blocked | ForEach-Object { $_.id })
  $task = $backlog.tasks | Sort-Object priority | Where-Object {
    $_.id -notin $publishedIds -and $_.id -notin $blockedIds
  } | Select-Object -First 1
  if (-not $task) { Write-Host 'No pending tasks. Review backlog or progress.json before adding more.'; return }
  Write-Host ("Selected task: {0} (priority {1}) - {2}" -f $task.id, $task.priority, $task.title)
  $branch = 'agent/' + $task.id.ToLowerInvariant() + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  Run 'git' @('-C', $workspace, 'switch', '-c', $branch, 'origin/main')
  $instructions = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'task.md') -Raw) +
    "`nASSIGNED TASK: $($task.id) - $($task.title)`n$($task.instructions)`n" +
    "Work ONLY on this assigned task. If no safe change is possible, make no changes and explain why."
  Write-Host "Agent branch: $branch"
  Run 'codex' @('-c', 'windows.sandbox=mxc', 'exec', '--cd', $workspace, '--sandbox', 'workspace-write', '--output-last-message', $report, $instructions)
  $changes = @(& git -C $workspace status --porcelain)
  if ($changes.Count -eq 0) {
    $progress.blocked = @($progress.blocked) + @([pscustomobject]@{
      id = $task.id; reason = 'No code changes; inspect agent report'; report = $report
      recorded_at = (Get-Date -Format 'o')
    })
    $progress | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $progressPath -Encoding UTF8
    Write-Host "No changes; task $($task.id) marked blocked for review. Report: $report"
    return
  }
  Push-Location $workspace
  try {
    if (-not (Test-Path 'node_modules')) { Run 'npm.cmd' @('ci', '--no-audit', '--no-fund') }
    Run 'npm.cmd' @('test')
    Run 'npm.cmd' @('run', 'build')
  } finally { Pop-Location }
  Run 'git' @('-C', $workspace, 'add', '-A')
  $staged = @(& git -C $workspace diff --cached --name-only)
  if ($staged.Count -eq 0) { Write-Host 'No staged changes.'; return }
  if ($staged.Count -gt 12) { throw "Too many changed files ($($staged.Count)); review manually." }
  if (@($staged | Where-Object { $_ -match '(^|/)(\.env|auth\.json|.*\.pem|.*\.key)$' }).Count -gt 0) {
    throw 'Possible secret file staged; review manually.'
  }
  Run 'git' @('-C', $workspace, 'commit', '-m', ("perf({0}): autonomous ClipBoost improvement" -f $task.id))
  Run 'git' @('-C', $workspace, 'push', '-u', 'origin', $branch)
  $progress.published = @($progress.published) + @([pscustomobject]@{
    id = $task.id; branch = $branch; report = $report; recorded_at = (Get-Date -Format 'o')
  })
  $progress | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $progressPath -Encoding UTF8
  Write-Host "Task $($task.id) published to branch $branch. main unchanged."
  if (Get-Command 'gh' -ErrorAction SilentlyContinue) {
    & gh pr create --repo OGC112/clipboost --base main --head $branch --draft --title "Agent $($task.id): $($task.title)" --body 'Automated local Codex improvement. npm test and npm run build passed. Review and validate Windows video preview before merging.'
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Branch pushed but PR creation failed.' }
  } else { Write-Host "Create a GitHub PR manually for: $branch" }
  Write-Host "Report: $report"
} catch {
  Write-Warning $_.Exception.Message
  throw
} finally {
  if ($transcribing) { Stop-Transcript | Out-Null }
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
