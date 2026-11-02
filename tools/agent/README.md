# ClipBoost local development agent (Windows)

The agent runs only on this Windows PC when the user is logged in. It uses Codex CLI and an isolated Git worktree in %LOCALAPPDATA%\ClipBoostAgent. It never modifies the regular checkout or merges to main.

## One-time setup

1. Install Codex CLI: npm install -g @openai/codex
2. Run codex login and sign in with ChatGPT; verify with codex login status.
3. Open PowerShell in your local ClipBoost Git repository.
4. Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\install.ps1
5. Test once: powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\agent\run.ps1

## Schedule

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
