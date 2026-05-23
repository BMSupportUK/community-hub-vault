
# Normalize every sports-guide card to the target row layout

Override the sports-guides freeze for this single edit, scoped to `src/lib/parse-event-times.ts` only. No other files change.

## Goal

Every event line in every guide, in every category, renders exactly like the Trackside mockup:

```text
01   ST LOUIS v AUSTIN              [ SAT 23 MAY · 19:45 BST ]   [ SAT 23 MAY · 19:45 EUROPE/LONDON ]   ›
     Fox
```

- Rows are stacked vertically full-width — never sit side-by-side in a grid.
- Number, name (+ optional channel/caption), source pill, local pill, chevron all sit on ONE horizontal line on desktop.
- On narrow screens the pills wrap to a second line under the name; nothing gets squashed.

## Changes (single file: `src/lib/parse-event-times.ts`)

1. **Row container (line ~562).** Replace `flex flex-col gap-3` with `flex flex-col md:flex-row md:items-center gap-3 md:gap-4`. Keep the rounded card chrome (`bg-purple-950/40 border border-purple-500/20 hover:border-fuchsia-500/60`).
2. **Header cell (number + name).** Make it `flex items-start gap-3 md:flex-1 md:min-w-0` so name absorbs slack on desktop. Number cell unchanged.
3. **Pills row.** Drop the wrapping `pillsRow` div on desktop — append `sourcePill` and `localPill` as direct flex children of the row with `shrink-0`. On mobile, wrap them in a `flex gap-2 w-full` div (current behavior) so they stack neatly under the name. Implementation: keep `pillsRow` but switch its classes to `flex gap-2 w-full md:w-auto md:contents` — `md:contents` makes the pills become direct row children on desktop, preserving the wrap fallback on mobile without extra branching.
4. **Pill sizing.** Pills currently use `flex-1` (which only made sense inside the old vertical card). Change to `shrink-0 w-auto` so they hug their content on desktop, and keep `flex-1` on mobile by using `flex-1 md:flex-none md:w-auto`.
5. **Chevron.** Append a decorative `›` span after the local pill: `text-purple-300/50 text-xl shrink-0 hidden md:inline pl-1`. Decorative only — no click handler, matches the mockup.
6. **Bypass editor grid wrappers.** In the sort/renumber pass (lines 663-691), reparent every transformed row directly under `root`. Currently rows are placed before a placeholder at the first row's top-level ancestor; change the placeholder to `root.appendChild(placeholder)` style — insert the placeholder at the position of the first row's nearest ancestor under `root`, then `root.insertBefore(el, placeholder)` for every row regardless of source structure. This guarantees rows are direct children of the prose root, so any wrapping `<div class="grid grid-cols-2">` from the editor (the F1 Academy case) no longer dictates row placement.
7. **Idempotency.** The existing `data-tz-row` / `data-tz-original` restore pass at the top of `annotateTimesInEl` already handles re-runs — no change needed, but verify the new chevron span doesn't survive a restore (it won't, since the row's innerHTML is fully rewritten on each pass).

## Out of scope

- No changes to `sports-guides.read.$id.tsx`, the editor, the schema, or any other route/component.
- No changes to how source HTML is authored — the parser normalizes at render time.
- No new categories, no DB migrations, no auth changes.

## Verification

After the edit:
- Open Trackside guide → rows look identical to the reference screenshot.
- Open F1 Academy guide → the two Montreal events stack vertically full-width instead of sitting side-by-side, and each event becomes one horizontal row.
- Resize preview below `md` (768px) → pills wrap below the name, still readable.
- Spot-check one guide in each category to confirm no guide regresses to plain prose.
