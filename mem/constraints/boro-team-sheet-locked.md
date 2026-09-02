---
name: Boro match-day team sheets locked
description: Frozen team-sheet pipeline that posts Boro + opposition XI graphics from X into match-day threads
type: constraint
---

The match-day "Teams" pipeline is locked. Do not refactor, simplify or
"tidy" these files unless the user explicitly asks for a change to team sheets:

- `src/lib/boro-team-sheet.server.ts` — X syndication timeline read, fancy-text
  normalisation, `TEAM_SHEET_PATTERNS`, `isOpponentTeamSheetText`,
  `pickTeamSheetPosts` (returns `side: "boro" | "opponent"`), `buildTeamSheetBody`
  (`teamLabel`), `syncBoroTeamSheet`.
- `src/lib/forum-team-sheet.ts` — `isTeamSheetPost` must stay permissive:
  `team news — <anything> line-up`. Tightening it makes team sheets vanish
  from the Teams tab.
- `src/routes/api/public/hooks/boro-team-sheet.ts` — sync hook.
- `src/lib/boro-team-sheet.functions.ts`, `admin-boro-team-sheet.tsx`.

Rules:
- Both sides must post: Boro's own XI graphic AND the retweeted opposition XI.
- Never narrow the caption patterns; the club varies wording ("Our XI at Turf
  Moor", "Your Boro", "Tonight's Burnley side"). Only ever add patterns.
- Heading format written to `forum_posts` must keep the `Team news — … line-up`
  shape so the Teams tab filter still matches.

**Why:** the teams silently disappeared from match-day threads when the club
changed its wording and the detector no longer matched.
