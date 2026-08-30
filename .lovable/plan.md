# Split the side rail into Support and Fan Zone modes

The icon rail becomes context-aware. Outside the Boro Fan Zone it shows the support icons plus a single Boro Fan Zone badge. Once you are inside the Fan Zone, the rail swaps to the Fan Zone icon set.

## Main rail (default)

Keeps: Home, Customer Chatroom, Tickets, Shop, Install guides, Sports guides, Knowledge base, What to Watch, Referrals, New content, Members, Staff.

Removed from the default rail (they move into the Fan Zone set): Boro Fantasy, Boro Predictor, World Cup Predictor, Competition Winners.

Keeps the Boro Fan Zone badge as the way in.

## Fan Zone rail (when inside the Fan Zone)

- Boro Fan Zone (forum home)
- Fan Zone Messages
- Fan Zone Profile / Members
- Boro Fantasy
- Boro Predictor
- World Cup Predictor
- Competition Winners

The BM logo at the top of the rail stays the way back to the main app (it already links to Home), so no extra back button is added.

## Which pages count as "inside the Fan Zone"

`/forum` and its sub-pages, `/fanzone/*`, `/fan-zone/*`, `/boro-fantasy`,
`/boro-predictions`, `/predictions`, `/competition-winners`.

## Technical notes

- All work is in `src/components/app/IconRail.tsx`.
- Add a `FAN_ZONE_PREFIXES` list and derive `inFanZone` from the existing
  `useRouterState` pathname.
- Split the current `items` array into `supportItems` and `fanZoneItems`,
  then pick the set based on `inFanZone`. Existing role/`page_permissions`
  filtering, the competition "finished" filter, badge counts and
  admin drag-reorder (`nav_order`) all continue to apply to whichever set
  is rendered.
- Competition entries stay driven by `COMPETITIONS` so a finished
  competition still disappears.
- Mobile sheet (`inSheet`) uses the same logic, so it stays consistent.
