# Injury icons for the Fantasy Manager

## Source: the official EFL Fantasy feed

Checked live — `fantasy.efl.com` publishes a public players feed with real
injury data for Middlesbrough right now, e.g.:

- R. McGree — Hamstring, expected back 16 Aug
- A. Jones — Muscle Injury, expected back 16 Aug
- A. Bangura — Hamstring, "Out (0%)"
- Morris, Peart-Harris, Strelec, Conway — Knock / Ankle

It also flags suspensions the same way, so we get both for free. This is the
automatic source; admins keep a manual override for anything the feed misses.

## What you'll see

- A red cross/plaster icon next to injured players in:
  - the pitch view (starting XI and bench cards)
  - the player picker pop-up (all tabs — first team, U21, U18)
  - the squad/leaderboard lists where a player name is shown
- Hover or tap shows the injury type, expected return date, and whether it came
  from the EFL feed or an admin.
- Suspended players get their own amber icon with the same tooltip treatment.
- Injured players stay **pickable**: choosing one shows a warning toast
  ("Marked injured — pick at your own risk") and the icon stays on the card.
- Two levels, different colours: doubtful/knock (amber) and out/injured (red).

## Admin control

New Admin entry: **Fantasy injuries**. Lists the whole squad with a search box
and lets admin/management:
- mark a player doubtful or out, with a note and optional expected return
- clear an injury
- see which entries came from the EFL feed automatically

Manual entries win over the feed and are never overwritten by a sync until an
admin clears them.

## Technical notes

Database (one migration on `fantasy_players`):
- `injury_status text` — `none` | `doubtful` | `out` | `suspended` (default `none`)
- `injury_note text`, `injury_return text` (nullable free text)
- `injury_source text` — `feed` | `admin`
- `injury_updated_at timestamptz`
No new table, so existing grants/policies stand; writes go through admin server
functions only.

Feed sync — new `src/lib/efl-fantasy-injuries.server.ts`:
- GET `https://fantasy.efl.com/json/fantasy/players.json` (gzip, no auth),
  filter `squadId === 25` (Middlesbrough)
- map `status` (`injured` / `suspended`) plus `injuryDetails.type`,
  `expectedEndDate`, `status` into our `injury_status` / `injury_note` /
  `injury_return`
- treat a short-term `Knock` with a near return date as `doubtful`, anything
  else injured as `out`
- match to `fantasy_players` by surname + first-initial (feed names are
  abbreviated, "R. McGree"), reusing the existing `samePerson` helper in
  `src/lib/fantasy-squad-sync.server.ts`
- only touch rows where `injury_source <> 'admin'`; clear feed-set injuries when
  the player reads clean again
- called from the existing throttled `/api/public/hooks/fantasy-squad-sync`
  hook, so no new schedule

Server functions (`src/lib/fantasy.functions.ts`): `adminSetFantasyInjury`
(role-checked via `has_role` for admin/management), plus injury fields added to
the player payload built in `src/lib/fantasy.server.ts`.

UI (`src/routes/boro-fantasy.tsx`): a shared `InjuryIcon` component used in the
pitch slot cards and `PlayerPickerDialog`; selection stays allowed, with a
warning toast in the pick handler alongside the existing departed/loaned checks.

New admin route `src/routes/_authenticated/_approved/admin-fantasy-injuries.tsx`,
linked from the admin dashboard next to Fantasy Man of the Match.

Game rules text gets one line explaining injured players are flagged from the
official EFL Fantasy feed but still selectable at your own risk.
