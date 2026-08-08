# MFC Fantasy Manager

A Middlesbrough-only fantasy football game at `/boro-fantasy`, built to match the look and tab structure of the existing Boro predictor (Squad, Fixtures/Gameweeks, Leaderboard, Scoring, Transfers, Winners).

## How the game works

- **Player pool**: the Middlesbrough first-team squad only, each with a position (GK/DEF/MID/FWD) and a value.
- **Budget**: £30.0m. Player values scaled to Boro reality — roughly £3.0m for fringe players up to £8.5m for the best performers.
- **Squad**: 15 players — 2 GK, 5 DEF, 5 MID, 3 FWD. Max 15 outfield picks total, no club-limit rule needed (single club).
- **Formations**: pick a starting XI in one of 1-4-4-2, 1-4-3-3, 1-3-5-2, 1-5-3-2, 1-4-5-1, 1-3-4-3. Bench of 4 in priority order, auto-subs applied when a starter doesn't play.
- **Captain + vice**: captain scores double; vice takes over if the captain doesn't play.
- **Lock**: squad and transfers lock 60 minutes before the gameweek's first Boro kick-off (same countdown pill style as the predictor).

## Scoring (Scoring tab shows this table)

| Event | Points |
| --- | --- |
| Played up to 60 mins | 1 |
| Played 60+ mins | 2 |
| Goal — GK/DEF | 6 |
| Goal — MID | 5 |
| Goal — FWD | 4 |
| Assist | 3 |
| Clean sheet — GK/DEF (60+ mins) | 4 |
| Clean sheet — MID | 1 |
| Every 3 saves — GK | 1 |
| Penalty save | 5 |
| Penalty miss | -2 |
| Every 2 goals conceded — GK/DEF | -1 |
| Yellow card | -1 |
| Red card | -3 |
| Own goal | -2 |
| Motm bonus (admin awarded) | 3 |

Captain doubles the player's total. Bench points only count via auto-subs.

## Transfers

Two separate things, both requested:

1. **Manager transfers** — 1 free transfer per gameweek, rolls over to a max of 2 stored. Extra transfers cost -4 points each. Unlimited free transfers before gameweek 1 locks, plus one wildcard per season.
2. **Real MFC transfer feed** — an admin transfer log (player, in/out, fee, date, window). Incoming signings are added to the player pool and become available to pick from the next gameweek; outgoing players are marked departed, keep any points already scored, and any manager holding them gets a free forced replacement that doesn't count against their transfer allowance. The Transfers tab shows the real ins/outs feed plus the manager's own transfer history.

## Admin

New admin page (admin/management only), reachable from the admin dashboard:

- **Squad manager**: add/edit players, position, shirt number, value, availability (injured/suspended/departed).
- **Gameweeks**: create a gameweek from existing `boro_fixtures`, open/lock/finalise it.
- **Stat entry**: per fixture, a table of every squad player with columns for minutes, goals, assists, clean sheet, saves, pens saved/missed, goals conceded, yellows, reds, own goals, bonus. Save recalculates all points for that gameweek and refreshes the leaderboard.
- **Transfer log**: record real incoming/outgoing transfers.
- **Winners**: reuse the existing announce/confirm/voucher flow.

## Entry, leaderboard and winners

- Same access model as the Boro predictor: signed-in members join free, plus guest entry with email + PIN.
- Leaderboard: total points, gameweek points, transfers made, points hits, with emails visible to admin/management only (matching the predictor).
- Winners tab: reuses the existing `WinnersTab` component and `prediction_winners` table under a new `mfcfantasy2627` competition key, so podium, confetti, winner email confirmation and voucher-sent tracking all work with no new logic.
- Registered in `src/lib/competitions.ts` so it appears in the side rail and moves into Competition Winners automatically once finished.

## Technical notes

New tables (all with grants + RLS): `fantasy_players`, `fantasy_gameweeks`, `fantasy_entrants`, `fantasy_guest_entrants`, `fantasy_squads` (one per entrant per gameweek: formation, captain, vice, bench order, points, transfer cost), `fantasy_squad_picks`, `fantasy_player_stats` (per player per fixture), `fantasy_transfers` (manager moves), `fantasy_club_transfers` (real ins/outs). Read policies allow entrants to see their own squad before lock and all squads after lock; stat and player writes are admin/management only.

Scoring runs in a Postgres function `fantasy_score_gameweek(_gameweek_id)` so recalculation is atomic, mirroring `boro_score_fixture`. A `fantasy_leaderboard` view aggregates totals, read through an admin client the same way the Boro leaderboard is.

Frontend: `src/routes/boro-fantasy.tsx` (public route, guest-capable, mirrors the predictor layout and side rail), `src/lib/fantasy.functions.ts` + `src/lib/fantasy-guest.functions.ts` for server functions, a `PitchView` component for the formation drag/tap picker, and `src/routes/_authenticated/_approved/admin-fantasy.tsx` for admin.

Initial player pool and values are seeded in the migration from the current Boro squad; admin can adjust any value afterwards.
