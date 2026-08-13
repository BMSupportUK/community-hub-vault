# Fix: match centre tabs missing before kick-off

## What's actually wrong

The armed tabs were built, but the pop-up only renders them when the fixture carries an ESPN match id:

- `src/components/app/BoroLiveMatchStrip.tsx` wraps the tabs in `{m.eventId && ...}`.
- The cached next fixture in `boro_match_centre` right now is `Middlesbrough v Lincoln City, 15 Aug 14:00` with **no `eventId`, no `espnSlug` and no logos** — it was filled from our own fixtures table, not from the ESPN scoreboard.

So with no id, the whole tabs block is skipped and the pop-up shows only the header. Nothing to do with kick-off timing.

## Fix

1. **Always render the tabs.** Drop the `m.eventId` gate. When there is no id yet, the tabs still mount and show the armed state: "Match action — awaiting first entry", the placeholder stats table, and the placeholder XI tables, with the "Armed and ready / Kick-off in Xh Ym" banner.
2. **Resolve the ESPN event for upcoming fixtures.** In `src/lib/boro-match-centre.functions.ts`, when the next fixture comes from our fixtures table (or a manual entry) and has no `eventId`, look it up on the ESPN scoreboard feeds already used (`eng.2`, `eng.fa`, `eng.league_cup`, `eng.efl_trophy`) by kick-off date and team names, then cache `eventId`, `espnSlug` and both team logos onto the stored `next_fixture`. This is the same matcher the events poster uses.
3. **Make the tabs tolerate a missing id.** `BoroMatchDetailTabs` takes `eventId` as optional: with no id it skips the fetch, keeps the pre-match banner and placeholders, and starts polling as soon as an id arrives (the strip refreshes every 5 minutes, every 20s when live).
4. **Pre-match copy.** Placeholder lines read "Awaiting line-ups — published about an hour before kick-off" and "Awaiting stats — recording starts at kick-off", so it's clear the feed is armed rather than broken.

## Technical notes

- Files touched: `src/components/app/BoroLiveMatchStrip.tsx`, `src/components/app/BoroMatchDetailTabs.tsx`, `src/lib/boro-match-centre.functions.ts`.
- The ESPN lookup runs server-side inside the existing match-centre refresh path, so it's cached in `boro_match_centre` and not re-fetched per viewer.
- Kick-off is also passed for the live and last-result cases so the banner/countdown logic has a time source in every state.
