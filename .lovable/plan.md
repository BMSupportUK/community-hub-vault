# Event Schedule row layout — for all guides

## Goal

Match the uploaded "Event Schedule" mockup for every sports guide read page. Each line that contains a time becomes a horizontal row with: number, event name, **source-time pill first (muted, GMT)**, **local-time pill (bold fuchsia)**, chevron. **No thumbnail icons.**

## What the user sees

For every guide opened from `/sports-guides`, the body renders as a stacked list of schedule rows:

```text
#    EVENT                          SOURCE TIME (GMT)     LOCAL TIME (GMT+14)     ›
01   Trackside Live!                [ 00:00  GMT ]        [ 14:00  GMT+14 ]       ›
02   Nascar                         [ 01:30  GMT ]        [ 15:30  GMT+14 ]       ›
03   The American Rodeo             [ 03:00  GMT ]        [ 17:00  GMT+14 ]       ›
```

- Header row above the list shows column labels — `#`, `EVENT`, `SOURCE TIME (GMT)`, `LOCAL TIME (<viewer tz>)` — using the viewer's detected timezone.
- Source pill: muted glass `bg-white/5 border border-white/10 text-purple-100/80`, time bold + small `GMT` suffix.
- Local pill: solid fuchsia `bg-fuchsia-600 text-white shadow-[0_0_15px_rgba(192,38,211,0.25)]`, time bold + small offset suffix.
- Each row sits in a rounded card (`bg-purple-950/40 border border-purple-500/20 rounded-xl`), hover lifts the border to fuchsia.
- A right-side chevron is decorative only (no per-row navigation).
- Rows that don't contain any parseable time render as plain prose (intros, notes, headings stay untouched).
- Non-time content inside a row line (extra notes after the time) is kept as a small caption beneath the event name.

## Scope

- Frontend only.
- Single file edited: `src/lib/parse-event-times.ts` — rewrite `annotateTimesInEl` to upgrade from inline-pill replacement to whole-row transformation.
- `src/routes/_authenticated/_approved/sports-guides.read.$id.tsx` gets a small column-header strip rendered just above the body div; no other route changes.
- Applies to every guide automatically because all guides share the same read route + utility.

## Technical approach

1. In `annotateTimesInEl`, walk block-level descendants (`li`, `p`, `tr`) of the root instead of raw text nodes.
2. For each block:
   - Run `parseMatches` against its text content.
   - If zero matches → leave block alone.
   - If ≥1 match → take the **first** match as the row's time, derive `eventName` = block text with the matched substring (and any trailing GMT label) stripped and trimmed; everything left over after the time becomes the caption.
   - Replace the block's inner HTML with the row template (number cell, event name + optional caption, source pill, local pill, chevron).
3. Maintain a row counter scoped to the root so numbers restart per guide and stay sequential regardless of original `<ol>`/`<ul>` structure.
4. Keep the existing MutationObserver guard + `[data-tz-pill]` cleanup so re-renders stay idempotent. Add a `data-tz-row` marker on transformed blocks so we can detect + skip already-processed rows.
5. Column header strip in the read route reads the viewer's tz abbreviation from the first transformed row (via a small ref callback) and shows `LOCAL TIME (<abbr>)` / `SOURCE TIME (GMT)`.

## Out of scope

- Thumbnail/event imagery (explicitly excluded).
- Sidebar nav, "SPORTS LIVE" logo, top date picker from the mockup.
- Editing the guide CMS or schema.
- Per-row click navigation.
