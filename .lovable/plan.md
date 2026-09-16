# Keep exact half-points for fantasy substitutes

## Result
- Substitute scores keep their exact half-points instead of rounding to whole numbers.
- Kyle Joseph’s example becomes **2.5 points**: 1 appearance point + 0.5 for the shot + 1 for the shot on goal.
- Captain doubling, gameweek totals, and the leaderboard all support `.5` and `.25` values correctly.
- The player popup shows the same exact total as the awarded score and removes all “rounded” wording.

## Changes
- Change stored player-pick and squad totals from whole numbers to decimal point values.
- Change the central fantasy scoring function to return the exact calculation without rounding.
- Update the gameweek scorer and leaderboard totals to preserve decimals throughout.
- Recalculate every gameweek that already has recorded match stats so previous scores and leaderboard totals are corrected.
- Update the Game rules and Scoring text to state that substitute points are halved exactly and are not rounded.

## Validation
- Compare every saved squad pick against the scoring function after recalculation.
- Confirm squad totals equal their picks, captain bonus, and any transfer deduction.
- Check Kyle Joseph’s Millwall popup and saved pick both show 2.5 points.
- Check the current app build and fantasy screens for errors.
