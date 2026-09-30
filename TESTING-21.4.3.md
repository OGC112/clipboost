# ClipBoost 21.4.3 — Real Campaign Model testing

## Campaign setup

1. Open **Campaigns → + Add campaign**.
2. Create one **Per views** campaign with a 100K qualification threshold and platform-specific rates.
3. Create or edit one **Bounty pool** campaign.
4. Confirm cards show payment model, minimum views, platforms, access state and deadline.
5. Edit the campaign and confirm existing sources are preserved.

## Workflow

1. Add an authorized YouTube/Twitch source.
2. Click **Edit with AI Studio** and verify campaign context follows the project.
3. Generate clips and confirm View Potential / Campaign Fit remain visible.
4. Run the Campaign Check before export.

## Submission tracking

1. Add a published post with platform, views, status and confirmed payout.
2. Update views and change status from Pending to Accepted.
3. Confirm Estimated payout and Confirmed payout are different when expected.
4. Download the Submission Pack and verify it contains payment model, platform payouts, qualification and posts.

## Regression

- YouTube ingest still retries with Smart YouTube Authentication.
- Long-video Fast Local AI pipeline still works.
- Silent auto-update remains unchanged.
- Existing 21.4.2 campaign records load without migration errors.
