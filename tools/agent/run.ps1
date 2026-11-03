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
  # When the curated backlog is exhausted, keep discovering new work.
  # Rotate focus areas so one failed investigation does not stall the agent.
  if (-not $task) {
    $focusAreas = @(
      [pscustomobject]@{ name = 'UI-UX'; scope = 'Layout, navigation, accessibility, responsive controls, visual clarity and usability' },
      [pscustomobject]@{ name = 'TOOLS'; scope = 'Broken or confusing tool interactions, import, editor controls, state synchronization and errors' },
      [pscustomobject]@{ name = 'PERFORMANCE'; scope = 'Playback smoothness, unnecessary renders, memory use, background tasks and startup' },
      [pscustomobject]@{ name = 'ARCHITECTURE'; scope = 'Maintainability, testability, duplicate code, module boundaries and safe incremental refactors' },
      [pscustomobject]@{ name = 'VIDEO'; scope = 'Preview/export parity, captions, crop, FFmpeg progress and full-video workflows' }
    )
    $history = @()
    if ($progress.PSObject.Properties['discovery_runs']) {
      $history = @($progress.discovery_runs | Where-Object { $null -ne $_ })
    }
    $focus = $focusAreas[$history.Count % $focusAreas.Count]
    $id = 'AUTO-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    $task = [pscustomobject]@{
      id = $id
      priority = 99
      title = "Continuous discovery: $($focus.name)"
      instructions = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'discovery.md') -Raw) +
        "`nTHIS CYCLE'S FOCUS: $($focus.name) - $($focus.scope)`n"
    }
    $history += [pscustomobject]@{
      id = $id; focus = $focus.name; started_at = (Get-Date -Format 'o')
    }
    $progress | Add-Member -NotePropertyName discovery_runs -NotePropertyValue @($history) -Force
    $progress | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $progressPath -Encoding UTF8
    Write-Host "Autonomous improvement cycle selected: $($focus.name)"
  }
  Write-Host ("Selected task: {0} (priority {1}) - {2}" -f $task.id, $task.priority, $task.title)
  $branch = 'agent/' + $task.id.ToLowerInvariant() + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
  # Build on the last successfully published agent branch, when it is still
  # based on current main. This avoids rediscovering/fixing the same issue on
  # an old main snapshot. The resulting branches are stacked and need review.
  $baseRef = 'origin/main'
  $lastPublished = @($progress.published | Where-Object { $_ -and $_.branch -like 'agent/*' } | Select-Object -Last 1)
  if ($lastPublished.Count -gt 0) {
    $priorBranch = [string]$lastPublished[0].branch
    if ($priorBranch -notmatch '[^a-zA-Z0-9/-]') {
      & git -C $workspace fetch --quiet origin $priorBranch
      if ($LASTEXITCODE -eq 0) {
        & git -C $workspace merge-base --is-ancestor origin/main ('origin/' + $priorBranch)
        if ($LASTEXITCODE -eq 0) {
          $baseRef = 'origin/' + $priorBranch
        } else {
          Write-Warning 'Prior agent branch does not include current main; using main instead.'
        }
      } else {
        Write-Warning 'Prior agent branch unavailable; using main instead.'
      }
    }
  }
  Write-Host "Agent baseline: $baseRef"
  Run 'git' @('-C', $workspace, 'switch', '-c', $branch, $baseRef)
  $recentPublished = @($progress.published | Select-Object -Last 8 | ForEach-Object { "$($_.id): $($_.branch)" }) -join "`n"
  $projectMap = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'project-map.md') -Raw
  $instructions = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'task.md') -Raw) +
    "`nPROJECT MAP (orientation only; verify in current source):`n$projectMap`n" +
    "`nASSIGNED TASK: $($task.id) - $($task.title)`n$($task.instructions)`n" +
    "`nRECENTLY PUBLISHED AGENT BRANCHES (avoid repeating these changes):`n$recentPublished`n" +
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
  # Only stage source-code paths; never recursively stage browser profiles, caches,
  # diagnostics, credentials, or arbitrary new files from the workspace root.
  $allowedRoots = @('src', 'server', 'desktop', 'public', 'scripts', 'tests')
  $allowedRootFiles = @('index.html')
  $candidates = @(& git -C $workspace ls-files --modified --deleted --others --exclude-standard)
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect changed files.' }
  $safe = @($candidates | Where-Object {
    $p = $_ -replace '\\', '/'
    $parts = $p.Split('/')
    $rootAllowed = ($parts.Count -gt 1 -and $parts[0] -in $allowedRoots) -or
      ($parts.Count -eq 1 -and $p -in $allowedRootFiles)
    $rootAllowed -and
      ($p -notmatch '(?i)(^|/)(\.[^/]+|node_modules|dist|release|storage|cache|tmp|temp)(/|$)') -and
      ($p -notmatch '(?i)(^|/)(\.env.*|auth\.json|.*\.(pem|key|p12|pfx|db|sqlite|log)|cookies|local storage|session storage)(/|$)') -and
      ($p -match '(?i)[.](js|cjs|mjs|jsx|ts|tsx|css|scss|html|json|md)$')
  })
  $excluded = @($candidates | Where-Object { $_ -notin $safe })
  if ($excluded.Count -gt 0) {
    Write-Warning ('Not staging {0} non-source files. Examples: {1}' -f $excluded.Count, (($excluded | Select-Object -First 5) -join ', '))
  }
  if ($safe.Count -eq 0) { throw 'No safe source-code changes to publish; inspect workspace.' }
  if ($safe.Count -gt 12) { throw "Too many source files ($($safe.Count)); review manually." }
  foreach ($file in $safe) { Run 'git' @('-C', $workspace, 'add', '--', $file) }
  $staged = @(& git -C $workspace diff --cached --name-only)
  if ($staged.Count -eq 0) { throw 'No staged changes.' }
  if ($staged.Count -gt 12 -or @($staged | Where-Object { $_ -notin $safe }).Count -gt 0) {
    throw 'Unexpected staged files; review manually.'
  }
  Run 'git' @('-C', $workspace, 'commit', '-m', ("improve({0}): autonomous ClipBoost improvement" -f $task.id))
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
 } | Select-Object -Last 1)
  if ($lastPublished.Count -gt 0) {
    $priorBranch = [string]$lastPublished[0].branch
    Run 'git' @('-C', $workspace, 'fetch', '--quiet', 'origin', $priorBranch)
    & git -C $workspace merge-base --is-ancestor origin/main ("origin/" + $priorBranch)
    if ($LASTEXITCODE -eq 0) {
      $baseRef = 'origin/' + $priorBranch
    } else {
      Write-Warning "Prior agent branch no longer includes current main. Starting from main; previous fixes need separate review."
    }
  }
  Write-Host "Agent baseline: $baseRef"
  Run 'git' @('-C', $workspace, 'switch', '-c', $branch, $baseRef)
  $recentPublished = @($progress.published | Select-Object -Last 8 | ForEach-Object { "$($_.id): $($_.branch)" }) -join "`n"
  $projectMap = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'project-map.md') -Raw
  $instructions = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'task.md') -Raw) +
    "`nPROJECT MAP (orientation only; verify in current source):`n$projectMap`n" +
    "`nASSIGNED TASK: $($task.id) - $($task.title)`n$($task.instructions)`n" +
    "`nRECENTLY PUBLISHED AGENT BRANCHES (avoid repeating these changes):`n$recentPublished`n" +
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
  # Only stage source-code paths; never recursively stage browser profiles, caches,
  # diagnostics, credentials, or arbitrary new files from the workspace root.
  $allowedRoots = @('src', 'server', 'desktop', 'public', 'scripts', 'tests')
  $allowedRootFiles = @('index.html')
  $candidates = @(& git -C $workspace ls-files --modified --deleted --others --exclude-standard)
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect changed files.' }
  $safe = @($candidates | Where-Object {
    $p = $_ -replace '\\', '/'
    $parts = $p.Split('/')
    $rootAllowed = ($parts.Count -gt 1 -and $parts[0] -in $allowedRoots) -or
      ($parts.Count -eq 1 -and $p -in $allowedRootFiles)
    $rootAllowed -and
      ($p -notmatch '(?i)(^|/)(\.[^/]+|node_modules|dist|release|storage|cache|tmp|temp)(/|$)') -and
      ($p -notmatch '(?i)(^|/)(\.env.*|auth\.json|.*\.(pem|key|p12|pfx|db|sqlite|log)|cookies|local storage|session storage)(/|$)') -and
      ($p -match '(?i)[.](js|cjs|mjs|jsx|ts|tsx|css|scss|html|json|md)$')
  })
  $excluded = @($candidates | Where-Object { $_ -notin $safe })
  if ($excluded.Count -gt 0) {
    Write-Warning ('Not staging {0} non-source files. Examples: {1}' -f $excluded.Count, (($excluded | Select-Object -First 5) -join ', '))
  }
  if ($safe.Count -eq 0) { throw 'No safe source-code changes to publish; inspect workspace.' }
  if ($safe.Count -gt 12) { throw "Too many source files ($($safe.Count)); review manually." }
  foreach ($file in $safe) { Run 'git' @('-C', $workspace, 'add', '--', $file) }
  $staged = @(& git -C $workspace diff --cached --name-only)
  if ($staged.Count -eq 0) { throw 'No staged changes.' }
  if ($staged.Count -gt 12 -or @($staged | Where-Object { $_ -notin $safe }).Count -gt 0) {
    throw 'Unexpected staged files; review manually.'
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
