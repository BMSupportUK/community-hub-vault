# Injury icons for the Fantasy Manager

## Answer first: does the football feed carry injuries?

Yes — the same feed already used for scores and squad sync exposes a per-player
`status` ("Active", "Injured", "Out"…) plus an `injuries` list with a description
(e.g. hamstring) and a return note. Checked live for Middlesbrough: the fields
exist, but right now every player reads Active and the injury list is empty, so
coverage for the Championship is thin out of season. So the plan uses the feed as
the automatic source **and** gives admins a manual override, which is what makes
it reliable in practice.

## What you'll see

- A red cross/plaster icon next to injured players in:
  - the pitch view (starting XI and bench cards)
  - the player picker pop-up (all tabs — first team, U21, U18)
  - the squad/leaderboard player lists where a player name is shown
- Hovering (or tapping) the icon shows what's wrong and when they're expected
  back, plus where the info came from (feed or admin).
- Injured players stay **pickable**: choosing one shows a warning toast
  ("Marked injured — pick at your own risk") and the icon stays on the card so
  you know before the deadline.
- Two levels, different colours: doubtful/questionable (amber) and out/injured
  (red).

## Admin control

New Admin entry: **Fantasy injuries**. Lists the whole squad with a search box
and lets admin/management:
- mark a player doubtful or out, with a short note and optional expected return
- clear an injury
- see which entries came from the feed automatically

Manual entries win over the feed and are never overwritten by a sync, until an
admin clears them.

## Technical notes

Database (one migration on `fantasy_players`):
- `injury_status text` — `none` | `doubtful` | `out` (default `none`)
- `injury_note text`, `injury_return text` (free text, both nullable)
- `injury_source text` — `feed` | `admin`
- `injury_updated_at timestamptz`
No new table, so existing grants/policies stand; writes go through admin server
functions only.

Feed sync (`src/lib/fantasy-squad-sync.server.ts` + `mfc-official-squad.server.ts`):
- read the team roster endpoint with `enable=roster`, map each athlete's
  `status.type` / `injuries[0]` to `doubtful` / `out` with description and
  return detail
- match to `fantasy_players` on `mfc_player_id`, falling back to normalised name
- only touch rows where `injury_source <> 'admin'`; clear feed-set injuries when
  the athlete reads Active again
- runs on the existing throttled `/api/public/hooks/fantasy-squad-sync` hook, so
  no new schedule needed

Server functions (`src/lib/fantasy.functions.ts`): `adminSetFantasyInjury`
(role-checked via `has_role` for admin/management) and injury fields added to the
player payload built in `src/lib/fantasy.server.ts`.

UI (`src/routes/boro-fantasy.tsx`): a small shared `InjuryIcon` component used in
the pitch slot cards and `PlayerPickerDialog`; selection stays allowed, with a
warning toast in the pick handler alongside the existing departed/loaned checks.

New admin route `src/routes/_authenticated/_approved/admin-fantasy-injuries.tsx`,
linked from the admin dashboard next to Fantasy Man of the Match.

Game rules text gets one line explaining injured players are flagged but still
selectable at your own risk.
