# ClipBoost 21.3.3 — In-App Live Player

## Goal

Keep the current Library > Twitch > Live interface, but open a live stream inside a ClipBoost popup instead of immediately leaving the app.

## Test

1. Follow at least one Twitch creator who is currently live.
2. Open Library > Twitch > Live.
3. Click the live thumbnail.
4. A large ClipBoost-styled live popup should open.
5. The popup header must show streamer name, title, viewer count and game/category.
6. Twitch should load inside the popup.
7. Close the popup: playback must stop immediately.
8. Reopen it using the `Watch live` button.
9. `Open on Twitch` must still open the channel externally as a fallback.
10. `Reload player` must reload only the embedded Twitch session.
11. The Live `Refresh` button must still refresh status and must not open the player.
12. VOD/Clip previews, YouTube previews, Auto Director and the seamless updater must remain unchanged.

## Security

The Twitch webview is isolated from ClipBoost:
- no Node integration
- no ClipBoost preload bridge
- sandbox enabled
- initial URL limited to https://www.twitch.tv/<channel>
- external popup windows are denied/opened in the system browser
