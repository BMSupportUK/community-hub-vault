# All-channels list with Online / Offline status

## What you'll see
A new **Channels** section in the BM Player admin area (next to Buffering). It lists every live channel from the playlist, grouped by category, with search and a category filter. Each channel has a status pill:

- **Online** (green): played cleanly or passed a check recently
- **Offline** (red): marked not working right now (the same signal that puts the cross on the Sports Guide)
- **Not checked** (grey): nobody has watched it and it hasn't been tested yet

Each row also shows when the channel was last seen working or failing, and why it failed ("No picture", "Wouldn't play", "Keeps cutting out"). The top of the page shows totals (Online / Offline / Not checked) and has an "Offline only" toggle. Admins keep the existing Clear button on offline rows. The page refreshes every 60 seconds.

## Where the status comes from
- Viewers' BM Players already report failures, no-picture and clean playback. This covers channels people actually watch.
- The separate test login checks 5 channels every 5 minutes. It is still being refused by the provider (401), so until that's sorted, most channels nobody watches will show **Not checked**. Testing all 8,400+ channels isn't realistic with one test connection, so this is expected.

No app updates are needed. This is website-only.

## Technical details
- New admin/management server function (`requireSupabaseAuth` plus a role check) that returns the playlist live channels (cached `playlist-source.server.ts`, name + category) joined in memory with `player_channel_health` rows by `channelKey()`.
- Status helper in `src/lib/player-channel-health.ts`: `channelStatus(row, now)` returns offline when `isCrossed`, online when `last_ok_at` is within 24h, otherwise unchecked. Tests in the existing test file use concrete timestamps.
- New `PlayerChannelsSection.tsx`, using a virtualised or paginated list (100 per page) for performance. It is mounted beside `PlayerBufferingSection` behind the existing admin-panel access gates.
- No database changes. The table and RLS already exist.
