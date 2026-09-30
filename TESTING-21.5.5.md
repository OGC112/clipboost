# ClipBoost 21.5.5 — Canto Count Confidence

## Goal
Avoid false exact video counts when a Canto gallery exposes only part of its media DOM.

## Test — Lionsgate
1. Open Campaigns and run Smart Import for the Lionsgate campaign.
2. Wait for the authenticated campaign + requirements + asset inspection to finish.
3. In Review Import, expand **Detected asset packs**.
4. `Assets` must no longer claim `1 video` when multiple visible gallery items exist. It should show `Video pack · multiple videos` unless every item was positively identified.
5. `Assets #2` may show `1 video` only when the gallery itself declares exactly one item and that item is confirmed as video.
6. Confirm the rest stays unchanged: 2 asset packs, 3 reference images, 100K minimum, 2 requirements, 6 violations.

## Regression
- Close Review Import and reopen the saved draft.
- Open Sources after saving and confirm the same confidence-aware labels are shown.
- Smart Import must not invent an exact media count when inspection is incomplete.
