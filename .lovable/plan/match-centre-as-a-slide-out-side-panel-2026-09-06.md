# Match Centre as a slide-out side panel

Turn the big centred Match Centre window into a panel that slides in from the right edge of the screen, with a slim always-visible tab so it can be opened at any time.

## What changes

- Tapping the live match bar (or its "View match centre" button) now slides the Match Centre in from the right instead of opening a centred window over the page.
- A slim red tab sits pinned to the right edge of every Fan Zone page showing the Boro badge and a short label. Tapping it opens the same panel; tapping it again (or the close button / outside the panel) slides it shut.
- The tab shows a small pulsing "LIVE" marker while a game is in play, so it is obvious there is something to look at.
- The panel is scrollable, keeps all the existing Match Centre content and tabs exactly as they are, and remembers nothing between visits — it always opens closed.
- On phones the panel covers nearly the full width; on larger screens it takes a comfortable fixed width with the page dimmed behind it.

## Technical notes

- `src/components/app/BoroLiveMatchStrip.tsx`: swap the `Dialog`/`DialogContent` wrapper for the shadcn `Sheet` (`SheetContent side="right"`), keeping the existing `open` state, `selectedMatch` logic, preloaded detail and internal view tabs unchanged. Sizing: `w-full sm:max-w-xl lg:max-w-3xl`, `overflow-y-auto`, same Boro border/background styling; keep an `sr-only` `SheetTitle` for accessibility.
- Add the edge tab in the same component, rendered as a fixed element (`fixed right-0 top-1/3 z-50`, vertical text or badge + chevron) that calls `setOpen(true)`; hidden when there is no fixture data, same as the strip's current empty behaviour.
- No changes to `BoroMatchCentreBox`, the in-page boxes on `fan-zone.index.tsx` / `forum.tsx`, or any data fetching/polling.

## Out of scope

- Changing the live match bar layout or the Match Centre's own content and tabs.
- Adding the panel outside the Fan Zone shell.
