# Real TV guide listings for BM Player

## What changes for you
- The Live TV guide (Now / Up next, View EPG, reminders) on Android, Amazon, Windows and Mac shows listings taken from a proper published TV guide (the same data Sky/Freeview guides use), not just the playlist provider's own guide, which is often missing, wrong or an hour out.
- If the real guide has nothing for a channel, the app falls back to the provider's listing as it does today, so nothing goes blank.
- A new "Guide matching" page in the admin dashboard lists channels with their matched real guide channel, lets you fix or untick any match, and shows which channels have no real listings.

## How it works
1. BM Support downloads a free public UK/Ireland guide (XMLTV feed, plus US/Canada for DAZN CA/ESPN etc.) every 6 hours and stores 2 days of programmes.
2. Each playlist channel is matched automatically by name (e.g. "UK | Sky Sports Main Event FHD" -> Sky Sports Main Event), ignoring quality/country tags. Event-only and Replay feeds are skipped. Your manual fixes always win.
3. Players ask BM Support for a channel's listings; it sends the real guide when matched, otherwise the provider's. Times are stored in UTC and shown in UK time, so clock changes never shift them.
4. Sports Guide finish detection also uses the real guide, making "Finished" more accurate.

## Releases
- Website change publishes first; then Android 3.86, Windows 0.4.34 and Mac 0.1.43 so the apps read listings from BM Support.

## Technical details
- New tables `epg_channels`, `epg_programmes` (UTC start/stop, title, description), `epg_channel_map` (playlist name -> epg id, manual flag); RLS admin/management write, read via device-token player action.
- Scheduled server route `api/public/hooks/epg-import` (secret-checked) streams/parses XMLTV gzip, upserts, prunes >48h old.
- `player.ts` new `guide` action (batch up to 20 channels, 15-min shared cache); Android `GuideListings`, desktop guide fetch switch to it with provider fallback.
- `sports-programme-end.ts` reads the real guide first.
- Tests: name normaliser/matcher, UTC->UK conversion across BST change, fallback when unmatched.

## Unconfirmed
- Exact feed source chosen after checking coverage of Sky Sports/TNT/DAZN channels; some niche or foreign channels may have no real guide and keep provider listings.
