# Fix the "How scoring works" text on the Scoring tab

## Problem
The intro paragraph on the Scoring tab wrongly says minutes decide which column a player scores from ("Subs who play score too: under 60 minutes they use the sub scoring column below, while 60 minutes or more is scored at the full match day 11 rate").

That is not the game's rule. The rule is: **where you named the player decides the rate** — anyone in the match day 11 scores full points, anyone who comes off the bench scores half. Minutes only matter for the clean-sheet rows (60+ mins vs under 60 mins).

## Change
Rewrite that sentence in the Scoring tab intro so it reads correctly:

- Match day 11 players who feature score the full rate — 2 points for the appearance plus full points for every match stat.
- Subs who come off the bench score 1 point for the appearance plus half points for every stat, no matter how many minutes they play.
- Starters who don't get on, and unused subs, score 0.
- Minutes only affect the clean-sheet rows (60+ mins pays more than under 60 mins).

Nothing else in the paragraph changes; captain/vice and dual-position wording stay as they are. No point values, database rules or scoring engine changes — this is text only.

## Technical detail
Single edit to the `ScoringTab` intro paragraph in `src/routes/boro-fantasy.tsx` (around lines 3151-3159).
