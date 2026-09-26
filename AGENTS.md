# Project Architecture Rules

- Importing or merging listings into an existing sports guide must preserve its current published status, because content updates must not silently remove a live guide from public pages.
- Keep the full-screen BM loading cover mounted through browser load and initial hydration, and use it as the router-wide pending screen, so hard refreshes never expose a partial page.