# ClipBoost 21.5.6 — Asset Pack Browser

Campaign asset packs are now usable inside ClipBoost instead of being external links only. In Campaigns → Sources, **Browse media** inspects the Canto pack with the same persistent authenticated campaign session, shows the media that Canto actually exposes, lets you preview detected videos, and sends a selected direct video into AI Studio while keeping the campaign context attached.

## 21.5.6 highlights
- New **Browse media** action for campaign asset packs.
- Canto packs are inspected on demand rather than trusting the import-time media counter.
- Detected direct videos can be previewed inside ClipBoost.
- **Edit with AI Studio** creates a campaign-linked project from the selected asset and starts ingestion immediately.
- Items whose direct media URL is not exposed are never guessed; they remain openable in Canto.
- The original pack is always one click away.
- Keeps Smart Import, reference-artwork separation, 100K qualification cross-check, recoverable review drafts, Eco AI mode and seamless updates.

# ClipBoost 21.5.3 — Recoverable Smart Import Review

Smart Import reviews are now recoverable instead of disposable. Closing the Review Import modal no longer destroys the imported campaign draft. ClipBoost saves the unsaved review locally and exposes a **Review import** action on the Campaigns page. The draft also survives navigation and a full app restart until the campaign is saved, explicitly discarded, or replaced by a newer Smart Import.

## 21.5.3 highlights
- Closing or cancelling an imported campaign review keeps the draft.
- Clicking outside the review modal also keeps the draft.
- Campaigns shows an **Unsaved import** strip with **Review import**.
- Unsaved import review survives app restart via local storage.
- Saving the campaign clears the recovery draft.
- Explicit **Discard saved import** action with confirmation.
- Keeps all 21.5.2 Canto asset pack/reference artwork fixes.

## 21.5.5

Smart Import draft placement polish and safer Canto asset counting. Canto's visible item count now caps detected media so hidden player nodes cannot inflate video counts.
