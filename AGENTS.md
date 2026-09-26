# Project Architecture Rules

- Importing or merging listings into an existing sports guide must preserve its current published status, because content updates must not silently remove a live guide from public pages.
- Sports imports must reject an explicit competition heading that does not match the selected existing guide, and headings must never be stored as event channels.
- Keep the full-screen BM loading cover mounted through browser load and initial hydration, and use it as the router-wide pending screen, so hard refreshes never expose a partial page.
- UFC multi-time imports must attach the complete listed UFC channel set to every time slot, never pair channels to times by position, because each feed carries every slot.
