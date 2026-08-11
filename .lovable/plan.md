# Duels won (DUELW) is missing from the stats feed — not a forwards bug

## What I checked

I pulled the live stats feed for a real Middlesbrough Championship match and listed every stat it returns for every player in the squad (keeper, defenders, midfielders, forwards, subs). Every player gets exactly the same stat set:

```text
APP, FC, FA, OG, RC, SUB, YC, GA, SV, SHF, A, OF, SOG, G, SHOT
```

There is no DUELW for anybody — forwards included. I also tried the alternative match-report endpoints (web API summary, the match page, the CDN match feed) and searched them for "DUELW" / "duel": the value does not exist in any of them for Championship games. It only appears on ESPN's rendered match report for selected competitions.

The same applies to the other extended stats the bonus system reads: TCH (touches), AC.PASS, AC.LONG, PASS, PASS%, BCC, BCM, DINT, CC, UC, KS, SOGA. All of those currently resolve to 0 for every player, so those bonus rows can never score.

I also checked the stats table: it is empty (no 26/27 match has been played yet), so nothing has been recorded either way so far.

## What actually can be scored from the current feed

Minutes, goals, assists, saves, shots, shots on goal, shots faced, fouls for/against, offsides, cards, own goals, goals conceded (so clean sheets), penalties missed/saved from the timeline.

## Options

1. Trim the bonus list to what the feed really provides — remove or hide DUELW, TCH, AC.PASS, AC.LONG, PASS, BCC, BCM, DINT, CC, UC, KS, SOGA from Position bonus points, and rebuild the position tabs around the stats that do arrive (shots, shots on goal, shots faced, fouls, offsides, saves). Nothing silently scores zero.
2. Keep the rules but mark unavailable stats — leave the rules in place, flag the ones with no data source as "not currently tracked" in the UI so expectations are clear, and let them start scoring if a feed appears.
3. Add a second data provider for advanced stats — a paid/keyed football data API (e.g. API-Football / Sportmonks-style) that exposes duels, touches and passing per player, used only to fill the extended columns while ESPN keeps supplying goals/cards/minutes. Needs an API key and a monthly cost.
4. Enter the extended stats by hand — an admin screen to type duels won, touches, passes etc. per player after each game, then re-score the gameweek.

## Technical notes

- Parsing lives in `src/lib/fantasy-live-stats.server.ts`; extended stats are read with `abbrVal(rp, "DUELW")` etc., which returns 0 when the abbreviation is absent — that is why the failure is silent rather than an error.
- The rule list and UI copy live in `src/lib/fantasy-rules.ts` and `src/routes/boro-fantasy.tsx`; scoring itself is the `fantasy_points_for` Postgres function driven by `fantasy_scoring_rules`, so disabling a rule there is enough to stop it counting.
