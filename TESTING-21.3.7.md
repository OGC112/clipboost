# ClipBoost 21.3.7 — Context Engine v3

## Goal
Generate only genuinely interesting, self-contained clips. A clip must never begin or end in the middle of a thought merely to satisfy a target duration.

## What changed
- Semantic AI now identifies the core interesting moment separately from the final clip boundaries.
- Deterministic Context Engine searches up to ~14 seconds backward for the natural setup/start.
- It searches forward for the actual payoff/conclusion and allows shorter clips when the complete thought is short.
- Final local-AI review sees BEFORE / CLIP / AFTER context and can extend or reject a candidate.
- Auto mode still has no quota: fewer strong clips is correct.
- Boundary/completeness thresholds are stricter.

## Test
1. Analyze a long conversational video with stories or explanations.
2. For every generated clip, listen to the first 3 seconds: it must make sense without the original video.
3. The first spoken phrase must not be the second half of a sentence or an unexplained answer.
4. Watch the last 5 seconds: the reveal, answer, punchline or conclusion must land before the cut.
5. No clip should end on `and`, `but`, `because`, `et`, `mais`, `parce que`, or a visibly unfinished clause.
6. A 12–18 second complete moment is preferable to padding it to 30 seconds.
7. Auto mode may return very few clips if the source has few genuinely strong moments.
8. Re-run the same source after 21.3.6 and compare boundaries, not just scores.

## Regression
- 21.3.6 safe full-source reframe recovery remains unchanged.
- Social caption colors and punctuation-free rendered captions remain unchanged.
- Twitch in-app live player remains unchanged.
- Seamless updater remains unchanged.
