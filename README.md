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

## 21.5.4

Smart Import draft placement polish and safer Canto asset counting. Canto's visible item count now caps detected media so hidden player nodes cannot inflate video counts.
