# Boro 26/27 Predictions Game

Duplicate the existing World Cup predictions feature into a parallel "Boro 26/27" game using the same scoring rules, guest sign-up flow, reminders, and admin tools, but driven off Middlesbrough F.C.'s 2026/27 fixtures. Fixtures/results are grouped by calendar month instead of stage/group.

## What gets built

### Database (mirrors wc_* tables)
New tables under `public.`:
- `boro_fixtures` — `competition` (Championship / FA Cup / EFL Cup / Playoff), `home_team`, `away_team`, `kickoff_at`, `home_score`, `away_score`, `status`, `minute`, `minute_added`, `venue`, `month_key` (generated `YYYY-MM` in Europe/London for sort/group)
- `boro_entrants` — same shape as `wc_entrants`
- `boro_guest_entrants` — same shape as `wc_guest_entrants` (email + display name + PIN)
- `boro_predictions` — `user_id` xor `guest_id`, `fixture_id`, `home_pred`, `away_pred`, `points`
- `boro_prediction_reminders` — dedupe table for daily reminder emails
- RLS + GRANTs identical to the WC versions (anon select on fixtures, owner-only writes on predictions, admin/management can see all)
- Scoring trigger duplicated: exact score = 5, correct result + GD = 3, correct result = 1
- `get_boro_reminder_recipients()` RPC mirroring the WC one

### Server functions (`src/lib/boro-predictions.functions.ts`, `src/lib/boro-guest.functions.ts`)
Direct copies of `wc-predictions.functions.ts` and `wc-guest.functions.ts` retargeted to the `boro_*` tables. Same API surface so the UI work is mostly a search/replace:
- list fixtures, list my predictions, upsert prediction, leaderboard, admin score sync
- guest sign-up / login / PIN reset using the existing `notify.bmsupport.uk` sender
- `requireSupabaseAuth` on user-only endpoints; guest endpoints stay public + PIN-gated

### UI — new route `/boro-predictions`
- New route file `src/routes/boro-predictions.tsx`, structurally identical to `src/routes/predictions.tsx`, but:
  - Fixtures + Results tabs group rows by **month** (e.g. "August 2026", "September 2026") instead of by stage/group
  - Sort ascending for upcoming, descending for results
  - Page title, copy, and email subjects say "Boro 26/27 Predictions"
  - Existing "Predictions Entered" header + centred column layout carried over
  - Delete-user confirmation dialog carried over
- Add a nav entry next to the existing Predictions link

### Email + cron
- New template `src/lib/email-templates/boro-prediction-reminder.tsx` (same layout as WC reminder, Boro wording)
- New public hook `src/routes/api/public/hooks/boro-prediction-reminders.ts` (clone of the WC one) wired to the new RPC + dedupe table
- Reuses existing `notify.bmsupport.uk` sender — no new domain setup

### Fixtures seed
- Schema + empty tables only. I will NOT seed the 26/27 fixture list automatically — once you confirm the source (official Boro site CSV, or you type them in via an admin screen) I'll add them. The admin fixture editor mirrors the WC one so you can paste them in.

## Out of scope (ask before doing)
- Pulling live Boro scores from ESPN/another provider for auto-sync — current WC sync uses a FIFA feed. Say the word and I'll wire ESPN's eng.2 schedule (already used by the match-centre widget) into a `sync-boro-scores` cron.
- Changing the existing WC game in any way.

## File list
- migration: new `boro_*` tables, RLS, GRANTs, scoring trigger, reminder RPC
- new: `src/lib/boro-predictions.functions.ts`
- new: `src/lib/boro-guest.functions.ts`
- new: `src/lib/email-templates/boro-prediction-reminder.tsx`
- new: `src/routes/boro-predictions.tsx`
- new: `src/routes/api/public/hooks/boro-prediction-reminders.ts`
- edit: nav (wherever the Predictions link lives) to add "Boro 26/27"
- edit: `src/lib/email-templates/registry.ts` to register the new template
