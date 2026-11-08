# Country EPG updates only when browsed

## Result
- Opening a country category requests an update for that category’s country guides only.
- Existing saved programmes appear straight away while a stale guide updates separately.
- Countries nobody opens do not get downloaded. Opening All or Favourites does not trigger every country.
- Users share the same saved guide: many people opening UK channels cause one update, not many downloads.
- Sports Pass channels continue using your website’s Sports Guide events.

## Official TV guides
The current country XMLTV feeds are third-party feeds, not direct official broadcaster feeds. Public TV-guide pages do not necessarily offer an approved data feed for use in BM Player.

Use approved broadcaster feeds first where access and reuse rights are confirmed; retain the current listings/provider fallback elsewhere rather than leave channels blank. Match the exact country, region and station, including American local subchannels.

Initial source candidates:
- UK: BBC metadata access and authorised ITV/PA listings.
- USA: PBS’s documented TVSS feed requires approved-partner access; wider network/local coverage needs additional authorised sources.
- Canada: request CBC/Radio-Canada listings access; broad coverage may require a licensed listings service.
- Australia: direct broadcaster-transmitted programme guides need local receiver infrastructure; shared commercial use of ABC’s RSS needs permission.

No universal official-country feed was verified. Official-source connections remain dependent on permissions, credentials or licensing; no paid service will be activated without a decision from you.

## Update behaviour
1. Android/Amazon and Windows/Mac send a small notice when a real category opens, independently of programme loading.
2. The website checks whether its country feeds are stale. Keep the existing six-hour successful-refresh interval initially; reopening a fresh category reuses its saved programmes.
3. A stale category creates one durable update request and wakes the importer. Stop after queued work drains; retry failures only while work remains.
4. Replace the unconditional hourly country-download selection. Do not download unrequested countries.
5. Preserve old listings until a full replacement succeeds. Failed downloads must not blank the guide or count as successful refreshes.
6. Refresh visible programme rows after publication, with bounded checks rather than every device repeatedly fetching whole country guides.

## Technical details
- Add a device-token-verified category-open action to the existing player endpoint; resolve allowed feeds from category names, never arbitrary client URLs.
- Persist per-feed demand, successful-publication time, retry state and atomic leases; coalesce simultaneous requests across devices and server instances.
- Wake the existing secret-protected import route on enqueue using a durable database HTTP dispatch; verify delivery timeout supports large US-local imports before rollout. Do not rely on detached server promises.
- Stage complete imports and publish transactionally; import all existing targets belonging to a requested feed so another category’s saved rows are not erased.
- Preserve manual matches and Sports Guide overlays. Record source provenance accurately; never label community XMLTV as official.
- Implement shared desktop changes once for Windows and Mac. Record category-open rules in the existing architecture files.

## Checks and delivery
- Tests: unopened countries stay idle; All/Favourites trigger no global refresh; concurrent opens create one refresh; fresh data is reused; failures retain previous listings; regional matches stay country-specific.
- Exercise opening real categories, durable dispatch, full import, and updated programme readback; measure cached-guide speed.
- Website publication is required. App changes need new Android/Amazon, Windows and Mac releases; real-box appearance cannot be verified without a connected device.
- Official-source rollout follows separately once approved access exists; the demand-only mechanism can use existing feeds in the meantime.