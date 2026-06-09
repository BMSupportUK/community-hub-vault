## World Cup 2026 Score Prediction Competition

A subscriber-only competition where members predict scores for every World Cup 2026 fixture and earn points toward a global leaderboard.

### Scoring (Goals + Result)
- **5 pts** — exact score (e.g. predict 2-1, actual 2-1)
- **3 pts** — correct result + correct goal difference (e.g. predict 3-2, actual 2-1)
- **1 pt** — correct result only (win / draw / loss)
- **0 pts** — wrong result

### Who can play
Only users with `subscriber` or `member` roles. Pending / nonsubscriber users see a "subscribe to enter" prompt. Admin/management/staff can view but predictions are scored normally if they have a subscriber role too.

### Fixtures
- Pre-seeded with the 72 group-stage matches (12 groups × 6 games), kickoff times in UTC.
- Knockout fixtures (Round of 32 → Final, 32 games) added by admin once draws are known.
- Each fixture has: home team, away team, kickoff time, stage (group / R32 / R16 / QF / SF / 3rd / Final), optional group label, final score (nullable).

### User experience
- New `/predictions` route (under `_authenticated/_approved`):
  - **Fixtures tab** — upcoming matches grouped by date. Each card shows teams, kickoff (in user's TZ), and two score inputs. Predictions lock at kickoff. After kickoff, shows the user's prediction + final score + points earned (greyed out if no prediction).
  - **Leaderboard tab** — ranked list of subscribers with total points, predictions made, exact scores, correct results. Highlights current user.
  - **My predictions tab** — full history of the user's picks with per-match points.
- Nav entry "World Cup 2026" with a trophy icon, visible only to subscribers.

### Admin experience
- New `/admin/predictions` page (admin/management only):
  - Add / edit / delete fixtures (form with team, stage, kickoff, group).
  - Enter final scores — saving a score triggers point recalculation for that fixture.
  - "Recalculate all scores" button (safety net).
  - View total entries and basic stats.

### Locking & scoring rules
- Predictions can be created or edited any time **before kickoff**. Server enforces this (rejects writes when `now() >= kickoff_at`).
- Scoring runs server-side when admin enters a final score; results are stored on the prediction row so the leaderboard is a cheap aggregate query.

### Technical details

**Database** (new tables, all under `public`):

```
wc_fixtures
  id uuid pk
  stage text ('group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final')
  group_label text null
  home_team text, away_team text
  kickoff_at timestamptz
  home_score int null, away_score int null
  created_at, updated_at

wc_predictions
  id uuid pk
  user_id uuid -> auth.users
  fixture_id uuid -> wc_fixtures
  home_pred int, away_pred int
  points int null              -- null until fixture scored
  created_at, updated_at
  unique (user_id, fixture_id)
```

RLS + GRANTs:
- `wc_fixtures`: anyone signed in can `SELECT`; only admin/management can write (via `has_role`).
- `wc_predictions`: user can `SELECT/INSERT/UPDATE` their own rows where `auth.uid() = user_id` AND fixture kickoff is in the future for writes; admin/management can `SELECT` all (for leaderboard aggregation).
- Standard `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role`.

A `wc_leaderboard` SQL view aggregates `(user_id, total_points, exact_count, result_count, predictions_made)` joined with `profiles` for display names.

**Server functions** (`src/lib/wc-predictions.functions.ts`):
- `listFixtures()` — auth required, returns fixtures with the caller's prediction merged in.
- `upsertPrediction({ fixtureId, home, away })` — auth + subscriber role, rejects if past kickoff.
- `getLeaderboard()` — auth required, reads the view.
- `adminUpsertFixture(...)`, `adminDeleteFixture(id)`, `adminSetResult({ fixtureId, home, away })` — admin/management only; setting a result recomputes `points` for every prediction on that fixture in one SQL statement.

**Routes**:
- `src/routes/_authenticated/_approved/predictions.tsx` — tabs (fixtures / leaderboard / my picks).
- `src/routes/_authenticated/_approved/admin.predictions.tsx` — admin tools, gated with `hasRole('admin' | 'management')`.

**Seed data**: a single migration inserts all 48 teams' group-stage fixtures with kickoff times (UTC). I'll use the published FIFA group draw / schedule for 2026 (groups A–L, 72 matches, June 11 – June 27, 2026).

**Nav**: add a "World Cup 2026" entry to the approved-user sidebar, conditional on `hasAnyRole(['subscriber', 'member', 'admin', 'management', 'staff', 'moderator'])`.

### Out of scope (per your choice)
No knockout bonus, no top-scorer/champion picks, no mini-leagues. We can add any of these later.
