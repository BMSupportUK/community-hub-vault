# Journey by Mediavine fallback advert provider

## Goal
If the AdSense application is declined, the site's advert slots switch to Journey by Mediavine without any rework. Slots are built now so the swap later is just pasting in IDs.

## Why Journey
- Media.net's signup form is no longer available, so Journey is the next best option.
- Lowest entry bar of the quality networks (~1,000 monthly sessions) and it has approved publishers whose AdSense applications were declined.
- One open application form: publishers.mediavine.com/join.

## How it works today
- Every advert renders through one component (`src/components/app/AdSenseSlot.tsx`) with five slot types: welcome, home, topic, sidebar, talk.
- AdSense IDs live in `src/lib/adsense.ts`; while unfilled, a subtle "Advertisement" placeholder shows.
- Impression/click metrics already record per slot.

## Plan

### 1. Start the 30-day clock (optional but recommended)
- Journey requires their free "Grow" script on the site for at least 30 days before approval.
- Add `src/lib/mediavine.ts` with a `GROW_SITE_ID` constant — empty until the user creates a Grow account and pastes the ID in.
- When filled, inject the Grow loader script once per page (same pattern as the existing AdSense loader). Until then, nothing changes.

### 2. Journey fallback config
- In the same `src/lib/mediavine.ts`: `MEDIVINE_AD_UNIT_ID` (Mediavine's per-site script ID) and per-slot placement flags, all empty until approval.
- `MEDIVINE_ENABLED` true only when the ID is filled.

### 3. Provider switch inside the slot component
- `AdSenseSlot` gains a provider check: if Journey is configured, it renders a Media-vine-friendly container sized to the current slot heights (92px home/welcome, 125px topic, 280px sidebar, 250px talk) and fires the Mediavine loader instead of the AdSense `<ins>`/`pushAd` path.
- If Journey is not configured, behaviour is exactly as today — AdSense stays primary while the application is pending.
- When neither is configured, the existing "Advertisement" placeholder shows.
- Impression/click metrics, the "Advertisement" label, pointer tracking and the viewport-fit sidebar all keep working for either provider.

### 4. Adsterra as the instant fallback (not wired)
- Noted as the backup if Journey also declines: no traffic minimum, ~10-minute approval, but lower-quality ad styles. Only wired if asked.

## Not changed
- No visual changes: slots keep current sizes, positions and placeholder styling.
- AdSense code paths stay exactly as they are.

## After approval
- Paste the Grow site ID + Mediavine ad unit ID (or send them over) and the whole site switches in one file edit.

## Your signup step (outside the site)
- Apply at publishers.mediavine.com/join with the bmsupport.uk URL; expect a manual review.
