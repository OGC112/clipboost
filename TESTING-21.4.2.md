# ClipBoost 21.4.2 — Campaign Workflow Polish

## Goal
Make Campaigns feel like a production dashboard: campaign → authorized source → AI Studio → export → performance feedback.

## Quick test
1. Open **Campaigns**. The new-campaign form must be hidden by default.
2. Click **+ New campaign**. Save a name, brief, payout/view target and rules.
3. Confirm the campaign dashboard shows setup readiness and clear payout/view progress.
4. Add an authorized YouTube/Twitch source.
5. Click **Start creating clips** or **Edit with AI Studio** and confirm the campaign is carried into AI Studio.
6. In AI Studio confirm **Campaign Mode**, View Potential, Campaign Fit, campaign check and hook variants still work.
7. Return with **Open campaign**.
8. Add a published post, then change its view count and click **Update**. Dashboard totals must refresh.
9. Remove a tracked post and remove a source; confirm only the campaign records are removed.
10. Copy the publishing checklist and confirm it includes saved duration/platform/hashtags/mentions/CTA rules.
11. Export a campaign clip and confirm compliance blocking still works when a blocking rule fails.
12. Confirm Settings / updater / YouTube ingestion from 21.4.1 still behave normally.

## Regression checks
- Existing campaign data must remain compatible.
- Editing a campaign must NOT erase its source list.
- Existing AI Studio projects and exported files must survive campaign source deletion.
- `.env` must remain ignored and absent from the release ZIP.
