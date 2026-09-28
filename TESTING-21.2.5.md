# ClipBoost 21.2.5 — Seamless Updater validation

Purpose: validate the updater code already running in ClipBoost 21.2.4.

## Required starting point
- ClipBoost must already show version 21.2.4.
- Publish 21.2.5 through the existing Auto Publisher.

## Expected flow
1. Launch ClipBoost 21.2.4.
2. Let it detect/download 21.2.5.
3. Exactly one `Update ready` modal appears.
4. Click `Restart & install`.
5. ClipBoost shows its custom installing state.
6. ClipBoost closes.
7. No NSIS/Windows installer UI appears.
8. ClipBoost relaunches automatically.
9. Settings reports version 21.2.5.
10. Reopening ClipBoost must not offer 21.2.5 again.
