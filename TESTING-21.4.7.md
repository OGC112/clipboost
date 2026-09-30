# ClipBoost 21.4.7 — Progressive Campaign Setup

## What changed

- Campaign setup is now a centered modal instead of a right-side drawer.
- The visible form is intentionally shorter: campaign identity, brief, payment essentials, deadline/access/status.
- Payment fields react to the selected model:
  - Per views: rate basis + default rate.
  - Bounty pool: bounty pool only.
  - Fixed reward: reward amount only.
  - Custom/manual: no irrelevant payout amount field is forced.
- Qualification scope, payout caps, confirmed payout and platform overrides moved under **Advanced payout options**.
- Duration/platform/hashtag/mention/CTA/forbidden rules moved under **Advanced rules**.
- Both advanced sections are collapsed by default.
- Save/Cancel stay visible in a sticky footer while the modal scrolls.
- The Trends page was removed from navigation and routing.
- Existing 21.4.6 Projects action-cell protection remains unchanged.

## Quick test

1. Open **Campaigns** and click **+ Add campaign**.
2. Confirm the modal is centered horizontally and vertically.
3. Confirm only the compact setup fields are visible initially.
4. Change Payment model between Per views, Bounty pool, Fixed reward and Custom/manual; irrelevant fields should disappear immediately.
5. Expand **Advanced payout options** and **Advanced rules** and verify saved values remain editable.
6. Resize the window; the modal should remain centered and become full-screen only on narrow layouts.
7. Confirm **Trends** no longer appears in the left navigation and `#/trends` falls back to Home.
8. Save a campaign and reopen Edit; verify all values persist.
