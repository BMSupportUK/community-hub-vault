# Real TV guide listings for BM Player

## What changes for you
- The Live TV guide (Now / Up next, View EPG, reminders) on Android, Amazon, Windows and Mac shows listings taken from a proper published TV guide (the same data Sky/Freeview guides use), not just the playlist provider's own guide, which is often missing, wrong or an hour out.
- If the real guide has nothing for a channel, the app falls back to the provider's listing as it does today, so nothing goes blank.
- A new "Guide matching" page in the admin dashboard lists channels with their matched real guide channel, lets you fix or untick any match, and shows which channels have no real listings.

## How it works
1. BM Support downloads free public guides every 6 hours and stores 2 days of programmes, one feed per country: UK & Ireland, USA, Canada, Australia, plus overseas feeds for the countries in your playlist (e.g. Spain, Germany, France, Italy, Portugal, Netherlands, Poland, Arabic/beIN, India). Only countries that actually have channels in the playlist are downloaded, to keep it light.
2. Each playlist channel is matched automatically by name within its own country, using the playlist's country tag (e.g. "UK | Sky Sports Main Event FHD" -> UK Sky Sports Main Event, "US | ESPN" -> US ESPN, "CA | DAZN 1" -> Canada DAZN), so a US channel never picks up a UK channel's listings with the same name. Quality tags are ignored.
   - US channels are shown in UK time like everything else (no Eastern/Pacific mix-ups).
   - The admin page has a country filter and lets you add extra countries. Event-only and Replay feeds are skipped. Your manual fixes always win.
3. Players ask BM Support for a channel's listings; it sends the real guide when matched, otherwise the provider's. Times are stored in UTC and shown in UK time, so clock changes never shift them.
4. Sports Pass and event-only channels (DAZN, DAZN CA, UFC/Fight Pass, Peacock, BKFC, MonoMax events etc.) take their listings from the website Sports Guide: each event linked to that channel appears in the guide with its title, start and estimated/real finish time, and "No event scheduled" fills the gaps. If a real published guide also exists, the Sports Guide event wins during its time slot.
5. Sports Guide finish detection also uses the real guide, making "Finished" more accurate.

## Releases
- Website change publishes first; then Android 3.86, Windows 0.4.34 and Mac 0.1.43 so the apps read listings from BM Support.

## Technical details
- New tables `epg_channels`, `epg_programmes` (UTC start/stop, title, description), `epg_channel_map` (playlist name -> epg id, manual flag); RLS admin/management write, read via device-token player action.
- Scheduled server route `api/public/hooks/epg-import` (secret-checked) streams/parses XMLTV gzip, upserts, prunes >48h old.
- `player.ts` new `guide` action (batch up to 20 channels, 15-min shared cache); Android `GuideListings`, desktop guide fetch switch to it with provider fallback.
- `sports-programme-end.ts` reads the real guide first.
- Tests: name normaliser/matcher, UTC->UK conversion across BST change, fallback when unmatched.

## Unconfirmed
- Exact feed sources chosen after checking coverage per country (UK Sky/TNT, US networks/ESPN, Canada DAZN, overseas sports channels); some niche or foreign channels may have no real guide and keep provider listings.
- `epg_channels` gains a `country` column; matcher keys on country + normalised name.
