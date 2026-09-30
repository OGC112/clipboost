# ClipBoost 21.4.8 — Stuck Project Recovery

## Regression targets

1. Open **Projects** after restarting ClipBoost with an old project whose metadata is still `ingesting` or `analyzing`.
   - After the stale-job grace period, the project must recover automatically.
   - It must no longer remain permanently `In progress`.
   - The row should show `Needs attention`.
2. Delete a project while yt-dlp, FFmpeg or Local AI processing is active.
   - Confirmation should say **Stop & delete**.
   - ClipBoost should stop the project-owned child processes.
   - The project metadata must be removed.
   - A late background task must not recreate the deleted project.
3. Open a recovered project with an already-downloaded source.
   - It should be usable again.
   - Running analysis should clear the interrupted marker.
4. Open a recovered project without a local source.
   - It should return to linked/source-required state and allow a retry.
5. Normal completed (`ready`) projects must still delete normally.
6. Existing exports must remain untouched when deleting a project.
7. Campaigns 21.4.7, Smart YouTube Auth, Projects action-cell layout and silent updater remain unchanged.
