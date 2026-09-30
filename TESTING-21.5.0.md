# ClipBoost 21.5.0 — Campaign Smart Import

## Primary Clipping.net test

1. Open **Campaigns** and paste a real Clipping.net campaign URL.
2. Click **Smart Import**.
3. A dedicated ClipBoost browser window should open. If Clipping.net asks you to sign in, sign in there normally.
4. Keep the campaign page open. ClipBoost should detect the authenticated campaign page automatically, read it, then read the linked requirements page using the same session.
5. The browser window should close automatically and ClipBoost should open **Review imported campaign**.
6. Confirm that payout rate and rate basis are separated from qualification. Example: `$250 / 100K views` must import as `rate=$250`, `rate basis=100000`, and **minimum views remains 0/unknown unless the site explicitly states a qualification threshold**.
7. Confirm missing/undefined campaign duration does not become a `0 days` deadline.
8. Confirm media sources (YouTube/Twitch) and external campaign resources/assets are separated.
9. Confirm Audience, Requirements and Violations appear in the review and, after saving, under the **Rules** tab.
10. Save the campaign and open **Sources** / **Rules** to verify the imported data persists.

## Lionsgate reference case
Expected from the supplied example when the authenticated page exposes the same data:
- Campaign: Lionsgate
- Payment: $250 per 100K views
- Minimum qualification: unknown unless explicitly stated
- Start date: 17/09/2026
- Payment method: PayPal
- Account limit: Unlimited
- Audience: Australia
- Trailer: YouTube media source
- Assets / Assets #2: campaign resources
- Clip Requirements: imported as individual requirements
- Violations: imported as individual disqualifier rules
- No deadline if the site only displays `undefined days`

## Session behavior
- Close and reopen Smart Import: the campaign browser session should remain signed in where the website allows persistent cookies.
- ClipBoost never asks for or stores the campaign-site password itself; authentication happens in the site page inside Electron.

## Regression checks
- Manual **+ Add campaign** still works.
- Public import fallback still works outside Electron.
- Existing campaigns remain readable.
- Eco AI mode, stuck-project recovery, Projects action layout and seamless updater behavior are unchanged.
