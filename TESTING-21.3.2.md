# ClipBoost 21.3.2 — Quality Gate + Caption/Framing Fix

## Clip selection
- Auto mode has no requested clip count.
- A video with only 2 strong moments may return only 2 clips.
- Weak candidates must not be added just to fill a quota.
- It is valid to return zero clips when nothing passes the quality gate.

## Captions / transcript preview
- Caption beats should usually be 2–4 words and around 1–2 seconds.
- No comma should be automatically appended just because a caption wrapped.
- Periods should be sparse and tied to real terminal/pause boundaries.
- Questions/exclamations may retain meaningful punctuation.

## Framing
- Test a one-person talking head.
- Test a two-person conversation with faces far apart.
- Test profile/side-facing speakers.
- The visible speaker/person must not be cropped out.
- When tracking is uncertain or multiple faces cannot safely fit a 9:16 crop, the renderer should use a full-source safe frame over a blurred vertical background instead of guessing.
- Speaker focus should not jump on a single noisy motion sample.

## Regression
- YouTube/Twitch Refresh still works.
- Auto Director still renders preview/final consistently.
- Seamless updater remains silent and relaunches automatically.
