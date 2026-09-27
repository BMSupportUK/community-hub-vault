# Project Architecture Rules

- Sports-guide updates must preserve published status so live guides stay public.
- Headings prefix event names and never become channels. Rugby Pass `NN: event time (note)` keeps its note and numbered channel.
- Keep the BM loading cover through browser load/hydration and as the router pending screen.
- UFC multi-time imports must attach the complete listed UFC channel set to every time slot, never pair channels to times by position, because each feed carries every slot.
- Triller TV rows are `Triller TV | Event N: title time`; remove `Event N` from the title, keep the trailing time, and use `Triller TV N` as the channel so the source channel number is retained and saved guides read back unchanged.
- Public sports guides return only validated date, time and event names; never expose free-text notes, descriptions or channel lines, because channel heuristics can miss unfamiliar feed names.
- Shared advert slots flip per load between Adsterra and AdSense (`ADSTERRA_SHARE` in `src/lib/adsterra.ts`); slots without an Adsterra zone always use AdSense, unfilled ones keep the placeholder. AdSense gated by `ADSENSE_APPROVED` in `src/lib/adsense.ts` (false → Adsterra takes all; on approval set `ADSENSE_APPROVED = true`, `ADSTERRA_SHARE = 0.5`). Adsterra: classic `atOptions` iframe snippet, injected serially with captured document.write, refreshes every 60s while visible; never timer-refresh AdSense.
- Header starts collapsed (slim bar) except the home page, which starts open; re-collapses per navigation (home re-opens). Talk channels add channel name; Fan Zone never shows it.
- The global back-to-top button reacts only to page-level scrollers (window or a container ≥90% viewport width and ≥75% viewport height, never inside dialogs); inner panels like chat lists and reply panes must not trigger it, because they scroll while the page itself stays put.
- NFL Sunday Ticket rows are `NFL NN: ET time | UK time` with the fixture on the next line: use the stated UK time as-is, channel `NFL NN`, drop the `US | NFL Sunday Ticket` header; pipe rows are never split by the WF colon rule.
