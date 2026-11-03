# ClipBoost local development agent (Windows)

The agent runs only on this Windows PC when the user is logged in. It uses Codex CLI and an isolated Git worktree in %LOCALAPPDATA%\ClipBoostAgent. It never modifies the regular checkout or merges to main.

## One-time setup

1. Install Codex CLI: npm install -g @openai/codex
2. Run codex login and sign in with ChatGPT; verify with codex login status. Use Codex CLI 0.162.0 or newer for Windows MXC support.
3. Verify the Windows sandbox: `codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK` (expected output: `MXC_OK`).
4. Open PowerShell in your local ClipBoost Git repository.
5. Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\install.ps1
6. Test a single cycle with `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\run.ps1` or test the continuous worker with `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\worker.ps1 -PauseMinutes 10`.

## Prioritized task queue

- Edit `tools/agent/backlog.json` on the agent setup branch to add or reprioritize tasks. Lower numeric priority runs first.
- Each cycle selects the highest-priority pending task and passes its specific instructions to Codex. The persistent worker chains cycles, one task at a time.
- View the queue with `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\status.ps1`.
- Progress lives locally in `%LOCALAPPDATA%\ClipBoostAgent\progress.json`; it does not modify the main repository. A task is marked `published` only after its branch is successfully pushed, NOT after a PR is merged or Windows-tested.
- If Codex makes no changes, the task is marked `blocked` to avoid repeated token consumption. Review the log/report and edit the local progress file to retry. If tests fail, the worktree remains dirty and future cycles stop until reviewed.
- The queue is refreshed by manually fetching and switching the separate setup worktree to `origin/chore/local-clipboost-agent`. The scheduled task does not automatically pull unreviewed changes to its own runner.

## Autonomous code discovery

The agent now runs **continuous discovery without a 24-hour gate**. Once the predefined backlog is exhausted, every new cycle rotates among **UI/UX**, **tool functionality**, **performance**, **architecture/maintainability**, and **video preview/export**. Each cycle inspects real code, selects one bounded improvement, runs checks, and publishes a reviewable branch if successful. A no-change result advances to the next focus area; five consecutive no-change cycles trigger a four-hour cooldown to avoid wasting Codex quota.

Recent agent reports are fed into later investigations as bounded context, helping the agent retain candidate improvements. Progress and focus rotation are recorded in `%LOCALAPPDATA%\ClipBoostAgent\progress.json`. No fixed list is required after the original backlog.

**Branch continuity:** When possible, the next improvement starts from the most recently published agent branch rather than old `main`. This preserves recent agent work but produces **stacked branches** that require review and integration in dependency order. Older independent branches are not automatically combined, and none of these changes are installed in the local ClipBoost app or merged into `main` by the agent.

This is static/code-level discovery, not a live performance profiler. `npm test` and `npm run build` are required before publishing, but Windows GUI responsiveness and FFmpeg export still require manual validation.

## Schedule

The Codex invocation explicitly selects `windows.sandbox=mxc` and `workspace-write` to allow scoped edits in the dedicated worktree. If a run is blocked, disable the scheduled task and inspect the logs before retrying.

The scheduled task launches `tools/agent/worker.ps1` at Windows logon and daily at 12:00 (fallback). It keeps running while the user session is active; a named mutex prevents multiple workers, and the Task Scheduler execution-time limit is disabled.

The worker has **no daily cycle cap**. It runs tasks sequentially with a **10-minute cooldown** after a published or blocked task. If repeated investigations yield no changes, it cools down for four hours after five such cycles. It cannot read the exact remaining ChatGPT/Codex quota, but when the Codex transcript reports a usage or rate limit, it pauses for about 5 hours 15 minutes, or 24 hours after repeated/weekly limit errors, and retries without buying credits. Temporary model-capacity errors wait 30 minutes. Two consecutive other technical failures stop the worker for review. Dirty Git workspaces also stop it so partially completed changes are preserved.

The worker can continue while Windows is awake, the user is logged in, network is available, and Codex allows requests. The scheduled task is not a Windows service and does not prevent the PC from sleeping. There is **no automatic purchase of credits in this script**; keep ChatGPT account auto-recharge disabled separately if you do not want charges.

Manual continuous start: `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\worker.ps1`.
Run the scheduled worker now: `Start-ScheduledTask -TaskName 'ClipBoost Local Agent'`.
Stop scheduled worker: `Stop-ScheduledTask -TaskName 'ClipBoost Local Agent'`; to prevent restart, also `Disable-ScheduledTask -TaskName 'ClipBoost Local Agent'`. For a graceful stop of the worker, create `%LOCALAPPDATA%\ClipBoostAgent\stop.flag` and remove it before starting again.

GitHub Actions runners are not required.

## Automatic change summaries

Running install.ps1 also registers two **separate Windows Scheduled Tasks** under the current signed-in user:

- ClipBoost Agent Daily Report: every day at 20:00 local PC time.
- ClipBoost Agent Weekly Report: every Sunday at 20:10 local PC time.

They run without Codex or API calls, reading only the local progress history and Codex reports. Reports are stored in `%LOCALAPPDATA%\ClipBoostAgent\reports` as dated Markdown files, plus `latest-daily.md` and `latest-weekly.md` for quick access. They show published GitHub branches, blocked investigations, report excerpts, and follow-up actions. A published branch is not automatically merged or Windows-tested.

After fetching a new agent setup revision, rerun install.ps1 to register/update these scheduled tasks. Generate a report immediately:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\report.ps1 -Period Daily`

Generate a weekly report:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\report.ps1 -Period Weekly`

Open the reports folder: `explorer "$env:LOCALAPPDATA\ClipBoostAgent\reports"`

These tasks only run when Windows can run scheduled tasks in the logged-in session. If the PC is off or sleeping at the scheduled time, Task Scheduler's StartWhenAvailable setting requests a delayed run when possible. The report covers the calendar day/week of its actual execution. No email or ChatGPT notification is sent.

## Output

- Workspace: %LOCALAPPDATA%\ClipBoostAgent\workspace
- Logs and reports: %LOCALAPPDATA%\ClipBoostAgent\logs
- Passing runs push an `agent/cb-*-YYYYMMDD-HHMMSS` or `agent/auto-*-YYYYMMDD-HHMMSS` branch to GitHub.
- If GitHub CLI (gh) is installed and authenticated, the script opens a draft PR; otherwise create a PR manually.
- Failed tests or build prevent publication. The worktree is left intact for review.
- No automatic merge to main.

## Recover after a browser-profile staging failure

If an agent run stages many files from `.edge-resize-check/`, first disable the scheduled task. In the isolated agent workspace only, use `git restore --staged -- .` to unstage without discarding changes. Move `.edge-resize-check` to a dated folder outside the workspace for review (do not delete it blindly), then inspect `git status --short`. Keep and review legitimate source edits before restarting; do not use `git reset --hard` or `git clean -fdx`. This agent now stages only allowlisted source paths and excludes hidden browser profile directories.

## Stop

Run in PowerShell: Stop-ScheduledTask -TaskName 'ClipBoost Local Agent'; Unregister-ScheduledTask -TaskName 'ClipBoost Local Agent' -Confirm:$false. To remove the reporting schedules too: `Unregister-ScheduledTask -TaskName 'ClipBoost Agent Daily Report' -Confirm:$false; Unregister-ScheduledTask -TaskName 'ClipBoost Agent Weekly Report' -Confirm:$false`.

## Important

Codex requires internet and an authenticated account, subject to usage limits. Review changes and test real Windows video previews before merging. Run under your normal Windows user account, not as Administrator.
