# What that suggestion means

The Live TV guide is the grid with channels down the left and programme times across the top. "Wire it to real TV schedules" means every channel row should show its actual line-up from the TV listings (EPG): what's on now, then the next show at its real start time, and so on. As time passes, the guide moves along and the next programme becomes "now".

The other case is what you saw: one programme stretched across the whole row, as if it were on all day. That happens when the guide has only the current show for a channel, or none at all, and fills the gap with that one block.

The 3.01 fix stopped later programmes being squashed out of sight. But if a channel's listings never arrive, the row will still look fixed.

## What I'd do if you want it fixed

1. Check what listings your provider really sends for a few channels that look stuck. That tells us if the problem is missing data or the app.
2. If the provider only sends "now" for those channels, fetch the full day's listings for them instead, and keep a short "No listings" block where there's really nothing.
3. Refresh the guide on its own every few minutes, so the "now" programme moves on as time passes without reopening Live TV.
4. Add a test that a channel with several programmes shows each one at its own time.
5. Build and release Android 3.02 once you say so.

## Technical details

- Look at GuideGridView's lazy EPG fetch: whether it calls get_short_epg (now/next only) or the full get_simple_data_table per channel, and how its cache expires.
- Use the full table for the visible time window, and invalidate cached rows when the window passes their last end time.
- Add a Robolectric test beside LiveGuideNavigationTest.
