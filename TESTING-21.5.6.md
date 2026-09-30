# ClipBoost 21.5.6 — Asset Pack Browser

## Lionsgate test
1. Open Campaigns → Lionsgate → Sources.
2. Under Campaign Asset Packs, click **Browse media** on `Assets`.
3. Wait for the pack browser to finish reading Canto.
4. Confirm media cards appear for the pack instead of only the external Canto link.
5. Preview a detected video when a direct media URL is exposed.
6. Click **Edit with AI Studio** on one video.
7. Confirm AI Studio opens, ingestion starts, and the project remains linked to Lionsgate campaign rules/context.
8. Repeat for `Assets #2`.

## Safety / fallback
- If Canto does not expose a direct video URL, ClipBoost must not invent one. The item can still be opened in Canto.
- Reference artwork stays separate and never receives **Edit with AI Studio**.
- `Open original pack` remains available from the browser.
- Direct YouTube trailer behavior remains unchanged.
