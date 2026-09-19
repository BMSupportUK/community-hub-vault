# Live scores and fantasy stats: 10-second freshness

## What you'll get

- Scores, minute and match events update within about 10 seconds of them happening on FotMob.
- Fantasy points move during the match instead of only settling at full time.
- Everything keeps coming straight from FotMob's own feed (no change of provider, no cost). The mirror routes stay where they belong: reading the club's X posts for team sheets only.

## What is slowing things down today

Match data is already read directly from FotMob, so the lag comes from how long each answer is held onto and how often it's refreshed:

- The FotMob reads are cached for 15-30 seconds, and the team feed for 30 seconds.
- The background job that writes scores into the database runs once a minute, so the database (which fantasy scoring reads) can trail by up to a minute.
- The match centre card on screen refreshes once a minute.

## Changes

1. **Live-aware caching**
   In the shared FotMob reader, add a "live" mode with a 3-5 second hold instead of 15-30 seconds, used whenever a Boro match is in play. Outside match time the longer holds stay, so we don't hammer the feed for no reason.

2. **Database sync tracks the match**
   The scores sync endpoint gains an optional repeat mode: when a match is in play, one invocation performs several passes about 10 seconds apart for roughly a minute, so consecutive scheduled runs give continuous ~10 second coverage. When no match is live it does a single pass exactly as now, so nothing extra runs on quiet days.

3. **Fantasy stats live**
   The live-scoring path pulls player stats and re-scores the locked gameweek on each of those passes, so goals, assists, cards and minutes show up as they happen. Gameweeks still only become final once the fixture is confirmed finished, and the existing scoring rules (one star bonus, exact half points, substitute handling) are untouched.

4. **Screens refresh at 10 seconds**
   The match centre card drops from 60 seconds to 10 while a match is in play, the live strip's in-play poll moves from 8 to 10 seconds, and the fantasy squad/leaderboard views refresh on the same 10-second beat during a live match. All of them go back to the slow pace when nothing is on.

5. **Stale data safety**
   The existing 15-minute "last known good" fallback stays for feed outages, but a live match will never prefer a cached answer over a fresh one, and the on-screen minute/score will not be rewound by an older snapshot.

## Technical notes

- `src/lib/fotmob-fetch.ts`: add a live TTL path (3-5s) and a helper to decide live state; keep `servedLastGood` as outage-only fallback.
- `src/routes/api/public/hooks/sync-boro-scores.ts`: wrap the existing `syncBoroScores()` body in a loop driven by a live check, with `pg_sleep`-free in-worker waits, bounded so the request stays well inside the worker time limit; single pass when nothing is live. Keep its stagger in the cron schedule.
- `src/lib/fantasy-live-stats.server.ts`: keep `fantasy_score_gameweek` on the live path; no change to scoring maths or to the `FINISHED`/`final` transition rules.
- `src/components/app/BoroMatchCentreBox.tsx` and `BoroLiveMatchStrip.tsx`: live-aware poll intervals; fantasy route queries get matching intervals.
- Talk/ticket channel code and the locked team-sheet path are not touched.
