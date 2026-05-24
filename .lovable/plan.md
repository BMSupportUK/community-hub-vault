# Service Status box on members home

Add a compact, real-time service status widget to `src/routes/_authenticated/_approved/home.index.tsx`, rendered directly underneath the last channel section. It mirrors the data from `/status` but only shows whether things are operational or not — no incident bodies.

## Behaviour

- Reads the `incidents` table (same source `/status` uses).
- "Active" = any incident whose `status` is `investigating`, `identified`, or `monitoring` (i.e. not `completed`).
- States shown:
  - **All systems operational** — green dot, when there are zero active incidents.
  - **N issue(s) reported** — coloured dot per status, when there are active incidents. For each active incident render one row: status dot + status label (Investigating / Identified / Monitoring) + incident title only. No description, no updates, no attachments.
- Real-time: subscribe to `postgres_changes` on the `incidents` table (and refetch on any insert/update/delete), same pattern used elsewhere in the app (e.g. `ModerationPendingBadge`, members directory channel).
- "Read more" button on the card links to `/status` via TanStack `Link`.

## Visual

- Card styled to match existing home page surfaces (rounded-2xl, `bg-surface`, `border-border`, subtle gradient header consistent with the page).
- Header: "Service Status" with an `Activity` lucide icon.
- Status rows: small coloured dot (emerald for operational, violet/fuchsia/blue per status meta already defined in `status.tsx`) + text label + truncated title.
- Footer: right-aligned "Read more" button linking to `/status`.

## Files changed

- `src/routes/_authenticated/_approved/home.index.tsx` — render the new component immediately after the last channel block.
- `src/components/app/ServiceStatusBox.tsx` *(new)* — self-contained component that fetches active incidents, subscribes to realtime, and renders the card.

## Out of scope

- No schema changes.
- No edits to `/status` page itself.
- No incident detail/description rendering in the box.
