# Show "Finished" on sports guide games

## What we know
The sports guides only give a start time for each game, never an end time. Right now a game stays on the guide for up to 6 hours after it starts, so games that have finished still look current.

## Where an end time can come from (best first)
1. **The channel's TV guide (EPG).** Each game is linked to real channels, and the playlist's TV guide has the start and end time of the programme on that channel. When that programme ends, the game has finished. This is the most accurate source, but only for channels that carry guide data. Many event-only feeds (Cymru TV Event, DAZN, Paramount+ event feeds) show no guide entries or just a placeholder.
2. **Typical length per sport (fallback).** If there's no guide entry, use a standard length for the sport: football 2h, rugby 2h, cricket 8h, F1/motorsport 2.5h, boxing/UFC 5h, darts/snooker 4h, tennis 3h, NFL 3.5h, NBA/NHL 2.5h, anything else 3h. After that time the game is marked finished.

No free official live results feed covers all of these sports, so we won't guess scores or results.

## What members will see
- Before kick-off: the start time, as it is now.
- During the game: a **LIVE** badge.
- After the end time: a grey **Finished** badge. The card is dimmed and moved to the bottom of that day. It drops off the guide 2 hours later.
- Same on the website guide, Android/Amazon, Windows and Mac.

## Technical details
- `src/lib/player-sports.ts`: add `end` (ms) and `endSource` ("epg" | "estimate") to each card. The estimate uses a sport-to-length map; the EPG end comes from the playlist guide data (provider `get_short_epg` via `playlist-source.server.ts`, cached for 10 minutes) for the card's first matched channel when that programme overlaps the start time. Card removal moves to `end + 2h`, replacing the fixed 6-hour window.
- Player API sends `end`. Apps compute LIVE/Finished from the device clock, so no further app update is needed if the lengths change.
- Public website sports guide cards show the same badge.
- Android 3.64, Windows 0.4.26 and Mac release with the badge and the sorting.
- Tests: football starting 15:00 is finished at 17:01; an EPG end time beats the estimate; a finished card drops off at end + 2h.
