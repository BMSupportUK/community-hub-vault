# Media.net fallback advert provider

## Goal
If the AdSense application is declined, the site's advert slots switch to Media.net without any rework. The slots are built now so the swap later is just pasting in Media.net IDs.

## How it works today
- Every advert on the site renders through one component (`src/components/app/AdSenseSlot.tsx`) with five slot types: welcome, home, topic, sidebar, talk.
- AdSense IDs live in `src/lib/adsense.ts`. While IDs are empty or unfilled, a subtle "Advertisement" placeholder shows.
- Impression/click metrics already record against each slot.

## Plan

### 1. New Media.net config module
- `src/lib/medianet.ts` mirrors `src/lib/adsense.ts`:
  - `MEDIANET_CUSTOMER_ID` (Media.net `cid=`) and one tag/zone ID per slot type — all left **empty** until Media.net approves the site.
  - `ensureMedianetScript()` — injects `//contextual.media.net/dmedianet.js?cid=...` once per page (Media.net's documented loader).
  - `pushMediaTag(containerId, tagId, size)` — pushes onto `window._mNHandle.queue` calling `window._mNDetails.loadTag(...)` inside try/catch, mirroring Media.net's snippet.
- `MEDIANET_ENABLED` is true only when the customer ID and at least one tag ID are filled.

### 2. Provider switch inside the slot component
- `AdSenseSlot` gains a provider check: if Media.net is configured, it renders Media.net's container div (`id="MNET-<slot>"`, sized to match the slot's current AdSense heights: 92px home/welcome, 125px topic, 280px sidebar, 250px talk) and fires the Media.net loader instead of the AdSense `<ins>`/`pushAd` path.
- If Media.net is not configured, behaviour is exactly as today (AdSense code untouched — it stays the primary while the application is pending).
- When neither network is configured, the existing "Advertisement" placeholder shows as now.
- Impression/click metrics, the "Advertisement" label, pointer-tracking and viewport-fit sidebar behaviour all keep working for either provider.

### 3. Google Ad Manager note
- Media.net also offers an Ad Manager / header bidding variant; the plain tag above is the standard direct integration and is what we wire. If Media.net supplies a different snippet at approval, only `src/lib/medianet.ts` needs editing.

## Not changed
- No visual changes: slots keep their current sizes, positions and placeholder styling.
- AdSense code paths stay exactly as they are.

## After you're approved
- You paste the Media.net customer ID + five tag IDs (they map 1:1 to the current AdSense slots) and the whole site switches in one file edit. Alternatively I can enter them for you once you send them over.

## Signup step (you, not the site)
- Apply at media.net with the bmsupport.uk URL — expect a quality review of a few days; Media.net does not require a traffic minimum.
