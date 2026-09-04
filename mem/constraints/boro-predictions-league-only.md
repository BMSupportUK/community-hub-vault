---
name: Boro score predictions are league-only
description: Boro score predictions game must only ever include Championship fixtures — no cup or friendly games, ever
type: constraint
---

The Boro score predictions game (`/boro-predictions`, `boro_predictions`) covers **Championship fixtures only**. Cup ties (League Cup, FA Cup), play-offs and friendlies must never appear or be predictable.

Enforced in three places — do not weaken any of them:
- `listBoroFixtures` (`src/lib/boro-predictions.functions.ts`) and `listBoroFixturesPublic` (`src/lib/boro-guest.functions.ts`) filter `competition = 'Championship'`.
- Both upsert paths reject a fixture whose competition is not `Championship`.
- DB trigger `boro_predictions_league_only_trg` on `public.boro_predictions` raises an exception for any non-Championship fixture, and `boro_leaderboard` only counts Championship fixtures.

**Why:** the user has repeatedly stated the predictor is a league-only competition; cup games leaking in corrupts the leaderboard.
