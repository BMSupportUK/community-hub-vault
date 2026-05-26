## Goal
Fit `/sports-guides` read page and category list into the visible viewport — no big internal scroll — with a numbered pagination bar (1 2 3 … N, prev/next) at the bottom. One-off override of the sports-guides freeze; memory stays as-is afterwards.

## 1. Read page — `sports-guides.read.$id.tsx`
- Replace the route's `overflow-y-auto` body with a fixed-height stage (`flex-1 min-h-0`, no scroll).
- Sanitize + annotate the guide body once into an off-screen measuring container, then pack its top-level children into pages by measured pixel height vs. the stage's available height.
- Render only the current page's slice into the existing card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`) — no visual change to cards.
- Numbered pagination bar pinned at the bottom of the stage.
- Recompute pages on guide change, viewport resize (debounced 150ms via `ResizeObserver`), and `document.fonts.ready`.
- Reset to page 1 on guide id change; ← / → keyboard switches pages.
- Re-run `annotateTimesInEl` on the visible grid after each page render; MutationObserver scoped to the visible container.

## 2. Guides list — `sports-guides.tsx`
- Cards area inside the active category becomes a fixed-height region (viewport minus header, tabs, top padding), no scroll.
- Measure the rendered grid and pack guides into pages of `floor(availableHeight / rowHeight) * columnsAtBreakpoint`. Recompute on resize.
- Same numbered pagination bar beneath the grid.
- Search-results right panel unchanged. Page resets to 1 on category change or search edit.

## Pagination UI
Reuse existing `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis` from `src/components/ui/pagination.tsx`. Local `page` state, no URL changes.

## Files touched
- `src/routes/_authenticated/_approved/sports-guides.read.$id.tsx`
- `src/routes/_authenticated/_approved/sports-guides.tsx`
- `src/lib/paginate-by-height.ts` *(new helper — measures off-screen clone and returns page slices)*

## Out of scope
- Welcome / Categories tabs, editor, search-results panel
- `src/lib/parse-event-times.ts` (untouched)
- Permanent unfreeze of `/sports-guides`
