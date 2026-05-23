## Goal
On the sports-guide read page, automatically detect times written inside the guide body in any of several common timezones (GMT/BST, UTC, ET/EST/EDT, CT/CST/CDT, MT/MST/MDT, PT/PST/PDT, CET/CEST, AEST/AEDT, JST, IST, plus explicit `UTC±HH(:MM)` offsets) and show the equivalent time in the viewer's own timezone right next to each one.

## Scope
- Read page only: `src/routes/_authenticated/_approved/sports-guides.read.$id.tsx`.
- Pure frontend / presentation change — no schema, no editor changes.

## How it will work

### Detection
After `sanitizeRichHtml(blog.body)` renders, walk the rendered DOM (via a `ref` + `useEffect`) and scan text nodes with a single regex that matches:
- 24h: `HH:MM` followed by an optional space then a zone token
- 12h: `H(:MM)? ?(am|pm)` followed by an optional space then a zone token
- Zone tokens (case-insensitive):
  - `GMT`, `BST`, `UTC`
  - `ET`, `EST`, `EDT`
  - `CT`, `CST`, `CDT`
  - `MT`, `MST`, `MDT`
  - `PT`, `PST`, `PDT`
  - `CET`, `CEST`
  - `AEST`, `AEDT`
  - `JST`, `IST`
  - Explicit offsets: `UTC+1`, `UTC-05:30`, `GMT+2`, etc.

Each abbreviation maps to a canonical IANA zone (e.g. `ET → America/New_York`, `CET → Europe/Paris`, `JST → Asia/Tokyo`, `IST → Asia/Kolkata`). Ambiguous bare forms (`ET`, `CT`, `MT`, `PT`) resolve to the IANA zone, which already handles DST. `BST` maps to `Europe/London`. Numeric offsets are handled directly without an IANA zone.

### Conversion
- Viewer zone comes from the existing `useUserTimezone()` hook (falls back to browser zone).
- Compute the UTC instant for "today at HH:MM in the source zone" using the existing helpers in `src/hooks/use-timezone.tsx` (`zonedWallTimeToUtcMs`). For pure numeric offsets, compute UTC directly.
- Format the result with `Intl.DateTimeFormat({ timeZone: viewerTz, hour:"2-digit", minute:"2-digit", hour12:false, timeZoneName:"short" })`.
- Skip the chip when the source zone and viewer zone resolve to the same offset for today (no useful conversion).

### Rendering
- Leave the original matched text (e.g. `19:45 GMT`, `8pm ET`) untouched in place.
- Insert a small inline pill immediately after it: e.g. `20:45 BST`.
- Pill styling matches the read page palette: `inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-md bg-fuchsia-500/15 text-fuchsia-100 border border-fuchsia-400/30 text-xs`.
- DOM mutation runs once after the body HTML mounts and re-runs if `blog.body` or the viewer timezone changes. Uses a `TreeWalker` over text nodes only — never touches attributes, scripts, or already-wrapped pills (skip nodes inside an element flagged with a `data-tz-pill` marker so re-runs are idempotent).

## Technical notes
- New helper file: `src/lib/parse-event-times.ts` exporting `annotateTimesInEl(rootEl, viewerTz)` plus the zone-token → IANA map. Keeps the route file lean and unit-testable.
- The read page imports the helper and calls it from a `useEffect` that depends on `blog?.body` and `viewerTz`.
- No effect on the editor, list page, refresh-notice banner, excerpt, or title.

## Out of scope
- Persisting a structured `start_time` field.
- Showing converted times on guide cards in the list.
- Modifying the global header clocks.
- Date-aware parsing ("tonight at 8pm GMT" across midnight rollovers — we always anchor to today in the source zone).
