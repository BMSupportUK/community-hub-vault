# Fill the customer Viewing stats with the last 7 days

## What's wrong
The Viewing stats tab (beside Connection information on the customer's connection log) is there, but every day tab is empty. The daily stats only started recording at 19:21 today, and nobody has watched anything since 19:07, so nothing has been saved yet. The last 7 days of viewing are already stored in the older watch history (444 sessions in the last day alone), but they were never copied into the daily tabs.

## Fix
1. **Copy the last 7 days of existing viewing history into the daily tabs.** Each session goes under its UK day, split at midnight if it ran past it, with its channel or film name, category, device and login, and how long it was watched. Previews are left out, like now.
2. **Check that live recording works.** I'll run one test check-in for a test device and make sure today's tab updates, then remove the test row.
3. **Look at the page signed in as admin** on a real customer who watched this week. I'll confirm the chart, the percentages, the 7 day tabs and the IP/location table all show.

## Limits
- Copied sessions show the device's current IP and location, not the one used at the time. Older history doesn't record which IP was used.
- Connection strength bars stay at "No reading" until the updated players go out.

## Technical details
- Data backfill (not a schema change): INSERT INTO player_customer_daily_stats SELECT from player_watch_activity, joining player_devices on (id, user_id), for last_watched_at in the last 7 UK days. Sessions are split at Europe/London midnight using generate_series over day boundaries, with seconds pro-rated from [last_watched_at - seconds, last_watched_at]. Duplicates are summed with ON CONFLICT (user_id, device_id, login, day, kind, title) DO UPDATE.
- Rows are purged hourly by the existing 7-day cron.
- Verify with a read query, then Playwright with the minted admin session on /admin-customer-connections?customer=<id>.
