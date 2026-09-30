# ClipBoost 21.5.4 — Smart Import polish

## What changed

- Saved Smart Import drafts now render as a compact full-width row directly under the import controls instead of floating under the explanatory copy.
- `Review import` and discard stay visible and aligned with Smart Import.
- Canto gallery inspection now treats the visible `N Items` count as an authoritative upper bound.
- Hidden/duplicate Canto `<video>` elements no longer inflate asset counts.
- A single Canto viewer page counts as one media item even if it contains duplicate player nodes.
- Existing Smart Import recovery, campaign rules, reference artwork separation, Eco AI and updater behavior are preserved.

## Lionsgate regression check

1. Smart Import the Lionsgate campaign.
2. Confirm the saved draft row appears directly below the URL/import controls after closing Review.
3. Reopen Review from that row.
4. Confirm there are exactly 2 asset packs and 3 reference images.
5. Canto asset packs should not report impossible counts caused by hidden player elements. For the supplied Lionsgate galleries, the visible gallery counts should cap detected media at 2 items for Assets and 1 item for Assets #2.
6. Confirm minimum to qualify remains 100K and rate basis remains 100K at $250.
