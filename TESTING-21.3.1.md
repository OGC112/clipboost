# ClipBoost 21.3.1 — Auto Director + Library Refresh Fix

## AI Studio — simplified automatic controls

Expected visible controls:
- Number of clips: Auto / 5 / 10 / 20
- Captions: Auto / Always on / Off
- No manual preset, intensity, caption color/style/size/position, cleanup mode, tracking mode, camera movement, reaction toggle, silence toggle or zoom toggle.

Auto Director should decide per clip using scene activity, speech density, detected stutters/fillers, source aspect ratio, title/context hints and local face tracking.

Validation:
1. Talking-head/podcast clip -> calmer motion, clean captions, minimal zoom.
2. Gaming/reaction clip -> more dynamic profile when footage is not already visually busy.
3. Visually busy clip -> zooms reduced/disabled.
4. Existing vertical source -> no unnecessary 9:16 crop.
5. Two meaningful faces -> tracking may automatically use duo/split behavior.
6. Stutters/fillers -> speech removal only when detected cleanup is limited/safe; otherwise only captions are cleaned.
7. Preview and final export use the same Auto Director logic.

## Library refresh

1. Library > YouTube > Refresh YouTube.
2. Button changes to `Refreshing…`.
3. All followed YouTube creators are refreshed.
4. A success banner reports the number refreshed (or partial failures).
5. Library > Twitch > Refresh Twitch performs the equivalent refresh.
6. Empty Twitch refresh button uses the same working backend route.
7. Twitch Live manual refresh continues to work.

## Regression
- Seamless updater remains unchanged from 21.3.0 except app version metadata.
- Generate variations still honors Auto / 5 / 10 / 20.
- Export current and Export all use Auto Director per clip.
