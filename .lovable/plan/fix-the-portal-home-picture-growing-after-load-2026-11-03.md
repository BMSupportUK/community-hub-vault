# Fix the Portal Home picture growing after load

## What's happening
Your screenshot shows the Staff Portal home, not the public homepage. The large office picture has no size of its own. It stretches to match the height of the right-hand column (Hey + stats boxes + Working Status).

That column fills in a moment after the page opens, as the ticket and inbox counts, the Working Status box and the shift details arrive. Each time it gets taller, the picture is stretched with it. So the picture starts small and then jumps big, and on a shorter window it pushes "Welcome to The Staff Portal" off the bottom. The Customer Portal home uses the same layout, so it has the same problem.

## The fix
- Give the picture a fixed shape: the same proportions as the image, sized by the width of its column. It can never be taller than the visible window, so the greeting and welcome text always stay in view.
- The right-hand column no longer controls the picture's height. When the stats and Working Status load in, the right column grows on its own, and on short windows it scrolls inside itself, so the picture doesn't move.
- The Expert Support and Service Status pills stay overlapping the bottom of the picture, as now.
- Same fix on the Customer Portal home.

## Checks
- Load Staff and Customer Portal home at a short laptop window (1536x700, like your screenshot), a normal desktop, a tablet and a phone. Record the picture's size from the first moment, to confirm it never changes while the page loads, and that the welcome text is visible.

## Technical details
- `src/components/app/PortalHome.tsx`: replace the `flex-1 min-h-[260px]` stretch on the image frame with `aspect-[1920/832]` (staff) or `aspect-[16/9]` (members), `w-full` and `max-h-[calc(100dvh-<header+padding>)]`. Drop `md:h-full`/`flex-1` stretching on the left column wrappers, and set the grid to `lg:items-start`.
- Right column: `lg:max-h-[calc(100dvh-header)] lg:overflow-y-auto` so delayed content can't resize the row.
- Update the root AGENTS.md rule for homepage pictures so it covers the portal homes too: picture frames reserve their own aspect ratio and are never sized by sibling content.
