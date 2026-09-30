# ClipBoost 21.5.2 — Canto Asset Discovery

## Lionsgate Smart Import
1. Open Campaigns and run Smart Import for Lionsgate.
2. Confirm the Review screen reports **1 direct source**, **2 asset packs** (Assets and Assets #2), and the requirement artwork separately as reference images.
3. Confirm `Minimum to qualify` is 100K and rate remains $250 / 100K.
4. Confirm the saved Campaign URL is the Lionsgate detail URL, not only `/dashboard/campaigns`.

## Canto packs
- Assets and Assets #2 should no longer be duplicated by generic `Download` entries.
- If Canto exposes individual media pages, the pack should report detected video counts from those pages.
- Gallery thumbnails/posters must not be counted as editable image media.
- From Review or Sources, open Assets, return, then open Assets #2. Both links should remain usable because they open outside the transient import window.

## Reference artwork
- The three requirement download images should appear under **Reference artwork** when their links are exposed by the page.
- Reference artwork must not be queued to AI Studio as source video.

## Regression
- Requirements, violations, start date, audience, PayPal, account limit and shared clipping.net rules remain imported.
- Manual Add/Edit Campaign still saves.
- Eco AI mode, stuck-project recovery, Projects layout fix and silent updater remain unchanged.
