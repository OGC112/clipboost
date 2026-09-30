# ClipBoost 21.5.1 — Smart Import Cross-check

## Lionsgate / Clipping.net
1. Open **Campaigns**, paste the authenticated Lionsgate campaign URL and run **Smart Import**.
2. Sign in in the ClipBoost campaign browser if needed.
3. In Review Import, confirm:
   - Campaign: Lionsgate
   - Rate: $250 per 100,000 views
   - Minimum to qualify: 100,000 views (read from the campaign listing, not confused with the rate basis)
   - Qualification scope: Campaign total
   - Start date: 17/09/2026
   - Deadline stays empty when the site only exposes 0/undefined days
   - Audience: Australia
   - Payment: PayPal
   - Account limit: Unlimited
   - Direct source count includes the YouTube trailer
   - Asset packs are limited to the Content/Assets links rather than unrelated navigation links
4. Save the campaign.

## Asset packs
- Open **Sources**. Trailer should remain a direct AI Studio source.
- Assets / Assets #2 should appear under **Campaign asset packs**, with media classification when ClipBoost can inspect the Canto pages.
- ClipBoost must not invent stable direct video URLs when Canto only exposes a gallery/session URL.

## Shared Clipping.net rules
- Open **Rules** and expand **Platform rules — clipping.net**.
- The profile is read from the authenticated Clipper terms page and stored once per provider.
- The general 1,000-view per-post counting floor is separate from the campaign's 100,000-view qualification threshold.
- Typical platform guidance (for example a typical total-view minimum) must never overwrite the explicit campaign threshold.

## Regression
- Manual Add/Edit Campaign still saves.
- Public URL fallback still behaves as before.
- Existing campaigns without a platform profile still render.
- Eco AI mode, stuck-project recovery, Projects action layout and silent updater remain unchanged.
