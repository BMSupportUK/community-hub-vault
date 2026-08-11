# Scoring dual-position players by the slot they were picked in

Today every player is scored from their single listed position in `fantasy_players.position`, so Conway (FWD/MID) scores 4 for a goal and no clean sheet even when a manager plays him in midfield. Points are also stored once per player per fixture, shared by all squads, so there is currently no way for two managers to get different points for the same player.

The rule going forward: **a player is scored in the position of the slot you picked him in.**

## How it will work

- When you save a match day squad, each pick records which position that slot was — GK, DEF, MID or FWD.
- On a flexible slot (for example the three behind the striker in 4-2-3-1, labelled MID / FWD) the slot takes the player's main listed position when that fits the slot, otherwise his second position. A small toggle on those slots lets you pick which of the two he plays as, so you control whether he is scored as a midfielder or a forward.
- Bench players are recorded in their main listed position; if they come on they are scored in that position, with the usual sub bonuses.
- Points are then worked out per manager, so two managers who play Conway in different roles legitimately end up with different points for him.
- Existing saved squads with no recorded slot position fall back to the player's listed position, exactly as they score today.

## Rules and display

- Game rules gain a line: "Players who can play in two positions are scored in the position you pick them in — a midfield slot pays midfielder points (5 a goal, clean sheet point), a forward slot pays forward points."
- The pitch and picker keep showing the combined badge (e.g. FWD/MID) and additionally show which position the slot is scoring as.

## Technical detail

- Migration: add `picked_position text` to `fantasy_squad_picks` (nullable, checked against gk/def/mid/fwd).
- `fantasy_score_gameweek` stops reading the shared `fantasy_player_stats.points` for squad totals and instead calls `fantasy_calc_points(COALESCE(sp.picked_position, p.position), st.minutes, st.goals, ...)` per pick. `fantasy_player_stats.points` stays as the informational listed-position value used by season/player displays. Goals-conceded and clean-sheet handling must use the picked position too, so a DEF-slot player gets clean sheets and concede penalties while a MID-slot player gets the midfielder clean-sheet point. Saves and penalty saves stay goalkeeper-only.
- `fantasy_player_stats` currently zeroes `goals_conceded` for non-GK/DEF players in `src/lib/fantasy-live-stats.server.ts`; that must store the real value so a player picked in a defensive slot can be penalised. The scoring function decides whether it applies.
- `src/lib/fantasy.server.ts` save path writes `picked_position` for XI slots (resolved from `formationRows` + `playerPositions`) and bench slots (primary position); the DTO returns it so the UI can show the scoring position. Validators in `src/lib/fantasy.functions.ts` and `src/lib/fantasy-guest.functions.ts` accept the new per-slot value.
- `src/routes/boro-fantasy.tsx` keeps the picked position in draft state, adds the flexible-slot toggle, and shows the scoring position on the card.
- `src/lib/fantasy-rules.ts` gains a `resolveSlotPosition(rowPositions, player)` helper plus the new rules copy.
- Re-run scoring for already-finished gameweeks so totals stay consistent after the change.
