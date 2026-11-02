# ClipBoost architecture map for the maintenance agent

This is an orientation guide derived from the repository layout and package manifest. Verify against current code on each run; do not assume every file or flow is unchanged.

## Runtime
- Windows Electron desktop app: `desktop/main.cjs` is the Electron entry point (`package.json` main field).
- Vite client build: `npm run build` runs `vite build`. The main editor UI is in `src/app.js`.
- Local Node/Express backend: `server/index.js` (`npm run dev` / `npm start`).
- Video processing and FFmpeg-related logic and tests: `server/video/`.
- Build and packaging: `npm run desktop`, `npm run desktop:build` (Windows NSIS) and `npm run desktop:dir`.

## User-critical workflows to preserve
- Import and preview source video.
- Edit cuts and keep entire short video.
- Subtitles and captions-off toggle.
- Hook/title positioning.
- Crop and Twitch subtitle cropout, including blurred background.
- Preview/export consistency and audio/video synchronization.
- FFmpeg rendering and export progress.

## Performance investigation hints
- Trace render frequency and DOM/event rebinding in the editor before changing it.
- Trace video-frame callbacks, timers, polling, and cleanup when preview is paused or detached.
- Check Electron hardware acceleration only against measured or reproducible Windows behavior.
- Check event-listener duplication and resize/drag handler lifecycle.
- Distinguish visual preview changes from FFmpeg export pipeline changes.

## Validation
- `npm test` runs the manifest's server test suite. Other `src/*.test.js` files may require targeted `node --test <path>`.
- `npm run build` checks the Vite build but does not prove the Electron GUI or FFmpeg export works on Windows.
- Do not claim improved frame rate, memory usage or export speed without measurements.
