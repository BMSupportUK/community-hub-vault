# Match centre: use the full ESPN Gamecast feed

## What I checked

I queried ESPN's live summary feed directly for a Boro fixture (Lincoln City v Middlesbrough, 15 Aug) and for finished Championship games, and compared what the feed returns against what our code reads.

## Answer: no — we are only reading part of it

Both the match centre tabs and the auto-posting forum bot read `header.competitions[0].details`. On a finished game that array held only 3 entries (goals and cards). The Gamecast-grade feed is `keyEvents`, which held 23 entries for the same match: kickoff, goals with full narrative text ("Goal! Derby County 1, Sheffield United 0. Sam Szmodics, right footed shot from close range following a corner"), cards, substitutions, penalties and a `shootout` flag.

Confirmed gaps today:

- Substitutions never appear in Match action (they are not in `details` at all).
- Goals arrive with no type text, so they render as the generic word "Event" instead of "Goal - Volley" / scorer narrative.
- No penalty-shootout handling in the tabs feed.
- Player stat columns include `offsides`, which ESPN does not return per player, so it always shows 0; ESPN does return `shotsFaced`, `subIns`, `ownGoals`, `foulsSuffered` which we partly ignore.
- Team stats: ESPN returns 28 per team and we dump all of them unfiltered, including raw keys like `shotPct` with an ugly auto label.

One thing that is not a bug: before kick-off ESPN returns empty rosters, zero team stats and no events for the fixture. There is genuinely nothing to pull until roughly an hour before kick-off, so the pre-game placeholder tables we just added are the right behaviour.

## What I propose to change

1. **Switch the match-detail feed to `keyEvents`**, falling back to `details` when `keyEvents` is absent. Map goal/own goal/penalty/yellow/red/sub/VAR/shootout types, keep the narrative `text` and `shortText`, and use `period` + `clock` (plus added time) for the timeline.
2. **Show substitutions properly** in Match action (player off / player on, with the green in / red out styling already present).
3. **Handle penalty shootouts** — group `shootout: true` events into a shootout section with the running score.
4. **Fix player stat columns** to the keys ESPN actually returns: G, A, SH, SOT, FC, FS, YC, RC, SV, GC, plus own goals and sub-ins; drop per-player offsides.
5. **Curate team stats** into a fixed, readable order (possession, shots, on target, corners, fouls, offsides, cards, saves, pass accuracy) with proper labels, and hide the noisy raw keys behind a "more stats" toggle.
6. **Point the forum auto-poster at the same `keyEvents` parser** so goals, scorers, cards, penalties and subs posted to the match day thread match exactly what the match centre shows, keeping the existing fingerprint/"Updated:" correction logic.

## Technical notes

- `src/lib/boro-match-detail.functions.ts`: new `keyEvents` parser, extended `MatchEventItem` (period, narrative text, shootout flag, subs in/out names), curated team-stat ordering.
- `src/components/app/BoroMatchDetailTabs.tsx`: render narrative text, sub rows, shootout block, corrected stat columns, "more stats" toggle.
- `src/lib/boro-match-events.server.ts`: share the same event-normalising helper so forum replies and the match centre never disagree.
- No database or schema changes needed.
