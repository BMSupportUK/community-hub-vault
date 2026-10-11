# Stop duplicate browser notifications

## What's happening

Each browser that allows notifications gets its own entry on your device list, and every entry receives every alert. That's correct when you genuinely use several devices. The duplicates happen when **the same browser ends up on the list more than once**:

- Browsers occasionally rotate their private push address (after an update, a profile reset, or a re-subscribe). The new address is saved as a new row, but the old row stays on the list until it fails — and it often keeps working for weeks, so that one browser gets every alert twice.
- Signing in on a new device then re-enabling notifications can repeat this on the old device too.

## The fix

1. **One entry per browser, per person.** When a browser saves its registration, any older entries for the same person on the same browser and device (matched by the browser's identity string) are removed at the same moment. The new entry replaces them instead of stacking up.
2. **Keep the existing clean-up.** Entries whose push address has genuinely died are already deleted automatically when sending fails — that stays.
3. **One-off tidy-up.** Remove current duplicate rows (same person, same browser identity) from the device list, keeping only the most recently seen entry for each, so the doubling stops immediately rather than fading out over time.

## What this does NOT change

- Different devices and different browsers still each get their own alerts — signing into a new phone or browser keeps working exactly as now.
- Android app alerts are untouched.
- The service worker already replaces an alert with the same tag on a single device, so no change needed there.

## Technical details

- Edit `saveSubscription` in `src/lib/push.functions.ts`: after the upsert, delete rows in `push_subscriptions` where `user_id` matches, `user_agent` matches, and `endpoint` differs.
- One-off SQL tidy: delete `push_subscriptions` rows that share `(user_id, user_agent)` with a newer row (keep latest `last_seen_at` per group).
- Verify with a quick query that no `(user_id, user_agent)` pair has more than one row afterwards.
