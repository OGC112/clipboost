# ClipBoost autonomous discovery mode

You are NOT given a predefined bug. Your job is to understand the current code and find ONE genuine, low-risk optimization or reliability defect that can be addressed in this cycle.

## Orient yourself first
- Read `package.json` and the PROJECT MAP supplied in the prompt (context, not a substitute for code).
- Trace relevant flows in `desktop/main.cjs`, `src/app.js`, `server/index.js`, `server/video/` and related tests as appropriate. Do not attempt to read all files into context at once.
- Identify a user-visible hot path: editor render, preview frame updates, timeline interactions, subtitles, background polling, FFmpeg progress or Electron lifecycle.

## Discovery procedure
1. Identify 2-3 candidate issues with exact file/function references and concrete evidence (duplicate listeners, unnecessary full DOM rerender, unbounded timer, stale callback, avoidable work per frame, race, missing cleanup, etc.).
2. Select ONE issue with low regression risk and clear expected benefit. Prefer actual code evidence over speculative optimizations.
3. Before editing, inspect existing tests and behavior. Do not duplicate a fix already in main or in the recent agent branches supplied by the supervisor.
4. Make a small targeted change, ideally 1-3 source files plus a focused test.
5. Run relevant tests if the sandbox permits. State what was actually measured versus only reasoned about.
6. Report the candidates, chosen issue, before/after reasoning, exact files, tests, and what remains unverified.

## Stop conditions
- If you cannot establish a specific issue, make NO code changes and report findings.
- Never change auth, secrets, platform API credentials, release pipelines, user data or tools/agent.
- Never do broad architecture rewrites, replace the editor wholesale, add dependencies, or change FFmpeg defaults.
- Keep Windows/Electron compatibility, preview/export parity, subtitles, crop, full-video and manual edit behavior intact.
