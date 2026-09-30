# ClipBoost 21.5.3 — Recoverable Smart Import Review

## Regression test
1. Run Smart Import on a campaign and wait for Review Import.
2. Close the review with the top-right X.
3. Confirm Campaigns shows **Unsaved import** and **Review import**.
4. Click **Review import** and confirm the same extracted fields are restored without re-scraping.
5. Close ClipBoost completely, relaunch it, go to Campaigns and confirm **Review import** is still available.
6. Save the campaign and confirm the recovery strip disappears.
7. Run another import, close it, then use the discard X and confirm the draft is removed only after confirmation.
