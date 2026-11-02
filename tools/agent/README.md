# ClipBoost local development agent (Windows)

The agent runs only on this Windows PC when the user is logged in. It uses Codex CLI and an isolated Git worktree in %LOCALAPPDATA%\ClipBoostAgent. It never modifies the regular checkout or merges to main.

## One-time setup

1. Install Codex CLI: npm install -g @openai/codex
2. Run codex login and sign in with ChatGPT; verify with codex login status. Use Codex CLI 0.162.0 or newer for Windows MXC support.
3. Verify the Windows sandbox: `codex -c windows.sandbox=mxc sandbox --include-managed-config --permission-profile :workspace -- cmd.exe /d /c echo MXC_OK` (expected output: `MXC_OK`).
4. Open PowerShell in your local ClipBoost Git repository.
5. Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\install.ps1
6. Test once: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\run.ps1

## Schedule

The Codex invocation explicitly selects `windows.sandbox=mxc` and `workspace-write` to allow scoped edits in the dedicated worktree. If a run is blocked, disable the scheduled task and inspect the logs before retrying.

Runs at Windows logon and daily at 12:00, only while logged in. A named mutex prevents overlapping runs. GitHub Actions runners are not required.

## Output

- Workspace: %LOCALAPPDATA%\ClipBoostAgent\workspace
- Logs and reports: %LOCALAPPDATA%\ClipBoostAgent\logs
- Passing runs push an agent/performance-* branch to GitHub.
- If GitHub CLI (gh) is installed and authenticated, the script opens a draft PR; otherwise create a PR manually.
- Failed tests or build prevent publication. The worktree is left intact for review.
- No automatic merge to main.

## Stop

Run in PowerShell: Unregister-ScheduledTask -TaskName 'ClipBoost Local Agent' -Confirm:$false

## Important

Codex requires internet and an authenticated account, subject to usage limits. Review changes and test real Windows video previews before merging. Run under your normal Windows user account, not as Administrator.
