# ClipBoost 21.3.5 — Dynamic Source Reframe

## Goal
Fix speaker framing by calculating every crop from the original full-resolution source instead of from a fixed social-media crop.

## Critical test
Use a horizontal video with two people separated left/right and alternating speech.

Expected:
1. The active speaker is centered in the 9:16 output.
2. When speaker changes, ClipBoost briefly widens/dezooms instead of teleporting or leaving the new speaker outside frame.
3. It then zooms/reframes onto the new speaker.
4. No person should remain permanently cut off just because the first 9:16 crop was centered elsewhere.
5. Preview and final export must use the same framing.
6. Caption color options and zero-punctuation captions from 21.3.4 remain intact.
7. Twitch live popup, refresh fixes and seamless updater remain intact.

## Implementation note
Speaker tracking is sampled at ~240 ms while cameraMovement only controls smoothing. Speaker changes are no longer delayed by the old low-movement sampling interval.
