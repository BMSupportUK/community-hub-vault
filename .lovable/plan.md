# Seasonal effects in Talk channels

## What you'll see
- **Halloween (1–31 October):** a few bats and pumpkins drift slowly across the Talk channel screen, with a soft orange glow at the edges.
- **Christmas (1–31 December):** gentle falling snow, with a soft frosty glow at the edges.
- At any other time of year, nothing changes.
- The effects sit behind everything else and never block typing, scrolling or clicking. They are light, so messages stay easy to read.
- Anyone whose device is set to reduce motion sees only the still glow, with no moving bats or snow.
- Dates follow UK time.

## How it's built (keeping the locked Talk code untouched)
- A new standalone "seasonal effects" layer is added to the shared page frame. It only shows on Talk channel pages, which the frame already recognises.
- The Talk chat, presence and message code stays exactly as it is.

## Technical details
- New `src/lib/seasonal-theme.ts`: pure `getSeason(date)` returns `"halloween" | "christmas" | null` using the Europe/London month (October / December).
- New `src/components/app/SeasonalEffects.tsx`: a `pointer-events-none fixed inset-0` overlay with low z-index and CSS-keyframe particles (about 12 bats/pumpkins or 40 snowflakes). Colours come from semantic tokens added to `src/styles.css`. Respects `prefers-reduced-motion`. Renders only after hydration to avoid date mismatches.
- `src/routes/_authenticated.tsx`: lazily render `<SeasonalEffects />` when `talkSurface` is true. This file is not locked.
- Test `tests/seasonal-theme.test.ts`: 15 Oct → halloween; 31 Oct 23:30 UK → halloween; 1 Nov → null; 1 Dec → christmas; 31 Dec → christmas; 1 Jan → null.
- Save the season windows to project memory.
