# Project Architecture Rules

- Importing or merging listings into an existing sports guide must preserve its current published status, because content updates must not silently remove a live guide from public pages.
- Sports imports must reject an explicit competition heading that does not match the selected existing guide, and headings must never be stored as event channels.
- Keep the full-screen BM loading cover mounted through browser load and initial hydration, and use it as the router-wide pending screen, so hard refreshes never expose a partial page.
- UFC multi-time imports must attach the complete listed UFC channel set to every time slot, never pair channels to times by position, because each feed carries every slot.
- Public sports guides return only validated date, time and event names; never expose free-text notes, descriptions or channel lines, because channel heuristics can miss unfamiliar feed names.
- The shared advert slots run Adsterra and Google AdSense side by side: on each page load every slot flips a coin (`ADSTERRA_SHARE` in `src/lib/adsterra.ts`) and is filled by either network; slots whose kind has no matching Adsterra zone always use AdSense, unfilled slots keep their placeholder, and a zone already injected on the page hands its second slot to AdSense instead of loading twice. Zone sizes map to slot kinds in `src/lib/adsterra.ts` — pasting an invoke.js src activates Adsterra with no component changes.
