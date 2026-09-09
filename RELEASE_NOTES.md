# Sentrovia v0.3.9

## Highlights

- Excluded test deliveries from delivery summary counters, dashboard delivery metrics, and channel health calculations while keeping them in Delivery history.
- Refresh Delivery history after recorded test failures and avoid duplicate test-result banners.
- Keep history cleanup and retry controls available when the history contains only test deliveries.
- Added delivery test API coverage and documented Telegram and Discord test configuration in the README.

## Upgrade notes

No new database migrations are introduced in this release. Existing test records are preserved and automatically excluded from operational delivery metrics after upgrading.
