# ClipBoost local development agent (Windows)

The agent runs only on this Windows PC when the user is logged in. It uses Codex CLI and an isolated Git worktree in %LOCALAPPDATA%\ClipBoostAgent. It never modifies the regular checkout or merges to main.

## One-time setup

1. Install Codex CLI: npm install -g @openai/codex
2. Run codex login and sign in with ChatGPT; verify with codex login status. Use Codex CLI 0.162.0 or newer for Windows MXC support.
3. Verify the Windows sandbox: `codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK` (expected output: `MXC_OK`).
4. Open PowerShell in your local ClipBoost Git repository.
5. Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\install.ps1
6. Test a single cycle with `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\run.ps1` or test the continuous worker with `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\worker.ps1 -MaxCyclesPerDay 2`.

## Prioritized task queue

- Edit `tools/agent/backlog.json` on the agent setup branch to add or reprioritize tasks. Lower numeric priority runs first.
- Each cycle selects the highest-priority pending task and passes its specific instructions to Codex. The persistent worker chains cycles, one task at a time.
- View the queue with `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\status.ps1`.
- Progress lives locally in `%LOCALAPPDATA%\ClipBoostAgent\progress.json`; it does not modify the main repository. A task is marked `published` only after its branch is successfully pushed, NOT after a PR is merged or Windows-tested.
- If Codex makes no changes, the task is marked `blocked` to avoid repeated token consumption. Review the log/report and edit the local progress file to retry. If tests fail, the worktree remains dirty and future cycles stop until reviewed.
- The queue is refreshed by manually fetching and switching the separate setup worktree to `origin/chore/local-clipboost-agent`. The scheduled task does not automatically pull unreviewed changes to its own runner.

## Autonomous code discovery

The agent is not limited to the predefined queue. After three published tasks since its last discovery, or when the queue is exhausted, it may run a self-directed discovery cycle (no more than once every 24 hours). It reads `tools/agent/project-map.md` and `tools/agent/discovery.md`, traces relevant code, identifies concrete candidate issues, and implements at most one low-risk fix with validation. If it finds no defensible issue, it makes no changes. It logs its findings and does not automatically merge.

This is static/code-level discovery, not a live performance profiler. `npm test` and `npm run build` are required before publishing, but Windows GUI responsiveness and FFmpeg export still require manual validation.

## Schedule

The Codex invocation explicitly selects `windows.sandbox=mxc` and `workspace-write` to allow scoped edits in the dedicated worktree. If a run is blocked, disable the scheduled task and inspect the logs before retrying.

The scheduled task launches `tools/agent/worker.ps1` at Windows logon and daily at 12:00 (fallback). It keeps running while the user session is active; a named mutex prevents multiple workers, and the Task Scheduler execution-time limit is disabled.

The worker runs up to **6 cycles per day** with a **10-minute cooldown** after each published or blocked task. When no task is available it checks again in an hour; after reaching the daily cap it waits until the next day. It does not purchase credits. On a failure it waits 60 minutes before one retry, then stops after two consecutive failures to avoid repeatedly consuming quota. Dirty Git workspaces stop the worker for manual review. These are conservative safety limits, not a guarantee of uninterrupted work during model capacity or quota outages.

Manual continuous start: `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\worker.ps1`.
Run the scheduled worker now: `Start-ScheduledTask -TaskName 'ClipBoost Local Agent'`.
Stop scheduled worker: `Stop-ScheduledTask -TaskName 'ClipBoost Local Agent'`; to prevent restart, also `Disable-ScheduledTask -TaskName 'ClipBoost Local Agent'`. For a graceful stop of the worker, create `%LOCALAPPDATA%\ClipBoostAgent\stop.flag` and remove it before starting again.

GitHub Actions runners are not required.

## Output

- Workspace: %LOCALAPPDATA%\ClipBoostAgent\workspace
- Logs and reports: %LOCALAPPDATA%\ClipBoostAgent\logs
- Passing runs push an `agent/cb-*-YYYYMMDD-HHMMSS` branch to GitHub.
- If GitHub CLI (gh) is installed and authenticated, the script opens a draft PR; otherwise create a PR manually.
- Failed tests or build prevent publication. The worktree is left intact for review.
- No automatic merge to main.

## Recover after a browser-profile staging failure

If an agent run stages many files from `.edge-resize-check/`, first disable the scheduled task. In the isolated agent workspace only, use `git restore --staged -- .` to unstage without discarding changes. Move `.edge-resize-check` to a dated folder outside the workspace for review (do not delete it blindly), then inspect `git status --short`. Keep and review legitimate source edits before restarting; do not use `git reset --hard` or `git clean -fdx`. This agent now stages only allowlisted source paths and excludes hidden browser profile directories.

## Stop

Run in PowerShell: Stop-ScheduledTask -TaskName 'ClipBoost Local Agent'; Unregister-ScheduledTask -TaskName 'ClipBoost Local Agent' -Confirm:$false

## Important

Codex requires internet and an authenticated account, subject to usage limits. Review changes and test real Windows video previews before merging. Run under your normal Windows user account, not as Administrator.
