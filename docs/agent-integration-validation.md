# ClipBoost agent integration — Windows validation gate

Integration branch: `integration/agent-review-20261104`
Frozen agent snapshot: `9b10c593924716cf1cd2671b8b29e54067e04b64`
Base: `main` at `3b7f174f039427f5f2f61ccdfce84a41b8197a37`

## Scope and limitations

This branch consolidates the *stacked* autonomous agent improvements through the frozen snapshot. It is **not** a released version and must **not** be merged or installed over a working ClipBoost version before review. It does not include separate PR #83 (Windows GPU optimization) or PR #84 (agent setup scripts), which require their own review.

The existing `npm test` command only ran a fixed list of server tests. This branch changes it to run both the existing server suite and `src/*.test.js`, including new editor, preview, campaign and library regressions.

## Automated checks (run on Windows, Node.js installed)

Use a **separate Git worktree** so the autonomous agent and your normal checkout remain untouched. In PowerShell from a clean local ClipBoost clone:

```powershell
git fetch origin integration/agent-review-20261104
git worktree add "D:\ClipBoost\clipboost-integration-review" origin/integration/agent-review-20261104
Set-Location "D:\ClipBoost\clipboost-integration-review"
npm ci --no-audit --no-fund
npm test
npm run build
```

Record exit codes, test totals, failures and the build output. If `npm ci`, `npm test` or `npm run build` fails, **do not merge**. Do not assume an agent's previous `npm test` validated `src/*.test.js`.

## Windows application smoke tests

Launch from the review worktree with `npm run desktop` after automated checks pass. Test with copies of sample media, not irreplaceable projects:

- Import a short video and a long video; confirm preview opens and navigation stays responsive.
- Use **Keep entire video** on a short source; compare source duration, preview duration and exported MP4 duration.
- Drag IN/OUT points on the precision timeline, including rapid changes; confirm the final selected cut and preview agree.
- Enable/disable captions and Hook independently; confirm export matches the preview and Captions Off removes transcript captions.
- Change caption colors, size and placement; compare preview with the exported MP4.
- Enable Crop out Twitch subtitles; confirm stable 9:16 blurred background and no blank/grey preview.
- Switch candidates and regenerate clips while preview is loading; confirm stale responses do not replace newer selections.
- Open/close editor and campaign dialogs with keyboard, including Escape; check focus and button behavior.
- Check creator search, sorting, Twitch/YouTube library content and playback.
- Verify FFmpeg exports produce playable video with sound and that progress/errors are understandable.

## Review before merging

- Review `src/app.js` carefully: it has extensive cumulative changes and remains a high-regression-risk file.
- Confirm the full test suite and Windows smoke tests pass. Check CPU/GPU use and scrolling/playback against `main`.
- Keep PR #83 separate until GPU compatibility is tested on Windows.
- Merge only after approval; do not automatically merge the agent's future stacked branches.
- New agent branches created **after** the frozen snapshot are not included. Rebase/reconcile them separately.

## Status

Automated suite: **not executed by this integration PR author** (no Windows runtime access).
Windows GUI/FFmpeg smoke: **pending**.
Merge authorization: **pending review**.
