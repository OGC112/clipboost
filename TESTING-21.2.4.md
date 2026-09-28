# ClipBoost 21.2.4 — Seamless Updater hardening test

Test from an installed 21.2.3 build.

## Expected update UX

1. Let ClipBoost detect 21.2.4 automatically.
2. While it downloads, no update dialog should flicker.
3. When the download finishes, exactly one ClipBoost `Update ready` modal should appear.
4. Leave it open for 10–20 seconds: it must remain stable.
5. Click `Later`: it must stay dismissed for that session.
6. Click the update pill manually if you want to reopen the same ready update.
7. Click `Restart & install`.
8. The custom ClipBoost `Installing ClipBoost…` state appears briefly.
9. ClipBoost closes.
10. No NSIS/Windows installer wizard or progress window should appear.
11. ClipBoost should reopen automatically on 21.2.4.

## Regression checks

- Settings > Check for updates still works.
- Tray > Check for updates still works.
- Closing ClipBoost after choosing Later must not silently install the update.
- No duplicate installer processes should launch.
- No temporary `clipboost-silent-update.ps1` helper should be created.
- If install startup fails, ClipBoost must clear the installing lock and show an update error.
- A manual retry may re-prompt the same ready version after a failed install attempt.
- Projects, settings, `.env` and AppData data stay untouched.
