# ClipBoost 21.2.2 — Seamless Update Fix

## Update popup stability
1. Install/run ClipBoost 21.2.1.
2. Publish 21.2.2.
3. Let ClipBoost detect and download it.
4. Confirm the **Update ready** modal appears exactly once and stays stable.
5. Wait at least 20 seconds: it must not disappear/reappear.
6. Click **Later**: it must stay dismissed. You can reopen it manually from the Update pill.

## One-click silent install
1. Reopen the ready modal from the Update pill if needed.
2. Click **Restart & install** once.
3. ClipBoost should show **Updating ClipBoost… / Installing silently…** briefly.
4. The application should close.
5. No NSIS choice page, no **Next**, and no **Just me / all users** screen should appear.
6. ClipBoost should relaunch automatically as 21.2.2.

## Manual installer
The NSIS package is now a per-user one-click installer. A manual fresh install no longer asks who the application should be installed for.
