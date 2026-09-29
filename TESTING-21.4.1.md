# ClipBoost 21.4.1 — Smart YouTube Authentication

## Goal
Make **Library → Edit with AI Studio** resilient to YouTube anti-bot / JavaScript challenges without requiring Brave to be closed.

## What changed
- Public yt-dlp ingest is attempted first.
- If YouTube requests authentication, ClipBoost retries automatically with the configured browser session.
- Firefox is the default/recommended YouTube auth browser and can remain open.
- Node on `D:\Apps\NodeJS\node.exe` is auto-detected for yt-dlp EJS challenge solving.
- `ejs:github` remote challenge components are enabled for YouTube when Node is available.
- FFmpeg/FFprobe on `D:\Apps\FFmpeg\bin` are auto-detected even when Windows PATH is incomplete.
- The server prepends detected D: tool folders to PATH so Python transcription subprocesses can also find FFmpeg.
- `yt-dlp[default]` installs the supported yt-dlp EJS extras.
- Settings now include **YouTube download authentication** (Firefox / Auto / Edge / Chrome / Brave / None).
- System Health now checks Node/EJS runtime and yt-dlp.
- Clearer errors distinguish unavailable videos, missing YouTube authentication, locked cookie databases and JS challenge failures.
- Existing silent GitHub auto-update behavior is preserved.

## Recommended Windows configuration
- Firefox signed into YouTube.
- Brave may stay open for ChatGPT.
- `D:\Apps\NodeJS\node.exe`
- `D:\Apps\FFmpeg\bin\ffmpeg.exe`
- Project Python venv configured through `PYTHON_BIN`.

## Test
1. Open ClipBoost 21.4.1.
2. Settings → YouTube download authentication → **Firefox (recommended)**.
3. Settings → System health → Run check. Node/EJS, yt-dlp, FFmpeg and FFprobe should be green.
4. In Library, choose a public YouTube video and press **Edit with AI Studio**.
5. If anonymous YouTube ingest is blocked, the retry should happen automatically with Firefox.
6. Confirm download proceeds into AI analysis without a manual PowerShell command.
7. Test a deleted/private URL and confirm the UI reports **Video unavailable** instead of a generic ingest failure.
