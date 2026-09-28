# ClipBoost 21.3.4 — Social Captions + Speaker Reframe v2

## Caption tests

1. Open AI Studio on a project with speech.
2. Caption color must offer only useful social presets: Auto, White, Yellow, Lime, Cyan, Pink, Red.
3. Changing a color must invalidate/regenerate the edited preview and final export with the same selected color.
4. Rendered captions must contain no punctuation at all, including apostrophes and hyphens.
5. Auto keeps White for most talking content and may use Yellow for gaming/reaction.

## Speaker reframing tests

Use a horizontal source containing at least two visible speakers who alternate speaking.

1. ClipBoost should crop 9:16 around the visually active speaker instead of staying centered.
2. When the other person starts speaking, framing should move to them quickly but not jitter between faces on isolated motion.
3. A listener gesturing should not steal focus unless their mouth/lower-face activity consistently wins.
4. When speaker identity is ambiguous, use the wide safe frame rather than cutting a person out.
5. With one clear face, keep following that face even when mouth activity is temporarily low.
6. Preview and final export must use the same framing.

## Regression

- 21.3.3 Twitch in-app live popup remains functional.
- Refresh YouTube/Twitch remains functional.
- Seamless updater remains unchanged.
- Quality-only clip selection remains unchanged.
