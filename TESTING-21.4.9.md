# ClipBoost 21.4.9 — Eco AI mode

## What changed
- Added **Eco AI mode** in Settings > Windows behavior (enabled by default).
- Added configurable idle timeout: 2 / 5 / 10 / 20 minutes.
- Renderer activity is reported to the Electron shell with a 10-second throttle.
- When idle and no job is active, ClipBoost asks Ollama which models are loaded and unloads only the configured ClipBoost model if necessary.
- Active analysis/export/download processes are not interrupted by idle mode.
- Full Quit now performs a graceful runtime shutdown, kills ClipBoost-owned child process trees, and unloads the configured Ollama model.
- yt-dlp children are now included in project/runtime process tracking.

## Manual checks
1. Open Settings and confirm Eco AI mode is enabled with 5-minute default.
2. Set timeout to 2 minutes, save, leave ClipBoost untouched and confirm no analysis is running. Ollama model should be released from GPU/RAM after the timeout.
3. Start analysis, then leave ClipBoost untouched. The job should continue and Eco mode must not cancel it.
4. Quit ClipBoost from the tray while a job is running. Confirm Python/FFmpeg/yt-dlp workers disappear.
5. Relaunch ClipBoost and confirm interrupted project recovery still works.
6. Disable Eco AI mode and confirm idle release no longer occurs.
