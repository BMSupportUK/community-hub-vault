# Auto-filling the match day post from ESPN Gamecast

Right now the ESPN Gamecast feed only produces *replies* (team sheet image, goals, cards, subs) onto a thread a human has already created. The biggest win is to let the Gamecast fill the thread itself — the opening post before kick-off, a live block that keeps updating, and a proper full-time summary.

## Recommended: three auto-filled sections

### 1. Pre-match opening post (built ~24h before kick-off)
Everything below is available from the ESPN summary/Gamecast payload for the fixture:

- Header: competition, kick-off time (UK), venue, city, TV broadcast
- League position and W-D-L record for both sides
- Form: last five results for each team, with scores
- Head-to-head: recent meetings and scores
- Match odds / ESPN win probability (predictor block)
- Referee, plus injury/unavailable lists where ESPN carries them
- Placeholder "Team news" line that the existing team-sheet job fills in when the XI drops

### 2. Live block kept up to date in the opening post
A clearly delimited, bot-owned block at the bottom of the first post, rewritten every minute during the game:

```text
LIVE — Middlesbrough 2-1 Derby County (67')
Goals: Player A 12', Player B 44'  |  Derby: Player C 51'
Cards: Player D (yellow, 38')
Shots 14-8  |  On target 6-3  |  Possession 55%-45%  |  Corners 7-3
Last updated 21:04
```

Replies stay as they are today (one per incident, "Updated: ..." on corrections), so the thread reads as a timeline while the top post always shows the current state.

### 3. Full-time summary reply
Posted once the Gamecast status hits FT (or after the shootout):

- Final score, scorers with minutes, penalty shootout order if there was one
- Both starting XIs and subs used
- Curated team stats table
- Standout player stats (goals, assists, shots on target, saves)
- Attendance and referee
- Next fixture line

## Also worth switching on

- **Auto-create the thread** if no match day thread exists 24h before kick-off, titled `Middlesbrough v Derby County — Championship, Sat 15 Aug, 15:00`, authored by Boro Match Day Author, so the automation never silently skips a game.
- **Text line-ups** from the Gamecast rosters as a reply, alongside the graphic scraped from X — the graphic sometimes arrives late or not at all.
- **Half-time reply** with the HT score and first-half stats.

## Technical notes

- Extend `src/lib/boro-espn-events.ts` with a `normaliseEspnPreview` helper reading `gameInfo`, `header.competitions[].competitors[].record`, `predictor`, `standings`, `headToHeadGames`, `injuries`, `broadcasts` from the same summary endpoint already in use.
- New `src/lib/boro-match-post.server.ts` builds the three markdown blocks; `boro-match-events.server.ts` keeps owning replies.
- Live block is written by replacing content between `<!--live-start-->` / `<!--live-end-->` markers in the topic body, so any human-written intro above it is never touched. Only bot-authored blocks are edited.
- Track posted sections in `boro_match_event_posts` with keys like `preview`, `ht`, `ft` and the existing fingerprint/revision columns to keep it idempotent.
- Cron: preview job hourly (fires at T-24h), live/HT/FT handled by the existing per-minute match window hook.
- Admin dashboard gets manual "Rebuild preview" / "Rebuild full-time summary" buttons for a given fixture.

## Scope question

If you'd rather keep it lighter, the highest-value pieces on their own are section 2 (live block in the opening post) and section 3 (full-time summary). Say the word and I'll cut the plan down to those.
