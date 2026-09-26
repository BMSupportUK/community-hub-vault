# Adsterra fallback advert provider

## Goal
If the AdSense application is declined, the site's advert slots switch to Adsterra without any rework. Slots are built now so the swap later is just pasting in zone IDs.

## Why Adsterra
- The next best option that requires **no site review**: any traffic level is accepted and approval comes back in minutes, not days ([Adsterra publisher guide](https://adsterra.com/blog/set-up-publishers-dashboard/)).
- Payouts from a $5 balance, paid twice a month.
- Trade-off: ad styles are more intrusive (banners, native and push-style) than AdSense or Journey by Mediavine — acceptable as a working fallback, not a first choice.
- Quality networks (Journey by Mediavine, Media.net) stay open as later upgrades: Mediavine's signup form at publishers.mediavine.com/join needs a 30-day Grow-script wait, and Media.net's form is currently unavailable.

## How it works today
- Every advert renders through one component (`src/components/app/AdSenseSlot.tsx`) with five slot types: welcome, home, topic, sidebar, talk.
- AdSense IDs live in `src/lib/adsense.ts`; while unfilled, a subtle "Advertisement" placeholder shows.
- Impression/click metrics already record per slot.

## Plan

### 1. New Adsterra config module
- `src/lib/adsterra.ts` mirrors `src/lib/adsense.ts`:
  - One **zone ID per slot type** — all left **empty** until the user creates the Adsterra publisher account and creates zones.
  - `ensureAdsterraScript(zoneId, containerId)` — injects Adsterra's banner loader (`<script async src="...at/jsw.js" data-zone="...">`) inside the slot container once per zone, using Adsterra's documented banner embed.
  - `ADSTERRA_ENABLED` is true only when at least one zone ID is filled.

### 2. Provider switch inside the slot component
- `AdSenseSlot` gains a provider check: if Adsterra is configured, it renders the Adsterra zone container sized to the current slot heights (92px home/welcome, 125px topic, 280px sidebar, 250px talk) instead of the AdSense `<ins>`/`pushAd` path.
- If Adsterra is not configured, behaviour is exactly as today — AdSense stays primary while the application is pending.
- When neither is configured, the existing "Advertisement" placeholder shows.
- Impression/click metrics, the "Advertisement" label, pointer tracking and the viewport-fit sidebar keep working for either provider.

### 3. Cleanup
- Only one provider's loader runs per page; the config modules guard each other so the site never loads both scripts.

## Not changed
- No visual changes: slots keep current sizes, positions and placeholder styling.
- AdSense code paths stay exactly as they are.

## After signup
- Create the five banner zones in the Adsterra dashboard (one per slot type), paste the zone IDs here or send them over, and the whole site switches in one file edit.

## Your signup step (outside the site)
- Register as a publisher at adsterra.com — minutes to approve, no traffic minimum, no manual site review.
