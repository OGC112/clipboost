param([string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)
$ErrorActionPreference = 'Stop'
$homeDir = Join-Path $env:LOCALAPPDATA 'ClipBoostAgent'
$workspace = Join-Path $homeDir 'workspace'
$logDir = Join-Path $homeDir 'logs'
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
  $branch = 'agent/performance-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  Run 'git' @('-C', $workspace, 'switch', '-c', $branch, 'origin/main')
  $instructions = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'task.md') -Raw
  Write-Host "Agent branch: $branch"
  Run 'codex' @('exec', '--cd', $workspace, '--sandbox', 'workspace-write', '--output-last-message', $report, $instructions)
  $changes = @(& git -C $workspace status --porcelain)
  if ($changes.Count -eq 0) { Write-Host 'No changes; nothing to publish.'; return }
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
  Run 'git' @('-C', $workspace, 'commit', '-m', 'perf: autonomous ClipBoost improvement')
  Run 'git' @('-C', $workspace, 'push', '-u', 'origin', $branch)
  Write-Host "Branch pushed: $branch. main unchanged."
  if (Get-Command 'gh' -ErrorAction SilentlyContinue) {
    & gh pr create --repo OGC112/clipboost --base main --head $branch --draft --title "Agent: performance improvement ($stamp)" --body 'Automated local Codex improvement. npm test and npm run build passed. Review and validate Windows video preview before merging.'
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
