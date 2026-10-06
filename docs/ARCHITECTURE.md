# ClipBoost backend architecture

ClipBoost is a local-first Electron application. The desktop process launches an Express backend bound to `127.0.0.1`; the backend owns local media processing, campaign state, integrations and AI orchestration.

## Server modules

- `server/index.js` — composition root, process lifecycle, heavy analysis/render orchestration.
- `server/storage/` — atomic JSON persistence and serialized campaign/profile writes.
- `server/campaigns/` — campaign model, import parsing and Campaign API routes.
- `server/library/` — creator library API routes.
- `server/projects/` — project lifecycle API routes.
- `server/integrations/` — YouTube, Twitch and yt-dlp ingestion.
- `server/security/` — public URL validation / SSRF protection.
- `server/settings/` — local environment-backed settings.
- `server/runtime/` — Windows tool discovery/runtime command resolution.
- `server/ai/` — Ollama client and local Whisper/transcription engine.
- `server/video/` — FFmpeg signal parsers, upload/ingest routes and video API routes.

## Design rules

1. Keep the Electron/backend boundary local-only.
2. Route modules should register HTTP endpoints but delegate reusable logic to domain modules.
3. JSON state writes must be atomic. Read/modify/write operations on shared state must be serialized.
4. Long-running child processes must remain associated with a project so delete/shutdown can terminate them safely.
5. AI failures degrade to deterministic selection instead of failing the entire project.
6. Public URL fetching must pass the network security guard, including redirects.
7. A Windows release is published only after `npm ci`, backend tests and the web build succeed.

## Next extraction targets

The remaining large blocks in `server/index.js` are the semantic candidate engine and FFmpeg render/director engine. They should be moved only with behavior-preserving tests because they share timing, caption, tracking and campaign-scoring helpers.
