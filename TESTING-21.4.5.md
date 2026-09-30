# ClipBoost 21.4.5 — Compact Campaign Workspace testing

## Campaign hierarchy
1. Open Campaigns and select a campaign.
2. Confirm campaign cards stay in one horizontal selector row.
3. Confirm the selected campaign shows only four primary KPIs in Overview.
4. Switch between Overview, Sources, Published and Rules. Only the selected tab content should be visible.
5. Confirm Start creating clips remains visible in the campaign header.

## Add / edit drawer
1. Click + Add campaign. The form should open from the right without extending the page vertically.
2. Close by Cancel, ×, or clicking the dark backdrop.
3. Edit an existing campaign and save it. Existing sources/posts must remain intact.

## Login-wall-safe import
1. Paste a public campaign page: normal public pages may import as before.
2. Paste a page that resolves to Sign In / Log In / anti-bot verification.
3. ClipBoost must NOT create a campaign from the login-page text.
4. It should display the fallback message, keep the URL, and open the manual campaign drawer.

## Regression checks
- Add/remove authorized source.
- Open a source in AI Studio.
- Add/update/remove a published post.
- Download Submission pack from Published.
- Copy publishing checklist from Rules.
- Campaign Fit / compliance behavior remains unchanged.
- Projects action buttons remain non-overlapping from 21.4.4.
- Smart YouTube Authentication and seamless auto-update remain unchanged.
