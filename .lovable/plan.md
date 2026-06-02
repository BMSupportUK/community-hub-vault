
# Discord Paste → Sports Guide Importer

You paste messages copied from Discord into an admin page. The app splits them into individual events, routes each to the right Category + Subcategory using a fixed keyword map, and queues anything unmatched for review.

## 1. Database changes

One new subcategory + one review queue table.

```sql
-- New subcategory under USA Sports
INSERT INTO sports_subcategories (category_id, name, sort_order)
SELECT id, 'American Football', 10
FROM sports_categories WHERE name = 'USA Sports';

-- Review queue for unmatched events
CREATE TABLE public.discord_import_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_text text NOT NULL,
  parsed_event jsonb NOT NULL,            -- { title, time, channels[], date }
  suggested_category_id uuid REFERENCES sports_categories(id),
  suggested_subcategory text,
  status text NOT NULL DEFAULT 'pending', -- pending | imported | discarded
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);
-- + GRANT + RLS: admin / management / moderator only
```

No bot, no tokens, no Discord API.

## 2. Keyword routing map (locked)

Compiled into `src/lib/discord-sport-keywords.ts`. Top-to-bottom, first match wins, case-insensitive.

- **Sports Passes** (top priority): sky sports pass, tnt sports pass, peacock pass, dazn pass, season pass, sports pass
- **UFC**: ufc, mma, bellator, pfl
- **Boxing**: boxing, matchroom, queensberry, fight night
- **Darts**: darts, pdc
- **Tennis**: tennis, atp, wta, wimbledon, roland garros
- **Golf**: liv→Liv Golf • lpga→LPGA Tour • let/ladies european→LET Tour • dp world tour/european tour→DP World Tour • fallback→PGA Tour
- **Football | Women**: nwsl/uswnt→USA • womens euro/world cup/champions league→Tournament • fallback→England
- **Football | Mens**: champions league/europa/conference/club world cup→Tournaments | Clubs • world cup/euros/nations league/international→International • la liga→Spain • serie a→Italy • bundesliga→Germany • ligue 1→France • eredivisie→Holland • scottish/spfl→Scotland • mls/liga mx/brasileirao/a-league/j-league→All Other Leagues • fallback (premier league/epl/fa cup/efl/football/soccer)→England
- **Rugby League**: rugby league pass→Sports Passes • fallback→League
- **Rugby Union**: rugby union pass→Sports Pass • six nations/world cup/internationals→International • champions cup/challenge cup rugby→Tournament • fallback→League
- **Cricket**: anything cricket-related → **League** (title carries the league name like IPL, The Hundred, etc.)
- **Motorcar Racing**: dtm→DTM • wrc/rally→Rally • f1/f2/f3/grand prix/indycar/nascar/le mans/wec→F1 | F2 | F1 Academy
- **Motorbike Racing**: motogp pass→Sport Passes • speedway→Speedway • superbike/wsbk/bsb→Superbike • fallback→Moto GP
- **Irish Sports**: gaa, hurling, gaelic, all-ireland
- **Australian Sports**: afl/aussie rules→Aussie Rules • aus rugby league→Rugby League • a-league→Soccer • netball→Netball • supercars→Motorsports
- **USA Sports**: nba/wnba/basketball→Basketball • nhl/ice hockey→Ice Hockey • mlb/baseball/world series→Baseball • **nfl/college football/ncaa/super bowl→American Football (new)** • mlr→Rugby Union • mls usa→Soccer • peacock→Baseball
- **Daily Sports & PPV**: ppv, pay-per-view
- **Other Sports**: greyhound, horse racing, cycling, tour de, snooker, volleyball, handball

Unmatched events → review queue (no silent drop).

## 3. Server functions

`src/lib/discord-import.functions.ts` — all protected by `requireSupabaseAuth` + admin/management/moderator role check:

- `parseDiscordPaste({ text })` — runs raw paste through:
  1. **Splitter** — Lovable AI (free, no key needed) breaks the paste into individual events. Handles both human-typed multi-sport listings and bot-card format. Returns `{ title, time, date, channels[] }[]`.
  2. **Router** — runs keyword map against each event.
  3. **Preview** — returns `{ matched: [...], unmatched: [...] }` so you see what'll happen before confirming.
- `importParsedEvents({ events })` — inserts matched events into `sports_blogs` as drafts (`published=false`).
- `queueUnmatched({ events })` — inserts unmatched into `discord_import_queue`.
- `listImportQueue()` — pending review items.
- `resolveQueueItem({ id, action, category_id?, subcategory? })` — import / re-route / discard.

## 4. Admin UI

New page **`/admin/sports-import`** (admin-only, role-gated like other admin pages, added to admin nav):

- **Paste box**: big textarea + "Parse" button
- **Preview step**: side-by-side
  - Left: matched events with detected Category → Subcategory (editable dropdowns per row)
  - Right: unmatched events with manual Category + Subcategory dropdowns
  - "Import all" or per-row import/skip
- **Review queue panel**: pending items from past imports, same edit + import / discard controls, bulk actions
- Imported rows are **drafts** — you publish from the existing sports guide admin (sports-guide file stays frozen).

## 5. Files

- New: `src/lib/discord-sport-keywords.ts`
- New: `src/lib/discord-import.functions.ts`
- New: `src/lib/discord-import.server.ts` (AI splitter via Lovable AI)
- New: `src/routes/_authenticated/_approved/admin.sports-import.tsx`
- New: `src/components/admin/SportsImportPaste.tsx`
- New: `src/components/admin/SportsImportQueue.tsx`
- New admin nav link
- One migration (subcategory + queue table)
- Sports guide file NOT touched

## 6. Future upgrade path

If the Discord server owner ever agrees to add a read-only bot, we swap the paste box for an automatic fetcher — **same parser, same router, same queue, same UI panels**. No throwaway work.

---

Approve and I'll build it.
