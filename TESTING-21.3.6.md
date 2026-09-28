# ClipBoost 21.3.6 — Safe Reframe Recovery

## Main regression from 21.3.5

A failed face-tracking pass displayed `Tracking fallback — Center framing used`, which could cut a person standing near the left/right edge.

## Expected behavior

1. Generate a preview from a horizontal video with a person near an edge.
2. If direct OpenCV tracking works, ClipBoost follows the speaker from the original source.
3. If OpenCV cannot decode/seek the source, ClipBoost automatically builds a temporary low-resolution H.264 FFmpeg tracking proxy and retries.
4. The proxy is used only for normalized tracking coordinates; the preview/export always renders from the original source.
5. If both tracking attempts fail, the badge reads `Tracking fallback — Full source preserved`.
6. In that fallback, the COMPLETE original frame must remain visible over a blurred vertical background — never a center crop.
7. During a detected speaker switch or ambiguous multi-person moment, ClipBoost temporarily returns to the complete source frame, then crops the newly confident speaker.
8. Caption colors and punctuation-free captions remain unchanged.
9. Twitch in-app Live and seamless updater remain unchanged.
