# Auto-filling the match day post from ESPN Gamecast

Right now the ESPN Gamecast feed only produces *replies* (team sheet image, goals, cards, subs) onto a thread a human has already created. This adds an auto-filled pre-match reply, a live block that keeps updating, a half-time reply and a full-time summary.

## 1. Pre-match reply (posted ~24h before kick-off)

Posted as the **first reply** on the existing match day thread, never as a new topic and never touching the human's opening post. Author: Boro Match Day Author. Content pulled from the ESPN summary/Gamecast payload:

- Header: competition, kick-off time (UK), venue, city, TV broadcast
- League position and W-D-L record for both sides
- Form: last five results for each team, with scores
- Head-to-head: recent meetings and scores
- Match odds / ESPN win probability (predictor block)
- Referee

Not included: injury/unavailable lists, and no "Team news" placeholder line — the existing team-sheet job posts the XI on its own when it drops.

## 2. Live block kept up to date inside that same pre-match reply

The bot edits its own pre-match reply during the game, rewriting a delimited block at the bottom of it every minute:

```text
LIVE — Middlesbrough 2-1 Derby County (67')
Goals: Player A 12', Player B 44'  |  Derby: Player C 51'
Cards: Player D (yellow, 38')
Shots 14-8  |  On target 6-3  |  Possession 55%-45%  |  Corners 7-3
Last updated 21:04
```

Incident replies stay exactly as they are today (one per goal/card/sub, "Updated: ..." on corrections), so the thread reads as a timeline while the pinned-at-top bot reply always shows the current state.

## 3. Half-time reply

Posted once the Gamecast status hits HT:

- Half-time score and scorers so far
- First-half team stats (shots, on target, possession, corners, fouls, cards)

## 4. Full-time summary reply

Posted once status hits FT (or after a shootout):

- Final score, scorers with minutes, penalty shootout order if there was one
- Both starting XIs and subs used
- Curated team stats table
- Standout player stats (goals, assists, shots on target, saves)
- Attendance and referee
- Next fixture line

## Also switching on

- **Auto-create the thread** if no match day thread exists 24h before kick-off, titled `Middlesbrough v Derby County — Championship, Sat 15 Aug, 15:00`, authored by Boro Match Day Author, so the automation never silently skips a game. The pre-match reply then lands on that thread as reply one.
- **Text line-ups** from the Gamecast rosters as a reply, alongside the graphic scraped from X — the graphic sometimes arrives late or not at all.

## Technical notes

- Extend `src/lib/boro-espn-events.ts` with a `normaliseEspnPreview` helper reading `gameInfo`, `header.competitions[].competitors[].record`, `predictor`, `standings`, `headToHeadGames`, `broadcasts` from the same summary endpoint already in use, plus a `normaliseEspnTeamStats` helper for the HT/FT stat blocks.
- New `src/lib/boro-match-post.server.ts` builds the pre-match reply, the live block, and the HT/FT bodies; `boro-match-events.server.ts` keeps owning per-incident replies.
- The live block is written by replacing content between `<!--live-start-->` / `<!--live-end-->` markers inside the bot's own pre-match reply, so only bot-authored content is ever edited.
- Track posted sections in `boro_match_event_posts` using reserved keys `preview`, `ht`, `ft`, `lineups` with the existing fingerprint/revision columns, keeping everything idempotent.
- Cron: a preview job hourly (fires at T-24h); live block, HT and FT handled by the existing per-minute match-window hook.
- Admin dashboard gets manual "Rebuild preview", "Rebuild half-time" and "Rebuild full-time" buttons for a given fixture.
