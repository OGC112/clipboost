# ClipBoost 21.4.0 — Campaign Workspace test plan

## Goal
Validate the paid-campaign workflow without changing ClipBoost's existing video quality, Context Engine behavior, Fast Local AI pipeline, or seamless updater.

## 1. Campaign creation
1. Open **Campaigns**.
2. Create a manual campaign.
3. Fill name, provider, brief, allowed duration, deadline, view threshold, payout, hashtags/mentions/CTA, and one or more YouTube/Twitch source URLs.
4. Restart ClipBoost and confirm the campaign is still present.

Expected: campaign data persists in the ClipBoost data directory and no `.env` secret is written to the project.

## 2. Public URL import
1. Paste a public campaign page URL in **Import a public campaign page**.
2. Import it.

Expected: ClipBoost tries to extract public title/description and YouTube/Twitch source links. If the site blocks public access or needs login, ClipBoost shows a clear error and manual entry remains available.

## 3. Source → AI Studio
1. Open a campaign.
2. Click **Edit with AI Studio** on a source.
3. Let automatic ingestion and Local AI analysis finish.

Expected: the project is linked to the campaign and AI Studio shows **Campaign Mode**.

## 4. Campaign-aware clip selection
For several generated candidates, verify:
- View Potential is visible.
- Campaign Fit is visible.
- Brief relevance is visible.
- Duration fit respects the campaign min/max.
- A previously exported range is marked as used after re-analysis.
- Forbidden terms lower campaign fit instead of being ignored.

## 5. Hook variants
1. Select a campaign clip.
2. Click **Generate hook variants**.
3. Apply Tight hook / Balanced / More context variants.

Expected: each variant stays on transcript-aware boundaries and can render an edited preview.

## 6. Pre-export campaign check
1. Click **Check campaign**.
2. Export a compliant clip.
3. Try a deliberately non-compliant duration.

Expected: compliant clips export normally; failed checks are shown before export and the normal final render remains 1080×1920.

## 7. Used moments
Export one campaign candidate, then regenerate/re-analyze the same campaign source.

Expected: the exported time range is tracked and Campaign Fit identifies that overlap as already used.

## 8. Performance / payout tracking
1. Add a published post with URL, platform, views, clip duration and editing minutes.
2. Add a second result with different performance.

Expected: dashboard updates total views, payout progress, remaining views, average/best performance, learned best duration and revenue/hour when enough data exists.

## 9. Submission pack
Click **Submission pack**.

Expected: ClipBoost exports a JSON record containing campaign rules, payout metadata, tracked posts, totals and exported moments.

## 10. Batch sources
Click **Queue all sources**.

Expected: one linked project is created per campaign source without duplicating already queued sources. Heavy analysis is not launched concurrently automatically.

## 11. Seamless auto-update regression
From an installed 21.3.8 build:
1. Publish 21.4.0 through the normal GitHub Actions flow.
2. Let ClipBoost detect/download the update.
3. Click **Restart & install** once.

Expected: one update-ready prompt, silent NSIS installation, automatic relaunch on 21.4.0, campaign data/settings preserved. Default update channel is `OGC112/clipboost` even on a fresh config.
