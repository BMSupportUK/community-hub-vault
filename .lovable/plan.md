# BM Player: Sports Guide

## What customers get
- A new **Sports** tile on the BM Player front screen (same on TV, Fire TV, phone), beside Live TV / Films / Series.
- It lists today's and upcoming events from the website's published sports guides: sport, event name, UK kick-off time (plus local time if different), and the listed channels.
- Grouped by day, then by sport; events already finished drop off; "LIVE NOW" badge on events in progress.
- Each listed channel is a button. Pressing it plays that channel straight away (built-in player or VLC, per their setting). Channels the app can't find in the customer's playlist are shown greyed with "Not in your list".
- Updates on its own: when staff publish or edit a guide on the website, open apps pick it up within about a minute; there's also a Refresh button like the other tiles.

## Matching guide channels to playlist channels
Guide names ("Sky Sports Main Event", "TNT Sports 1") rarely match playlist names exactly ("UK: SKY SPORTS MAIN EVENT FHD"). The app will:
1. Normalise both (drop country prefixes, HD/FHD/UHD/4K tags, punctuation, "channel" words).
2. Use a small shared alias list (e.g. "Sky Sports PL" = "Sky Sports Premier League", "TNT" = "BT Sport" names).
3. Prefer an exact normalised match, then best partial; if several qualities exist, prefer FHD/HD, then show a small picker.
4. Admin can add aliases in the BM Player DNS page ("Channel matching" box) for names that still don't match — no app update needed.

## Technical details
- New `action: "sports"` on `/api/public/player` (device-token auth, like poll): returns published sports guide events from now-6h to +7 days, parsed with the existing sports listing parser (validated date/time/event/channels only, per the public-guide rule), plus a version stamp and the alias list.
- Aliases stored in `player_settings` as a new `channel_aliases` jsonb column (admin-only write via `savePlayerChannelAliases` server fn).
- App polls `sports` every 60s while the Sports screen is open, and on open; skips re-render if the version stamp is unchanged. Caches the last copy for offline/fast open.
- Matching runs on the device against the cached live channel list; a shared `normalizeChannelName` rule set is mirrored in a TS helper with tests (`tests/player-channel-match.test.ts`) so the website and app agree.
- BM Player 1.4: versionCode 5, same BM key, uploaded as a new `bm-player/` build so 1.3 devices get "Update now".

## Not included
- No changes to the website's sports guide pages or the import tool.
