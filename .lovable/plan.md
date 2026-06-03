## Boro Match Centre widget (Fan Zone)

Add a compact "Match Centre" widget above the Fan Zone Staff box on the Boro Fan Zone, showing:
- **Last result** (date, opponent, home/away, score, competition)
- **Next game** (date, kick-off in user timezone, opponent, home/away, competition)
- **League position** (Championship rank, P/W/D/L, GD, points)

Styled to match the existing red Fan Zone aesthetic (Hull-yellow / Boro-red shirts, club crests, kicker pill for competition, FT/KO badges).

### Data source

Scrape **www.mfc.co.uk** (fixtures/results pages) and the EFL Championship table via a TanStack server function. Cache results in a new `boro_match_centre` table (single row) so we don't hammer mfc.co.uk on every page view. A cron refreshes it.

If scraping mfc.co.uk fails (markup change / blocked), the widget falls back to the last-cached snapshot and an admin can override values manually from the existing admin area.

### Build steps

1. **Migration — `boro_match_centre` cache table**
   - One row keyed by `id = 'singleton'`
   - Columns: `last_result jsonb`, `next_fixture jsonb`, `league_position jsonb`, `manual_override boolean`, `fetched_at timestamptz`, `updated_at`
   - RLS: `SELECT` for `authenticated` (everyone in Fan Zone can read); `UPDATE/INSERT` for admin/management only via `has_role`.
   - Grants for `authenticated` + `service_role`.

2. **Server function — `src/lib/boro-match-centre.functions.ts`**
   - `getBoroMatchCentre()` — returns the cached row (DTO).
   - `refreshBoroMatchCentre()` — admin/management only. Fetches mfc.co.uk fixtures, results, and the Championship table page, parses HTML with a tiny regex/cheerio-free parser, writes to the cache. Skips fields where `manual_override` is true.
   - `setBoroMatchCentreOverride({ field, value, manual })` — admin manual editor.

3. **Cron route — `src/routes/api/public/hooks/refresh-boro-match-centre.ts`**
   - Calls the refresh logic. Wire a pg_cron job (every 30 min) via `supabase--insert` after migration approval.

4. **Widget — `src/components/app/BoroMatchCentreBox.tsx`**
   - Three stacked sections: Last Result, Next Game, League Position.
   - Mirrors `FanZoneStaffBox` styling (red gradient header, surface-1 body, club crests as small icons; "FT" pill for results, countdown for next kick-off using existing timezone hook).
   - Loading skeleton + graceful empty state.

5. **Place above staff** — find where `<FanZoneStaffBox />` renders on the Boro Fan Zone page and insert `<BoroMatchCentreBox />` immediately above it (same side column).

6. **Admin editor (lightweight)** — add an "Edit" pencil visible only to admin/management on the widget that opens a small inline form to override any of the three sections (sets `manual_override=true` for that section so cron won't clobber it).

### Notes / risks

- Cloudflare Workers runtime: parse HTML with regex / lightweight string ops (no `jsdom`/`cheerio` native deps). Keep parser defensive — if a section can't be parsed, keep previous cached value.
- mfc.co.uk may block or change markup; manual override + last-good cache keeps the widget useful.
- No external API key needed.
